// Runs inside the browser page, not in Node.
// BrowserController reads this file as text and hands it to page.evaluate, so it is
// never transpiled and never embedded in a template literal. Keep it plain ES5-safe
// JavaScript and keep it as a single expression that returns a JSON string.
(() => {
    const MAX_VIEWPORT_ITEMS = 300;
    const MAX_OFFSCREEN_ITEMS = 80;
    const MAX_TEXT_LENGTH = 50;
    const MAX_OFFSCREEN_TEXT_LENGTH = 24;
    const INTERACTIVE_TAGS = ['input', 'textarea', 'select', 'button', 'a'];
    const INTERACTIVE_ROLES = ['button', 'link', 'checkbox', 'menuitem', 'tab', 'switch', 'radio', 'combobox', 'listbox', 'option'];
    const TEST_ID_ATTRIBUTES = ['data-test', 'data-testid', 'data-test-id', 'data-qa'];
    const FORM_TAGS = ['input', 'textarea', 'select'];
    const MAX_HEADINGS = 5;
    const MAX_ALERTS = 5;
    const HEADING_TEXT_LENGTH = 60;
    const ALERT_TEXT_LENGTH = 120;
    const DIGEST_LENGTH = 300;
    const MAX_OPTIONS = 60;
    const MAX_OPTION_TEXT = 40;
    const ALERT_SELECTOR = '[role="alert"],[aria-live],.alert,.toast,.error,.invalid-feedback,.help-block';
    const EMPTY_STATE_PATTERN = /(is empty|are empty|no items|no results|no products|nothing found|nothing here|0 results)/i;

    function isVisible(el) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function isInteractive(el) {
        const tag = el.tagName.toLowerCase();
        if (INTERACTIVE_TAGS.indexOf(tag) !== -1) return true;

        const role = el.getAttribute('role');
        if (role && INTERACTIVE_ROLES.indexOf(role) !== -1) return true;

        if (el.hasAttribute('onclick')) return true;
        if (el.isContentEditable) return true;

        // A focusable custom component is worth reporting, but a bare tabindex on a
        // layout container is not. Require something that identifies it as well.
        const tabIndex = el.getAttribute('tabindex');
        if (tabIndex !== null && tabIndex !== '-1') {
            return Boolean(role || el.getAttribute('aria-label') || readTestId(el));
        }

        return false;
    }

    function collectInteractive(root) {
        const found = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);

        let node = walker.nextNode();
        while (node) {
            if (isInteractive(node) && isVisible(node)) {
                found.push(node);
            }
            if (node.shadowRoot) {
                const nested = collectInteractive(node.shadowRoot);
                for (const el of nested) found.push(el);
            }
            node = walker.nextNode();
        }
        return found;
    }

    function readTestId(el) {
        for (const attribute of TEST_ID_ATTRIBUTES) {
            const value = el.getAttribute(attribute);
            if (value) {
                return {
                    value: value,
                    attribute: attribute,
                    // Outer double quotes keep the inner single quotes free of escaping
                    selector: '[' + attribute + '="' + value.replace(/"/g, '\\"') + '"]'
                };
            }
        }
        return null;
    }

    function isOccluded(el, centerX, centerY) {
        const topEl = document.elementFromPoint(centerX, centerY);
        if (!topEl || topEl === el) return false;
        if (el.contains(topEl) || topEl.contains(el)) return false;
        return window.getComputedStyle(topEl).pointerEvents !== 'none';
    }

    // Signed distance to the nearest viewport edge. Negative means above the fold,
    // positive means below it, zero means the element sits on the vertical band the
    // screenshot covers even though it is out of view sideways.
    function verticalOffset(centerY) {
        if (centerY < 0) return centerY;
        if (centerY > window.innerHeight) return centerY - window.innerHeight;
        return 0;
    }

    // Off screen elements are addressable but not clickable by coordinate, so they
    // carry a selector and no c value. Handing out coordinates for something the
    // screenshot does not show is what makes the agent type into empty space.
    function buildRecord(el, centerX, centerY, inViewport) {
        const item = { t: el.tagName.toLowerCase() };

        if (inViewport) {
            item.c = [centerX, centerY];
            item.vp = 1;
        } else {
            item.vp = 0;
            item.dy = verticalOffset(centerY);
        }

        const textLimit = inViewport ? MAX_TEXT_LENGTH : MAX_OFFSCREEN_TEXT_LENGTH;
        const rawText = el.value || (el.textContent || '').trim();
        if (rawText && rawText.length < textLimit) item.txt = rawText;

        if (el.id) item.id = el.id;

        const testId = readTestId(el);
        if (testId) {
            item.dt = testId.value;
            item.da = testId.attribute;
            item.s = testId.selector;
        }

        const label = el.getAttribute('aria-label') ||
            el.getAttribute('placeholder') ||
            el.getAttribute('name');
        if (label) item.l = label;

        if (el.type) item.ty = el.type;

        attachWidgetFields(item, el);

        return item;
    }

    function isAddressable(el) {
        if (readTestId(el)) return true;
        if (el.id) return true;
        if (el.getAttribute('name')) return true;
        if (el.getAttribute('aria-label')) return true;
        if (el.getAttribute('placeholder')) return true;
        return FORM_TAGS.indexOf(el.tagName.toLowerCase()) !== -1;
    }

    function collapse(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    function trimOptionText(text) {
        const collapsed = collapse(text);
        return collapsed.length > MAX_OPTION_TEXT
            ? collapsed.slice(0, MAX_OPTION_TEXT)
            : collapsed;
    }

    function collectNativeOptions(el) {
        const all = [];
        for (const opt of el.options || []) {
            all.push({
                v: opt.value,
                txt: trimOptionText(opt.text || opt.label || opt.value || '')
            });
        }
        const result = { optN: all.length };
        if (all.length > 0) {
            result.opts = all.slice(0, MAX_OPTIONS);
        }
        return result;
    }

    function findOwnedList(el) {
        const ownedId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
        if (!ownedId) return null;
        return document.getElementById(ownedId);
    }

    function collectAriaOptions(listRoot) {
        if (!listRoot) return null;
        const optionEls = listRoot.querySelectorAll('[role="option"],[role="menuitem"],option');
        const all = [];
        for (const opt of optionEls) {
            const text = trimOptionText(opt.getAttribute('aria-label') || opt.textContent || '');
            if (!text) continue;
            const entry = { txt: text };
            const value = opt.getAttribute('data-value') || opt.getAttribute('value');
            if (value) entry.v = value;
            all.push(entry);
        }
        if (all.length === 0) return null;
        return {
            optN: all.length,
            opts: all.slice(0, MAX_OPTIONS)
        };
    }

    function attachWidgetFields(item, el) {
        const tag = el.tagName.toLowerCase();
        const role = (el.getAttribute('role') || '').toLowerCase();

        if (tag === 'select') {
            item.wk = 'select';
            item.val = el.value || '';
            const options = collectNativeOptions(el);
            item.optN = options.optN;
            if (options.opts) item.opts = options.opts;
            return;
        }

        if (role === 'combobox' || (tag === 'input' && role === 'combobox')) {
            item.wk = 'combobox';
            const expanded = el.getAttribute('aria-expanded');
            if (expanded !== null) item.exp = expanded === 'true' ? 1 : 0;
            if (typeof el.value === 'string' && el.value) item.val = el.value;
            // Closed comboboxes have no options in the DOM. Only report opts when open.
            if (expanded === 'true') {
                const owned = collectAriaOptions(findOwnedList(el));
                if (owned) {
                    item.optN = owned.optN;
                    item.opts = owned.opts;
                }
            }
            return;
        }

        if (role === 'listbox') {
            item.wk = 'listbox';
            const owned = collectAriaOptions(el);
            if (owned) {
                item.optN = owned.optN;
                item.opts = owned.opts;
            }
        }
    }

    function visibleTextOf(el, limit) {
        if (!isVisible(el)) return '';
        const text = collapse(el.innerText || el.textContent || '');
        return text.length > limit ? text.slice(0, limit) : text;
    }

    function countVisible(root, selector) {
        let total = 0;
        for (const el of root.querySelectorAll(selector)) {
            if (isVisible(el)) total++;
        }
        return total;
    }

    // Interactive elements alone cannot tell the agent whether a control is missing
    // because the app is in the wrong state. An empty cart and a broken page look
    // identical without this.
    function buildPageDigest() {
        const headings = [];
        for (const el of document.querySelectorAll('h1,h2,h3')) {
            const text = visibleTextOf(el, HEADING_TEXT_LENGTH);
            if (text && headings.indexOf(text) === -1) headings.push(text);
            if (headings.length >= MAX_HEADINGS) break;
        }

        const alerts = [];
        for (const el of document.querySelectorAll(ALERT_SELECTOR)) {
            const text = visibleTextOf(el, ALERT_TEXT_LENGTH);
            if (text && alerts.indexOf(text) === -1) alerts.push(text);
            if (alerts.length >= MAX_ALERTS) break;
        }

        const main = document.querySelector('main') ||
            document.querySelector('[role="main"]') ||
            document.body;
        const mainText = main ? collapse(main.innerText || '') : '';

        let requiredEmpty = 0;
        for (const field of document.querySelectorAll('input[required],select[required],textarea[required]')) {
            if (isVisible(field) && !field.value) requiredEmpty++;
        }

        return {
            url: window.location.href,
            title: document.title,
            headings: headings,
            alerts: alerts,
            rows: main ? countVisible(main, 'tr') : 0,
            listItems: main ? countVisible(main, 'li') : 0,
            requiredEmpty: requiredEmpty,
            emptyState: EMPTY_STATE_PATTERN.test(mainText.slice(0, 2000)),
            digest: mainText.slice(0, DIGEST_LENGTH)
        };
    }

    const viewportItems = [];
    const offscreenItems = [];
    const candidates = collectInteractive(document);

    for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        const centerX = Math.round(rect.x + rect.width / 2);
        const centerY = Math.round(rect.y + rect.height / 2);

        const isOnScreen = centerX >= 0 && centerX <= window.innerWidth &&
            centerY >= 0 && centerY <= window.innerHeight;

        if (isOnScreen) {
            // elementFromPoint only answers for viewport coordinates
            if (isOccluded(el, centerX, centerY)) continue;
            viewportItems.push(buildRecord(el, centerX, centerY, true));
            continue;
        }

        if (!isAddressable(el)) continue;
        offscreenItems.push({
            record: buildRecord(el, centerX, centerY, false),
            distance: Math.abs(verticalOffset(centerY))
        });
    }

    // Nearest to the fold first, so the fields the agent is about to need survive
    // the cap. Sort is stable, so DOM order still decides within one distance.
    offscreenItems.sort((a, b) => a.distance - b.distance);

    const items = viewportItems.slice(0, MAX_VIEWPORT_ITEMS).concat(
        offscreenItems.slice(0, MAX_OFFSCREEN_ITEMS).map((entry) => entry.record)
    );

    const scrollY = Math.round(window.scrollY);
    const scrollHeight = document.documentElement.scrollHeight;

    return JSON.stringify({
        items: items,
        page: buildPageDigest(),
        meta: {
            count: items.length,
            w: window.innerWidth,
            h: window.innerHeight,
            scrollX: Math.round(window.scrollX),
            scrollY: scrollY,
            scrollHeight: scrollHeight,
            moreBelow: window.innerHeight + scrollY < scrollHeight - 5,
            moreAbove: scrollY > 5,
            offscreen: offscreenItems.length,
            offscreenTruncated: offscreenItems.length > MAX_OFFSCREEN_ITEMS
        }
    });
})()
