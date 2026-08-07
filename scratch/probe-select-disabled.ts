import { chromium } from 'playwright';
import fs from 'fs';

const DISTILL_SOURCE = fs.readFileSync(
    new URL('../src/agent/browser/distillInteractiveElements.js', import.meta.url),
    'utf8'
);

// Mirrors BrowserController.captureDOMSnapshot exactly, so the probe measures the
// same signal the agent gets fed back after every action.
const SNAPSHOT = () => {
    const inputs = document.querySelectorAll('input, textarea, select');
    const buttons = document.querySelectorAll('button, input[type="submit"], [role="button"]');
    return {
        url: window.location.href,
        title: document.title,
        inputCount: inputs.length,
        buttonCount: buttons.length,
        head100: (document.body?.innerText || '').slice(0, 100)
    };
};

type Snap = ReturnType<typeof SNAPSHOT>;

function diffSummary(a: Snap, b: Snap): string {
    const changes: string[] = [];
    if (a.url !== b.url) changes.push('url');
    if (a.title !== b.title) changes.push('title');
    if (a.inputCount !== b.inputCount) changes.push('inputCount');
    if (a.buttonCount !== b.buttonCount) changes.push('buttonCount');
    if (a.head100 !== b.head100) changes.push('text(first 100 chars)');
    return changes.length ? changes.join(', ') : 'No changes detected';
}

async function distill(page: any) {
    return JSON.parse(await page.evaluate<string>(DISTILL_SOURCE));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();

console.log('===== PART A: real site, language dropdown (run 12 scenario) =====');
await page.goto('https://practicesoftwaretesting.com', { waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

const s0 = await page.evaluate(SNAPSHOT);
console.log(`first 100 chars of body text: ${JSON.stringify(s0.head100)}`);

await page.click('[data-test="language-select"]');
await page.waitForTimeout(800);
const s1 = await page.evaluate(SNAPSHOT);
console.log(`after opening the menu   -> ${diffSummary(s0, s1)}`);
console.log(`  menu visible in DOM: ${await page.locator('[data-test="lang-de"]').isVisible()}`);

await page.click('[data-test="lang-de"]');
await page.waitForTimeout(1200);
const s2 = await page.evaluate(SNAPSHOT);
console.log(`after picking German     -> ${diffSummary(s1, s2)}`);
console.log(`  nav really translated: ${await page.locator('text=Kategorien').first().isVisible()}`);
console.log(`  title before/after: ${JSON.stringify(s1.title)} / ${JSON.stringify(s2.title)}`);

const homeItems = (await distill(page)).items;
const sortRecord = homeItems.find((i: any) => i.dt === 'sort');
console.log(`\ndistilled record for the native <select data-test="sort">:`);
console.log(`  ${JSON.stringify(sortRecord)}`);
console.log(`  reports options: ${sortRecord && 'options' in sortRecord}`);

console.log('\n===== PART B: native select + disabled button mechanics =====');
await page.setContent(`
<!doctype html><html><body style="margin:0;font-family:sans-serif">
  <h1>Address</h1>
  <select data-test="country" style="height:32px">
    <option value="">Please select a country</option>
    <option value="DE">Germany</option>
    <option value="PL">Poland</option>
  </select>
  <button data-test="proceed-3" disabled style="height:32px">Continue</button>
  <p data-test="log">idle</p>
  <script>
    document.querySelector('[data-test="proceed-3"]')
      .addEventListener('click', () => { document.querySelector('[data-test="log"]').textContent = 'BUTTON FIRED'; });
    document.querySelector('[data-test="country"]')
      .addEventListener('change', (e) => { document.querySelector('[data-test="log"]').textContent = 'COUNTRY=' + e.target.value; });
  </script>
</body></html>
`);

const items = (await distill(page)).items;
const country = items.find((i: any) => i.dt === 'country');
const proceed = items.find((i: any) => i.dt === 'proceed-3');
console.log(`distilled <select data-test="country">: ${JSON.stringify(country)}`);
console.log(`  reports its options: ${country && 'options' in country}`);
console.log(`distilled disabled button:             ${JSON.stringify(proceed)}`);
console.log(`  reports it is disabled: ${proceed && ('disabled' in proceed || 'dis' in proceed)}`);

// How the agent's click path behaves on a disabled button
const beforeClick = await page.evaluate(SNAPSHOT);
const start = Date.now();
let clickError = '';
try {
    await page.click('[data-test="proceed-3"]', { timeout: 5000 });
} catch (e: any) {
    clickError = String(e.message).split('\n')[0];
}
console.log(`\npage.click on the disabled button: threw after ${Date.now() - start}ms`);
console.log(`  error: ${clickError}`);

// The coordinate fallback the executor uses next
const box = await page.locator('[data-test="proceed-3"]').boundingBox();
await page.mouse.click(Math.round(box!.x + box!.width / 2), Math.round(box!.y + box!.height / 2));
await page.waitForTimeout(300);
console.log(`  coordinate fallback threw: no`);
console.log(`  handler fired: ${await page.locator('[data-test="log"]').textContent()}`);
console.log(`  feedback the agent receives: ${diffSummary(beforeClick, await page.evaluate(SNAPSHOT))}`);

// Clicking a native select the way the agent does today
const beforeSelect = await page.evaluate(SNAPSHOT);
await page.click('[data-test="country"]');
await page.waitForTimeout(500);
console.log(`\nclick on the native <select>: ${diffSummary(beforeSelect, await page.evaluate(SNAPSHOT))}`);
console.log(`  option elements newly visible in DOM: ${await page.locator('[data-test="country"] option:visible').count()}`);
console.log(`  select value now: ${JSON.stringify(await page.locator('[data-test="country"]').inputValue())}`);

// What selectOption would do instead
await page.selectOption('[data-test="country"]', 'PL');
await page.waitForTimeout(200);
console.log(`\nselectOption('PL') -> value ${JSON.stringify(await page.locator('[data-test="country"]').inputValue())}, handler: ${await page.locator('[data-test="log"]').textContent()}`);

await browser.close();
