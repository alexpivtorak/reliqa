import { BrowserController } from '../src/agent/BrowserController.js';
import { RecoveryGate } from '../src/agent/RecoveryGate.js';

const results: string[] = [];
function check(label: string, passed: boolean, detail: string) {
    results.push(`${passed ? 'PASS' : 'FAIL'} ${label} ${detail}`);
}

function dataUrl(html: string) {
    return `data:text/html,${encodeURIComponent(html)}`;
}

// Renders in chunks for about 800ms, then adds the control the agent needs.
// A fixed 300ms wait reads this page mid render and reports the button as missing.
const LATE_RENDER = `
<!doctype html><html><body style="margin:0"><main id="root"><h1>Cart</h1></main>
<script>
  let i = 0;
  const timer = setInterval(() => {
    i++;
    const row = document.createElement('p');
    row.textContent = 'chunk ' + i;
    document.getElementById('root').appendChild(row);
    if (i === 8) {
      clearInterval(timer);
      const btn = document.createElement('button');
      btn.setAttribute('data-test', 'late-proceed');
      btn.textContent = 'Proceed to checkout';
      document.getElementById('root').appendChild(btn);
    }
  }, 100);
</script></body></html>`;

// Mutates forever without changing anything the agent can act on. A raw mutation
// count treats this as page churn, which is why the guard compares state instead.
const NEVER_SETTLES = `
<!doctype html><html><body style="margin:0"><main id="root">busy</main>
<script>
  setInterval(() => { document.getElementById('root').setAttribute('data-tick', String(Date.now())); }, 50);
</script></body></html>`;

const EMPTY_CART = `
<!doctype html><html><head><title>Checkout - Shop</title></head><body style="margin:0">
<main>
  <h1>Checkout</h1>
  <h2>Your cart</h2>
  <div role="alert">Your cart is empty</div>
  <form>
    <input data-test="coupon" required placeholder="Coupon code">
    <input data-test="email" required placeholder="Email">
  </form>
</main></body></html>`;

const LAZY_BOTTOM = `
<!doctype html><html><body style="margin:0"><main>
  <h1>Products</h1>
  <div style="height:2200px">tall filler</div>
  <div id="slot"></div>
</main>
<script>
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300 && !document.querySelector('[data-test="lazy-btn"]')) {
      const btn = document.createElement('button');
      btn.setAttribute('data-test', 'lazy-btn');
      btn.textContent = 'Load more';
      document.getElementById('slot').appendChild(btn);
    }
  });
</script></body></html>`;

const browser = new BrowserController('./artifacts/videos');
await browser.launch(true);
await browser.startSession('probe-capture');
const page = browser.page!;

// --- part 2: quiescence and synchronized capture ---
await page.goto(dataUrl(LATE_RENDER));
const startedAt = Date.now();
const late = await browser.captureState();
const lateElapsed = Date.now() - startedAt;
const lateContext = late.context || '';

check('late render is captured', lateContext.includes('late-proceed'), `elapsed=${lateElapsed}ms`);
check('capture reports the page settled', late.quiescent === true, `quiescent=${late.quiescent}`);
check('capture waited for the render to finish', lateElapsed >= 700, `elapsed=${lateElapsed}ms`);
check('screenshot came back with the context', late.screenshot.length > 1000, `bytes=${late.screenshot.length}`);

await page.goto(dataUrl(NEVER_SETTLES));
const busyStartedAt = Date.now();
const busy = await browser.captureState();
const busyElapsed = Date.now() - busyStartedAt;

const tickOne = await page.evaluate(() => (window as any).__reliqaMutations);
await page.waitForTimeout(400);
const tickTwo = await page.evaluate(() => (window as any).__reliqaMutations);

check('mutation counter is installed', typeof tickOne === 'number', `value=${tickOne}`);
check('mutation counter tracks changes', tickTwo > tickOne, `${tickOne} then ${tickTwo}`);
check('a page that never settles is flagged', busy.quiescent === false, `quiescent=${busy.quiescent}`);
check('the settle budget is respected', busyElapsed < 4500, `elapsed=${busyElapsed}ms`);
check('context still comes back for a busy page', busy.context !== null, `context=${busy.context ? 'present' : 'null'}`);
check('mutation noise does not force a recapture', busyElapsed < 4000, `elapsed=${busyElapsed}ms`);

// --- part 3: page state digest ---
await page.goto(dataUrl(EMPTY_CART));
const emptyState = await browser.captureState();
const digest = JSON.parse(emptyState.context || '{}').page;

check('digest reports the empty state', digest?.emptyState === true, `emptyState=${digest?.emptyState}`);
check('digest carries the alert text', (digest?.alerts || []).includes('Your cart is empty'), JSON.stringify(digest?.alerts));
check('digest counts blank required fields', digest?.requiredEmpty === 2, `requiredEmpty=${digest?.requiredEmpty}`);
check('digest lists headings', (digest?.headings || []).includes('Checkout'), JSON.stringify(digest?.headings));
check('digest carries the title', digest?.title === 'Checkout - Shop', `title=${digest?.title}`);

// --- part 1: the sweep behind the recovery gate ---
await page.goto(dataUrl(LAZY_BOTTOM));
await browser.captureState();
const beforeSweep = await page.evaluate(() => window.scrollY);
const sweep = await browser.sweepPage();
const afterSweep = await page.evaluate(() => window.scrollY);
const inventory = JSON.parse(sweep.inventory);
const lazy = inventory.items.find((item: any) => item.dt === 'lazy-btn');

check('sweep finds lazily added content', Boolean(lazy), JSON.stringify(lazy));
check('sweep visits several positions', sweep.positions > 1, `positions=${sweep.positions}`);
check('sweep restores the scroll offset', afterSweep === beforeSweep, `${beforeSweep} then ${afterSweep}`);
check('sweep strips coordinates', inventory.items.every((item: any) => item.c === undefined), 'no c fields');
check('sweep keeps the page digest', Boolean(inventory.page?.title !== undefined), JSON.stringify(inventory.page?.headings));

// --- part 1: gate policy ---
const gate = new RecoveryGate();
check('first fail asks for recovery', gate.consider('Main Goal') === 'recover', 'first call');
check('second fail is accepted', gate.consider('Main Goal') === 'accept', 'second call');
check('each step gets its own budget', gate.consider('Other Step') === 'recover', 'other step');
gate.resetForStep('Main Goal');
check('reset restores the budget', gate.consider('Main Goal') === 'recover', 'after reset');
const prompt = gate.buildPrompt('button not found', '{"items":[]}');
check('prompt repeats the reason', prompt.includes('button not found'), 'reason present');
check('prompt carries the inventory', prompt.includes('{"items":[]}'), 'inventory present');

console.log(results.join('\n'));

await browser.closeSession();
await browser.cleanup();
process.exit(results.some((line) => line.startsWith('FAIL')) ? 1 : 0);
