"""Run on local HTTP server : python -m http.server 8123
Requires separately installed Python Playwright; not required to publish the site.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1440, 'height':900}, accept_downloads=True)
    page = context.new_page()
    page.on('pageerror', lambda e: print('JS ERROR',e))
    page.on('console', lambda m: print('CONSOLE', m.text) if m.type == 'error' else None)
    try:
        page.goto('http://127.0.0.1:8123/',wait_until='networkidle')
        page.wait_for_timeout(1200)
        page.locator('#zipInput').set_input_files(str(Path(__file__).parent/'_fixture-scorm12.zip'))
        page.locator('#packageTitle').get_by_text('Package de test').wait_for(timeout=15000)
        frame=page.frame_locator('#scoFrame')
        frame.locator('#write').wait_for(timeout=8000)
        print('PACKAGE',page.locator('#packageTitle').inner_text())
        print('INIT',frame.locator('body').get_attribute('data-init'))
        frame.locator('#write').click()
        print('LIVE_SCORE',page.locator('#moodleScore').inner_text())
        print('LIVE_NOTE',page.locator('#moodleGrade').inner_text())
        print('PENDING',page.locator('#saveIndicator').inner_text())
        page.locator('#moodleScope').select_option('saved')
        print('SAVED_BEFORE',page.locator('#moodleScore').inner_text())
        frame.locator('#commit').click()
        print('SAVED_AFTER',page.locator('#moodleScore').inner_text())
        page.locator('#statusRequired').select_option('completed')
        print('COMPLETION_ONE',page.locator('#moodleCompletion').inner_text())
        page.locator('#allScos').check()
        print('COMPLETION_ALL',page.locator('#moodleCompletion').inner_text())
        page.locator('#nextBtn').click()
        frame.locator('#write').wait_for(timeout=8000)
        frame.locator('#write').click()
        frame.locator('#commit').click()
        print('COMPLETION_TWO',page.locator('#moodleCompletion').inner_text())
        print('LOG_COUNT',page.locator('#logCount').inner_text())
        page.locator('#newAttemptBtn').click()
        print('ATTEMPT',page.locator('#attemptSelect').input_value())
        page.screenshot(path='/mnt/data/scorm-screenshot.png')
    finally:
        browser.close()
