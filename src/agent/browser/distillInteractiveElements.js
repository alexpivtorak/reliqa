// Runs inside the browser page, not in Node.
// BrowserController reads this file as text and hands it to page.evaluate, so it is
// never transpiled and never embedded in a template literal. Keep it plain ES5-safe
// JavaScript and keep it as a single expression that returns a JSON string.
(() => {
    const MAX_ITEMS = 300;
    const MAX_TEXT_LENGTH = 50;
    const INTERACTIVE_TAGS = ['input', 'textarea', 'select', 'button', 'a'];
    const INTERACTIVE_ROLES = ['button', 'link', 'checkbox', 'menuitem', 'tab', 'switch', 'radio'];
    const TEST_ID_ATTRIBUTES = ['data-test', 'data-testid', 'data-test-id', 'data-qa'];

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

    const items = [];
    const candidates = collectInteractive(document);

    for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        const centerX = Math.round(rect.x + rect.width / 2);
        const centerY = Math.round(rect.y + rect.height / 2);

        const isOnScreen = centerX >= 0 && centerX <= window.innerWidth &&
            centerY >= 0 && centerY <= window.innerHeight;
        if (!isOnScreen) continue;
        if (isOccluded(el, centerX, centerY)) continue;

        const item = {
            t: el.tagName.toLowerCase(),
            c: [centerX, centerY]
        };

        const rawText = el.value || (el.textContent || '').trim();
        if (rawText && rawText.length < MAX_TEXT_LENGTH) item.txt = rawText;

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

        items.push(item);
    }

    return JSON.stringify({
        items: items.slice(0, MAX_ITEMS),
        meta: {
            count: items.length,
            w: window.innerWidth,
            h: window.innerHeight
        }
    });
})()
