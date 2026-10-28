"""End-to-end browser test with an actual local HTTP server and real Service Worker."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from zipfile import ZipFile
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import functools
root=Path(__file__).parent.parent
manifest='''<?xml version="1.0"?><manifest identifier="debug-test" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata><organizations default="o"><organization identifier="o"><title>V5 diagnostic</title><item identifier="sco" identifierref="r"><title>Contenu de test</title></item></organization></organizations><resources><resource identifier="r" type="webcontent" adlcp:scormtype="sco" href="start.html"><file href="start.html"/></resource></resources></manifest>'''
html='''<!doctype html><html><head><script>throw new Error('ERREUR PRECOCE V5');</script></head><body><p id="display">Contenu visible</p><script>parent.API.LMSInitialize('');</script></body></html>'''
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
with TemporaryDirectory() as tmp:
    fixture=Path(tmp)/'debug-v5.zip'
    with ZipFile(fixture,'w') as z:
        z.writestr('imsmanifest.xml',manifest)
        z.writestr('start.html',html)
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
    thread=Thread(target=server.serve_forever,daemon=True);thread.start()
    base=f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
            for width in (1440,1100,800,390):
                context=browser.new_context(viewport={'width':width,'height':900})
                page=context.new_page()
                errors=[]
                page.on('pageerror',lambda e: errors.append(str(e)))
                page.goto(base,wait_until='domcontentloaded',timeout=30000)
                page.wait_for_timeout(750)
                print('BROWSER',width,'status',page.locator('#statusBadge').inner_text())
                page.locator('#zipInput').set_input_files(str(fixture))
                frame=page.frame_locator('#scoFrame')
                frame.locator('#display').wait_for(timeout=14000)
                toolbar=page.locator('.player-toolbar').bounding_box()
                external=page.locator('#openWindowBtn').bounding_box()
                stage=page.locator('#dropZone').bounding_box()
                print('LAYOUT', width,'toolbar',toolbar,'external',external,'stage',stage)
                assert toolbar and external and stage
                assert external['y']>=toolbar['y'] and external['y']+external['height']<=toolbar['y']+toolbar['height']+1, 'button outside toolbar'
                assert external['y']+external['height']<stage['y']+3, 'external window button overlaps viewport'
                page.locator('#contentDebugBtn').click()
                page.locator('#contentDiagModeBtn').click()
                frame.locator('#display').wait_for(timeout=14000)
                page.wait_for_timeout(1300)
                report=page.evaluate('document.querySelector("#contentDiagList").innerText')
                print('DIAGNOSTIC',width,'caught', 'ERREUR PRECOCE V5' in report,report[:200].replace('\n',' | '))
                assert 'ERREUR PRECOCE V5' in report, 'early error not captured'
                assert not errors,errors
                if width==1440: page.screenshot(path=str(root/'tests'/'ui-v5-desktop.png'))
                if width==390: page.screenshot(path=str(root/'tests'/'ui-v5-mobile.png'))
                context.close()
            browser.close()
    finally:
        server.shutdown()
print('BROWSER V5 E2E PASSED')
