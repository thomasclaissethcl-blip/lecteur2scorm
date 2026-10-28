from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).parent.parent
html=(root/'index.html').read_text().replace('<link rel="stylesheet" href="styles.css">','<style>'+(root/'styles.css').read_text()+'</style>')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width in (1440,1250,1150,800,660,390):
        page=browser.new_page(viewport={'width':width,'height':900})
        page.set_content(html,wait_until='domcontentloaded')
        toolbar=page.locator('.player-toolbar').bounding_box()
        external=page.locator('#openWindowBtn').bounding_box()
        stage=page.locator('#dropZone').bounding_box()
        assert toolbar and external and stage
        assert toolbar['y']<=external['y'] and external['y']+external['height']<=toolbar['y']+toolbar['height']+1, (width,'vertical overflow',external,toolbar)
        assert external['y']+external['height']<=stage['y']+1, (width,'overlaps SCO frame',external,stage)
        assert external['x']+external['width']<=toolbar['x']+toolbar['width']+1,(width,'horizontal overflow',external,toolbar)
        if width==1440:page.screenshot(path=str(root/'tests'/'v5-layout-desktop.png'))
        if width==390:page.screenshot(path=str(root/'tests'/'v5-layout-mobile.png'))
        print('LAYOUT OK',width)
        page.close()
    browser.close()
