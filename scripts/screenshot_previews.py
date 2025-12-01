import asyncio
import os
from pyppeteer import launch

REPO_ROOT = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
TMP_DIR = os.path.join(REPO_ROOT, 'tmp')

FILES = [
    'preview_email_utils_reset.html',
    'preview_firebed_reset.html'
]

async def run():
    browser = await launch(args=['--no-sandbox'], headless=True)
    try:
        page = await browser.newPage()
        await page.setViewport({'width': 900, 'height': 1200})

        for fname in FILES:
            html_path = os.path.join(TMP_DIR, fname)
            if not os.path.exists(html_path):
                print('Missing preview file:', html_path)
                continue
            url = 'file://' + os.path.abspath(html_path)
            print('Loading', url)
            await page.goto(url, {'waitUntil': 'networkidle0', 'timeout': 10000})
            # small delay to allow rendering
            await asyncio.sleep(0.3)
            out_png = os.path.join(TMP_DIR, fname.replace('.html', '.png'))
            print('Screenshot ->', out_png)
            await page.screenshot({'path': out_png, 'fullPage': True})
    finally:
        await browser.close()

if __name__ == '__main__':
    asyncio.get_event_loop().run_until_complete(run())
