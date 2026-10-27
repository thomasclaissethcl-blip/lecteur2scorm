"""Browser regression: real iframe pagehide/unload calling SCORM 1.2 API.
Runs with Playwright/Chromium, no HTTP server or external assets needed.
Only the test harness injects hooks: production scripts are unchanged.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).parent.parent
html = (root / 'index.html').read_text()
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8"><base href="https://example.invalid/scorm/">')
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + (root / 'styles.css').read_text() + '</style>')
html = html.replace('<body>', '''<body><script>
window.__testEvents = [];
const __storage = new Map();
Object.defineProperty(window,'localStorage',{configurable:true,value:{
  getItem:k => __storage.get(k) ?? null,
  setItem:(k,v) => __storage.set(k,String(v)),
  removeItem:k => __storage.delete(k),
  key:i => [...__storage.keys()][i] ?? null,
  get length() { return __storage.size; }
}});
</script>''')
for file in ['zip-reader.js','manifest.js','scorm-runtime.js','moodle-simulator.js','app.js']:
    source = (root / file).read_text()
    if file == 'app.js':
        source = source.replace('function launchUrl(href) {', 'function launchUrl(href) { if (window.__testBlobUrls?.[href]) return window.__testBlobUrls[href];')
        source = source.replace('function appendCacheBuster(url) {', 'function appendCacheBuster(url) { if (url.startsWith("blob:")) return url;')
        source = source.replace("  document.addEventListener('DOMContentLoaded', init);", """  document.addEventListener('DOMContentLoaded', init);
  window.__studioTest = {
    setup: async () => {
      const itemA = {identifier:'a',href:'a.html',title:'SCO A'};
      const itemB = {identifier:'b',href:'b.html',title:'SCO B'};
      packageState = {hash:'fixture-2026',virtualRoot:'https://example.invalid/scorm/__scorm__/fixture-2026/',
        manifest:{standard:'SCORM 1.2',launchableItems:[itemA,itemB],metadata:{},manifestPath:'imsmanifest.xml'}};
      await launchItem(itemA);
    },
    launch: (itemIndex, reload=false) => launchItem(packageState.manifest.launchableItems[itemIndex],reload),
    close: () => closeActiveSession(),
    resume: () => resumeActiveSession(),
    reset: () => resetAllProgress(),
    logs: () => logs.map(e=>({method:e.method,result:e.result,errorCode:e.errorCode})),
    current: () => ({key:runtime?.storageKey, initialized:runtime?.initialized, stored:runtime?.savedData, paused:sessionPaused, entry:runtime?.data['cmi.core.entry']})
  };""")
    html = html.replace(f'<script src="{file}"></script>', '<script>' + source + '</script>')

sco = '''<!doctype html><html><body><h1>H5P / SCO simulé</h1>
<script>
const api = parent.API;
parent.__testEvents.push(['initialize',api.LMSInitialize('')]);
api.LMSSetValue('cmi.core.lesson_status','incomplete');
window.addEventListener('pagehide', () => {
 parent.__testEvents.push(['get',api.LMSGetValue('cmi.core.lesson_status'),api.LMSGetLastError()]);
 parent.__testEvents.push(['exit',api.LMSSetValue('cmi.core.exit','suspend'),api.LMSGetLastError()]);
 parent.__testEvents.push(['session_time',api.LMSSetValue('cmi.core.session_time','0000:00:08.34'),api.LMSGetLastError()]);
 parent.__testEvents.push(['finish',api.LMSFinish(''),api.LMSGetLastError()]);
});
</script></body></html>'''

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 860})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content(html, wait_until='domcontentloaded')
    page.wait_for_timeout(100)
    page.evaluate('''(html) => {
      const blobUrl=URL.createObjectURL(new Blob([html],{type:'text/html'}));
      window.__testBlobUrls={'a.html':blobUrl,'b.html':blobUrl};
    }''', sco)
    page.evaluate('window.__studioTest.setup()')
    page.wait_for_function('window.__testEvents.some(e=>e[0]==="initialize")')
    page.evaluate('window.__studioTest.launch(0,true)')
    page.wait_for_function('window.__testEvents.filter(e=>e[0]==="initialize").length >= 2')
    events = page.evaluate('window.__testEvents')
    assert events[0] == ['initialize','true'], events
    assert events[1:5] == [['get','incomplete','0'],['exit','true','0'],['session_time','true','0'],['finish','true','0']], events
    assert all(e['errorCode'] != 301 for e in page.evaluate('window.__studioTest.logs()'))
    assert page.evaluate('window.__studioTest.current().initialized')
    page.evaluate('window.confirm=()=>true')
    page.evaluate('window.__studioTest.close()')
    page.wait_for_function('window.__studioTest.current().paused')
    page.evaluate('window.__studioTest.resume()')
    page.wait_for_function('window.__testEvents.filter(e=>e[0]==="initialize").length >= 3')
    assert page.evaluate('window.__studioTest.current().entry') == 'resume'
    page.evaluate('window.__studioTest.reset()')
    page.wait_for_function('window.__testEvents.filter(e=>e[0]==="initialize").length >= 3')
    assert page.evaluate('window.__studioTest.current().stored') is None, 'Reset must clear previous progress after unload'
    page.evaluate('window.__studioTest.launch(1,false)')
    page.wait_for_function('window.__testEvents.filter(e=>e[0]==="initialize").length >= 4')
    assert all(e['errorCode'] != 301 for e in page.evaluate('window.__studioTest.logs()'))
    assert not errors, errors
    print('BROWSER LIFECYCLE PASSED: close/resume/reset/SCO navigation; no SCORM 301; correct Finish order')
    browser.close()
