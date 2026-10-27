"""UI regression on an inline, self-contained page (no web server required).
Requires Python Playwright and Chromium; optional for GitHub Pages deployment.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
root = Path(__file__).parent.parent
html = (root/'index.html').read_text().replace('<meta charset="utf-8">','<meta charset="utf-8"><base href="https://example.invalid/">')
html = html.replace('<link rel="stylesheet" href="styles.css">','<style>'+(root/'styles.css').read_text()+'</style>')
for source in ['zip-reader.js','manifest.js','scorm-runtime.js','moodle-simulator.js','app.js']:
    html = html.replace(f'<script src="{source}"></script>',f'<script>{(root/source).read_text()}</script>')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':900})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content(html, wait_until='domcontentloaded')
    assert page.locator('html').get_attribute('data-theme')=='dark'
    assert page.locator('button[data-tab="moodle"]').inner_text()=='Moodle'
    page.locator('.help-trigger[data-help="gradeMethod"]').click()
    assert page.locator('#helpPopover').is_visible()
    assert 'méthode' in page.locator('#helpPopover').inner_text().lower()
    page.keyboard.press('Escape')
    assert not page.locator('#helpPopover').is_visible()
    page.locator('#gradeMethod').select_option('average')
    assert page.locator('#gradeMethod').input_value()=='average'
    assert page.locator('#gradeMethod option:checked').evaluate('(o) => getComputedStyle(o).color')=='rgb(255, 255, 255)'
    page.locator('#themeToggle').click()
    assert page.locator('html').get_attribute('data-theme')=='light'
    page.locator('#themeToggle').click()
    assert page.locator('html').get_attribute('data-theme')=='dark'
    page.screenshot(path=str(root/'tests'/'ui-dark-preview.png'), full_page=True)
    mobile=browser.new_page(viewport={'width':390,'height':844})
    mobile.set_content(html,wait_until='domcontentloaded')
    assert mobile.evaluate('document.documentElement.scrollWidth') <= 390
    assert mobile.locator('button[data-tab="moodle"]').is_visible()
    assert not errors, errors
    print('BROWSER UI PASSED: dark/light, contrast, tooltips, dropdowns, 390px layout')
    browser.close()
