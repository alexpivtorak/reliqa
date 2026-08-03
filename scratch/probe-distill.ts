import { chromium } from 'playwright';
import fs from 'fs';

const DISTILL_SOURCE = fs.readFileSync(
    new URL('../src/agent/browser/distillInteractiveElements.js', import.meta.url),
    'utf8'
);

const PAGE = `
<!doctype html>
<html><body style="margin:0;font-family:sans-serif">
  <h1 style="height:120px">Billing Address</h1>
  <form>
    <input data-test="street" placeholder="Your Street" style="display:block;height:40px;margin:10px">
    <input data-test="city" placeholder="Your City" style="display:block;height:40px;margin:10px">
    <div style="height:600px">spacer that pushes the rest below the fold</div>
    <input data-test="state" placeholder="Your State" style="display:block;height:40px;margin:10px">
    <input data-test="country" placeholder="Your Country" style="display:block;height:40px;margin:10px">
    <button data-test="proceed-3" style="display:block;margin:10px">Continue</button>
  </form>
  <div style="height:400px"></div>
</body></html>
`;

type Item = {
    t: string;
    vp: number;
    dy?: number;
    c?: [number, number];
    dt?: string;
    s?: string;
};

async function distill(page: any) {
    const raw = await page.evaluate<string>(DISTILL_SOURCE);
    return JSON.parse(raw) as { items: Item[]; meta: Record<string, unknown> };
}

function find(items: Item[], testId: string) {
    return items.find((item) => item.dt === testId);
}

const results: string[] = [];
function check(label: string, passed: boolean, detail: string) {
    results.push(`${passed ? 'PASS' : 'FAIL'} ${label} ${detail}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
await page.setContent(PAGE);

const before = await distill(page);
const city = find(before.items, 'city');
const state = find(before.items, 'state');
const proceed = find(before.items, 'proceed-3');

check('city is in viewport', city?.vp === 1 && Array.isArray(city?.c), JSON.stringify(city));
check('state is reported while off screen', Boolean(state), JSON.stringify(state));
check('state has no coordinates', state ? state.c === undefined : false, `c=${state?.c}`);
check('state has a usable selector', state?.s === '[data-test="state"]', `s=${state?.s}`);
check('state dy is below the fold', (state?.dy ?? 0) > 0, `dy=${state?.dy}`);
check('button below the fold is reported', proceed?.vp === 0, JSON.stringify(proceed));
check('meta says more page below', before.meta.moreBelow === true, JSON.stringify(before.meta));

// The whole point of the fix: a selector for an off screen field just works
await page.fill('[data-test="state"]', 'CA');
const filled = await page.inputValue('[data-test="state"]');
check('fill by selector auto scrolls and lands', filled === 'CA', `value="${filled}"`);

const after = await distill(page);
const stateAfter = find(after.items, 'state');
check('state is in viewport after fill', stateAfter?.vp === 1 && Array.isArray(stateAfter?.c), JSON.stringify(stateAfter));
check('meta tracks the new scroll offset', (after.meta.scrollY as number) > 0, `scrollY=${after.meta.scrollY}`);

console.log(results.join('\n'));
console.log(`\nmeta before: ${JSON.stringify(before.meta)}`);
console.log(`meta after:  ${JSON.stringify(after.meta)}`);

await browser.close();
process.exit(results.some((line) => line.startsWith('FAIL')) ? 1 : 0);
