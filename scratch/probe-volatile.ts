import { classifyTestId, familySelector, isVolatileToken } from '../src/agent/volatileIdentifiers.js';
import { toRankedSelector } from '../src/agent/DiscoveryCrawler.js';
import { BrowserController } from '../src/agent/BrowserController.js';

const results: string[] = [];
function check(label: string, passed: boolean, detail: string) {
    results.push(`${passed ? 'PASS' : 'FAIL'} ${label} ${detail}`);
}

// Tokens that rotate whenever the app is reseeded
const volatile = [
    '01KZ4CHAYW2Z1F53YF71CHB04V',
    '3f2a1c9e-4b5d-4e6f-8a7b-9c0d1e2f3a4b',
    'a3f19c8e77b2d4f10c5e9ab3',
    '1099324',
    'ckl3jd8s9000abc12'
];
for (const token of volatile) {
    check('treats as volatile', isVolatileToken(token) === true, token);
}

// Tokens a plan can rely on
const stable = ['nav-cart', 'add-to-cart', 'proceed-1', 'guest-email', 'tab-2', 'col-3', 'postal_code', 'sort'];
for (const token of stable) {
    check('treats as stable', isVolatileToken(token) === false, token);
}

const product = classifyTestId('product-01KZ4CHAYW2Z1F53YF71CHB04V');
check('product id collapses to a family', product.kind === 'family', JSON.stringify(product));
check('family keeps the separator', product.kind === 'family' && product.prefix === 'product-', JSON.stringify(product));

const category = classifyTestId('category-01KZ4CHAXRH8WQB2QV22WFR4Y9');
check('category id collapses to a family', category.kind === 'family' && category.prefix === 'category-', JSON.stringify(category));

const bare = classifyTestId('01KZ4CHAYW2Z1F53YF71CHB04V');
check('a bare generated id is unusable', bare.kind === 'volatile', JSON.stringify(bare));

const uuidValue = classifyTestId('3f2a1c9e-4b5d-4e6f-8a7b-9c0d1e2f3a4b');
check('a uuid is checked before splitting', uuidValue.kind === 'volatile', JSON.stringify(uuidValue));

const nested = classifyTestId('row_1099324_delete');
check('a volatile middle segment still yields a family', nested.kind === 'family' && nested.prefix === 'row_', JSON.stringify(nested));

for (const token of ['nav-cart', 'add-to-cart', 'proceed-2-guest', 'postal_code']) {
    check('stable test id is left alone', classifyTestId(token).kind === 'stable', token);
}

check(
    'family selector targets the prefix',
    familySelector('data-test', 'product-') === '[data-test^="product-"]',
    familySelector('data-test', 'product-')
);
check(
    'family selector escapes quotes',
    familySelector('data-test', 'pro"duct-') === '[data-test^="pro\\"duct-"]',
    familySelector('data-test', 'pro"duct-')
);

// --- what the crawler now writes into a test plan ---
const productItem = {
    t: 'a',
    dt: 'product-01KZ4CHAYW2Z1F53YF71CHB04V',
    da: 'data-test',
    s: '[data-test="product-01KZ4CHAYW2Z1F53YF71CHB04V"]',
    txt: 'Combination Pliers'
};
const rankedProduct = toRankedSelector(productItem);
check('crawler emits the family selector', rankedProduct?.selector === '[data-test^="product-"]', JSON.stringify(rankedProduct));

const rankedStable = toRankedSelector({ t: 'a', dt: 'nav-cart', da: 'data-test', s: '[data-test="nav-cart"]' });
check('crawler keeps stable test ids exact', rankedStable?.selector === '[data-test="nav-cart"]', JSON.stringify(rankedStable));

const rankedBare = toRankedSelector({ t: 'a', dt: '01KZ4CHAYW2Z1F53YF71CHB04V', da: 'data-test', s: '[data-test="01KZ4CHAYW2Z1F53YF71CHB04V"]' });
check('crawler drops bare generated ids', rankedBare === null, JSON.stringify(rankedBare));

const rankedVolatileId = toRankedSelector({ t: 'button', id: 'btn-1099324', txt: 'Delete' });
check('volatile dom id falls through to text', rankedVolatileId?.selector === "button:has-text('Delete')", JSON.stringify(rankedVolatileId));

const rankedFamilyBeatsCap = toRankedSelector({ t: 'a', dt: 'category-01KZ4CHAXRH8WQB2QV22WFR4Y9', da: 'data-testid' });
check('family selector uses the right attribute', rankedFamilyBeatsCap?.selector === '[data-testid^="category-"]', JSON.stringify(rankedFamilyBeatsCap));

// --- the family selector has to be executable, not just tidy ---
const PRODUCT_GRID = `
<!doctype html><html><body style="margin:0"><main>
  <a data-test="product-01KZ4FZ4Y8AP1ANTBJFM3A0J4X" href="#a">Pliers</a>
  <a data-test="product-01KZ4FZ4YCQQM08FE2V9HTZESS" href="#b">Hammer</a>
  <a data-test="nav-cart" href="#cart">Cart</a>
</main></body></html>`;

const browser = new BrowserController('./artifacts/videos');
await browser.launch(true);
await browser.startSession('probe-volatile');
await browser.page!.goto(`data:text/html,${encodeURIComponent(PRODUCT_GRID)}`);

const familyCount = await browser.page!.locator('[data-test^="product-"]').count();
check('family selector matches reseeded products', familyCount === 2, `count=${familyCount}`);

const firstText = await browser.page!.locator('[data-test^="product-"]').first().innerText();
check('family selector resolves to a real element', firstText === 'Pliers', `text="${firstText}"`);

const staleCount = await browser.page!.locator('[data-test="product-01KZ4CHAYW2Z1F53YF71CHB04V"]').count();
check('the crawl time id is indeed gone', staleCount === 0, `count=${staleCount}`);

console.log(results.join('\n'));

await browser.closeSession();
await browser.cleanup();
process.exit(results.some((line) => line.startsWith('FAIL')) ? 1 : 0);
