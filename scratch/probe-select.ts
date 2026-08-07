/**
 * Proves the select action end to end through BrowserController.
 * Covers native selects, ARIA language dropdown, and the checkout country field.
 */
import { BrowserController } from '../src/agent/BrowserController.js';

const BASE = 'https://practicesoftwaretesting.com';
const EMAIL = 'customer@practicesoftwaretesting.com';
const PASSWORD = 'welcome01';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`ASSERT: ${message}`);
}

async function distillItems(browser: BrowserController): Promise<any[]> {
    const raw = await browser.getPageContext();
    assert(raw, 'distiller returned null');
    return JSON.parse(raw).items || [];
}

async function distillPage(browser: BrowserController): Promise<any> {
    const raw = await browser.getPageContext();
    assert(raw, 'distiller returned null');
    return JSON.parse(raw);
}

const browser = new BrowserController('./artifacts/videos');
await browser.launch(true);
await browser.startSession('probe-select');

try {
    // ----- PART A: native sort select on the home page -----
    console.log('===== PART A: native [data-test="sort"] =====');
    await browser.navigate(BASE);
    await browser.page!.waitForTimeout(1500);

    const homeItems = await distillItems(browser);
    const sortRecord = homeItems.find((i: any) => i.dt === 'sort');
    console.log(`distilled sort: ${JSON.stringify(sortRecord)}`);
    assert(sortRecord?.wk === 'select', `sort wk should be select, got ${sortRecord?.wk}`);
    assert(Array.isArray(sortRecord?.opts) && sortRecord.opts.length > 0, 'sort should report opts');
    assert(typeof sortRecord.optN === 'number' && sortRecord.optN >= sortRecord.opts.length, 'sort optN missing');

    const sortOption = sortRecord.opts.find((o: any) => o.v && o.v !== '') || sortRecord.opts[1] || sortRecord.opts[0];
    const sortNotes = await browser.executeActions({
        type: 'select',
        selector: '[data-test="sort"]',
        text: sortOption.v || sortOption.txt,
        reason: 'probe native sort'
    });
    console.log(`sort notes: ${JSON.stringify(sortNotes)}`);
    assert(sortNotes.length === 0, `sort select produced notes: ${sortNotes.join('; ')}`);

    const sortValue = await browser.page!.locator('[data-test="sort"]').inputValue();
    console.log(`sort value after select: ${JSON.stringify(sortValue)}`);
    assert(sortValue === (sortOption.v || sortValue), `sort value mismatch: ${sortValue}`);

    // ----- PART B: ARIA language dropdown -----
    console.log('\n===== PART B: language dropdown (ARIA style) =====');
    const langNotes = await browser.executeActions({
        type: 'select',
        selector: '[data-test="language-select"]',
        text: 'DE',
        reason: 'probe language combobox'
    });
    console.log(`language notes: ${JSON.stringify(langNotes)}`);
    // Accept either DE label match or lang-de data-test match
    if (langNotes.length > 0) {
        const retry = await browser.executeActions({
            type: 'select',
            selector: '[data-test="language-select"]',
            text: 'lang-de',
            reason: 'probe language by data-test'
        });
        console.log(`language retry notes: ${JSON.stringify(retry)}`);
        assert(retry.length === 0, `language select produced notes: ${retry.join('; ')}`);
    }
    await browser.page!.waitForTimeout(1500);
    const triggerText = (await browser.page!.locator('[data-test="language-select"]').innerText()).trim();
    const germanVisible = await browser.page!.locator('text=Kategorien').first().isVisible().catch(() => false);
    console.log(`language trigger text: ${JSON.stringify(triggerText)}, nav German: ${germanVisible}`);
    assert(
        /DE/i.test(triggerText) || germanVisible,
        'language select did not switch UI to German'
    );

    // Switch back to English so the rest of the probe stays readable
    await browser.executeActions({
        type: 'select',
        selector: '[data-test="language-select"]',
        text: 'EN',
        reason: 'restore English'
    });
    await browser.page!.waitForTimeout(800);

    // ----- PART C: checkout address form with country -----
    console.log('\n===== PART C: checkout address form including country =====');

    // Add first product to cart
    await browser.navigate(BASE);
    await browser.page!.waitForTimeout(1500);

    const productLink = browser.page!.locator('[data-test^="product-"]').first();
    if (await productLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await productLink.click();
    } else {
        await browser.page!.locator('.card a').first().click();
    }
    await browser.page!.waitForTimeout(1000);

    await browser.executeActions({
        type: 'click',
        selector: '[data-test="add-to-cart"]',
        reason: 'add to cart'
    });
    await browser.page!.waitForTimeout(1000);

    // Go to cart then checkout
    await browser.executeActions({
        type: 'click',
        selector: '[data-test="nav-cart"]',
        reason: 'open cart'
    });
    await browser.page!.waitForTimeout(1000);

    await browser.executeActions({
        type: 'click',
        selector: '[data-test="proceed-1"]',
        reason: 'proceed to login step'
    });
    await browser.page!.waitForTimeout(1000);

    // Sign in as demo customer
    const emailVisible = await browser.page!.locator('[data-test="email"]').isVisible({ timeout: 3000 }).catch(() => false);
    if (emailVisible) {
        await browser.executeActions([
            { type: 'type', selector: '[data-test="email"]', text: EMAIL, reason: 'email' },
            { type: 'type', selector: '[data-test="password"]', text: PASSWORD, reason: 'password' },
            { type: 'click', selector: '[data-test="login-submit"]', reason: 'login' }
        ]);
        await browser.page!.waitForTimeout(1500);
    }

    // Proceed to address step
    const proceed2 = browser.page!.locator('[data-test="proceed-2"]');
    if (await proceed2.isVisible({ timeout: 5000 }).catch(() => false)) {
        await browser.executeActions({
            type: 'click',
            selector: '[data-test="proceed-2"]',
            reason: 'proceed to address'
        });
        await browser.page!.waitForTimeout(1500);
    }

    // Confirm country widget kind before selecting
    const addressDistill = await distillPage(browser);
    const countryRecord = (addressDistill.items || []).find((i: any) => i.dt === 'country');
    console.log(`distilled country: ${JSON.stringify({
        t: countryRecord?.t,
        wk: countryRecord?.wk,
        val: countryRecord?.val,
        optN: countryRecord?.optN,
        optsSample: countryRecord?.opts?.slice(0, 5)
    })}`);
    assert(countryRecord, 'country field missing from distill');
    assert(countryRecord.wk === 'select', `country wk should be select, got ${countryRecord.wk}`);
    assert(typeof countryRecord.optN === 'number' && countryRecord.optN > 0, 'country should report options');
    assert(Array.isArray(countryRecord.opts) && countryRecord.opts.length > 0, 'country opts missing');

    // Fill address fields (house_number is required by the form's continue enablement)
    await browser.executeActions([
        { type: 'type', selector: '[data-test="street"]', text: 'Test Street 1', reason: 'address' },
        { type: 'type', selector: '[data-test="house_number"]', text: '12', reason: 'house number' },
        { type: 'type', selector: '[data-test="city"]', text: 'Warsaw', reason: 'city' },
        { type: 'type', selector: '[data-test="state"]', text: 'Mazovia', reason: 'state' },
        { type: 'type', selector: '[data-test="postal_code"]', text: '00-001', reason: 'postcode' }
    ]);

    // Prefer Poland: value may be outside the distilled opts cap, but selectOption still resolves it
    const poland = (countryRecord.opts as any[]).find(
        (o) => o.v === 'PL' || /poland/i.test(o.txt || '')
    );
    const countryChoice = poland || { v: 'PL', txt: 'Poland' };
    console.log(`choosing country: ${JSON.stringify(countryChoice)}`);

    const countryNotes = await browser.executeActions({
        type: 'select',
        selector: '[data-test="country"]',
        text: countryChoice.v || countryChoice.txt || 'PL',
        reason: 'set country'
    });
    console.log(`country notes: ${JSON.stringify(countryNotes)}`);
    assert(countryNotes.length === 0, `country select produced notes: ${countryNotes.join('; ')}`);

    const countryValue = await browser.page!.locator('[data-test="country"]').inputValue();
    console.log(`country value: ${JSON.stringify(countryValue)}`);
    assert(countryValue && countryValue !== '', 'country value still empty after select');
    assert(countryValue === 'PL' || countryValue === (countryChoice.v || countryValue),
        `expected PL (or ${countryChoice.v}), got ${countryValue}`);

    // Re-distill and check requiredEmpty
    const after = await distillPage(browser);
    console.log(`requiredEmpty after fill: ${after.page?.requiredEmpty}`);

    // Continue should be enabled now
    const proceed3 = browser.page!.locator('[data-test="proceed-3"]');
    await browser.page!.waitForTimeout(500);
    const disabled = await proceed3.isDisabled().catch(() => true);
    console.log(`proceed-3 disabled: ${disabled}`);
    assert(!disabled, 'Continue (proceed-3) still disabled after filling address including country');

    await browser.executeActions({
        type: 'click',
        selector: '[data-test="proceed-3"]',
        reason: 'proceed to payment'
    });
    await browser.page!.waitForTimeout(1500);

    const paymentVisible =
        (await browser.page!.locator('[data-test="payment-method"]').isVisible({ timeout: 5000 }).catch(() => false)) ||
        (await browser.page!.locator('text=Payment').first().isVisible({ timeout: 3000 }).catch(() => false));
    console.log(`reached payment step: ${paymentVisible}`);
    assert(paymentVisible, 'did not reach payment step after address form');

    console.log('\n✅ probe-select passed: native select, ARIA language, and checkout country all work');
} catch (e) {
    console.error('\n❌ probe-select failed:', e);
    try {
        const shot = await browser.getScreenshot();
        const fs = await import('fs');
        fs.writeFileSync('./artifacts/screenshots/probe-select-failure.jpg', shot);
        console.error('Saved failure screenshot to artifacts/screenshots/probe-select-failure.jpg');
    } catch { }
    process.exitCode = 1;
} finally {
    await browser.closeSession();
    await browser.cleanup();
}
