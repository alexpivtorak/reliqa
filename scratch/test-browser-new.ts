import { chromium } from 'playwright';

async function main() {
    console.log('Starting headless browser...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
    });

    page.on('pageerror', err => {
        console.error(`[BROWSER ERROR] ${err.message}`);
    });

    try {
        console.log('Navigating to http://localhost:3000/new...');
        await page.goto('http://localhost:3000/new', { timeout: 10000 });
        console.log('Navigation complete! Waiting 5 seconds...');
        await page.waitForTimeout(5000);
        console.log('Done waiting.');
    } catch (e) {
        console.error('Navigation failed/timed out:', e);
    } finally {
        await browser.close();
    }
}

main();
