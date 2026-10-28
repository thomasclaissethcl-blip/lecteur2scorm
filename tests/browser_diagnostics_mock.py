"""Visual regression for diagnostics without relying on external/localhost HTTP."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).parent.parent
html=(root/'index.html').read_text().replace('<meta charset="utf-8">','<meta charset="utf-8"><base href="https://example.invalid/">').replace('<link rel="stylesheet" href="styles.css">','<style>'+(root/'styles.css').read_text()+'</style>')
html=html.replace('<body>','''<body><script>const __store=new Map();
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>__store.get(k)||null,
 setItem:(k,v)=>__store.set(k,String(v)),removeItem:k=>__store.delete(k),key:i=>[...__store.keys()][i]||null,
 get length(){return __store.size;}}});</script>''')
for filename in ['zip-reader.js','manifest.js','scorm-runtime.js','moodle-simulator.js','app.js']:
    source=(root/filename).read_text()
    if filename=='app.js':
        source=source.replace("  document.addEventListener('DOMContentLoaded', init);", """  document.addEventListener('DOMContentLoaded', init);
  window.__mockIssue=(text)=>reportContentIssue('mock-missing',text,'SIM:ressource','404 dans le ZIP');
  window.__mockOpen=()=>toggleContentDiagnostics(true);
  """)
    html=html.replace(f'<script src="{filename}"></script>','<script>'+source+'</script>')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':900})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content(html,wait_until='domcontentloaded')
    page.evaluate('window.__mockIssue("Fichier manquant : H5P/asset.js")')
    assert page.locator('#contentAlert').is_visible()
    assert 'H5P/asset.js' in page.locator('#contentAlertText').inner_text()
    page.locator('#contentAlertDetails').click()
    assert page.locator('#contentDiagnostics').is_visible()
    assert 'H5P/asset.js' in page.locator('#contentDiagList').inner_text()
    page.locator('#contentDiagClose').click()
    page.locator('.tab[data-tab="log"]').click()
    page.locator('#logFilter').select_option('resources')
    assert 'SIM:ressource' in page.locator('#logList').inner_text()
    assert not errors, errors
    page.screenshot(path=str(root/'tests'/'ui-diagnostics-preview.png'))
    print('BROWSER DIAGNOSTICS PASSED: visible notice, expandable panel, resource log filter; no JavaScript exceptions')
    browser.close()
