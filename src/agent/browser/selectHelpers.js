// Runs inside the browser page via page.evaluate / locator.evaluate.
// Kept as plain JS so tsx cannot inject the __name helper into serialized closures.

export function resolveWidgetKindInPage(el) {
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (tag === 'select') return 'select';
    if (role === 'combobox') return 'combobox';
    if (role === 'listbox') return 'listbox';
    if (tag === 'button' || tag === 'div' || tag === 'span') {
        if (el.getAttribute('aria-haspopup') === 'listbox' ||
            el.getAttribute('aria-haspopup') === 'menu' ||
            el.getAttribute('aria-expanded') !== null) {
            return 'combobox';
        }
    }
    return 'unknown';
}

export function readTriggerState(el) {
    const input = el;
    return (
        (typeof input.value === 'string' ? input.value : '') ||
        (el.textContent || '').trim() ||
        el.getAttribute('aria-activedescendant') ||
        ''
    );
}

export function readTagAndRole(el) {
    return {
        tag: el.tagName.toLowerCase(),
        role: (el.getAttribute('role') || '').toLowerCase(),
        expanded: el.getAttribute('aria-expanded'),
        controls: el.getAttribute('aria-controls') || el.getAttribute('aria-owns') || ''
    };
}

export function matchNativeOptions(el, target) {
    const select = el;
    const options = [];
    for (let i = 0; i < select.options.length; i++) {
        const opt = select.options[i];
        options.push({ value: opt.value, label: (opt.text || '').trim() });
    }

    const needle = String(target || '').replace(/\s+/g, ' ').trim().toLowerCase();
    let match = null;

    for (let i = 0; i < options.length; i++) {
        const valueNorm = String(options[i].value || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const labelNorm = String(options[i].label || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (valueNorm === needle || labelNorm === needle) {
            match = options[i];
            break;
        }
    }

    if (!match) {
        for (let i = 0; i < options.length; i++) {
            const labelNorm = String(options[i].label || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (labelNorm.indexOf(needle) !== -1 || needle.indexOf(labelNorm) !== -1) {
                match = options[i];
                break;
            }
        }
    }

    const closest = [];
    for (let i = 0; i < options.length && closest.length < 8; i++) {
        if (options[i].label) closest.push(options[i].label);
    }

    return { match: match, closest: match ? [] : closest };
}

export function labelMatchesSelected(el, target) {
    const select = el;
    const selected = select.options[select.selectedIndex];
    return selected
        ? selected.text.trim() === target || select.value === target
        : false;
}

export function findAriaOptionMatch(target) {
    const needle = String(target || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const nodes = Array.from(document.querySelectorAll(
        '[role="option"],[role="menuitem"],[data-test^="lang-"]'
    ));

    const entries = [];
    for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;

        const text = (
            el.getAttribute('aria-label') ||
            el.getAttribute('data-test') ||
            el.textContent ||
            ''
        ).replace(/\s+/g, ' ').trim();
        if (!text) continue;

        entries.push({
            index: i,
            text: text,
            testId: el.getAttribute('data-test') || '',
            // Prefer the leaf control that carries a test id over a wrapping menuitem
            score: el.getAttribute('data-test') ? 2 : (el.getAttribute('role') === 'option' ? 1 : 0)
        });
    }

    let best = null;
    for (let i = 0; i < entries.length; i++) {
        const textNorm = entries[i].text.replace(/\s+/g, ' ').trim().toLowerCase();
        const idNorm = entries[i].testId.replace(/\s+/g, ' ').trim().toLowerCase();
        const exact = textNorm === needle || idNorm === needle || idNorm === 'lang-' + needle;
        if (!exact) continue;
        if (!best || entries[i].score > best.score) best = entries[i];
    }
    if (best) return { index: best.index, text: best.text, testId: best.testId, closest: [] };

    for (let i = 0; i < entries.length; i++) {
        const textNorm = entries[i].text.replace(/\s+/g, ' ').trim().toLowerCase();
        if (textNorm.indexOf(needle) !== -1 || needle.indexOf(textNorm) !== -1) {
            if (!best || entries[i].score > best.score) best = entries[i];
        }
    }
    if (best) return { index: best.index, text: best.text, testId: best.testId, closest: [] };

    const closest = [];
    for (let i = 0; i < entries.length && closest.length < 8; i++) {
        closest.push(entries[i].text);
    }
    return { index: -1, text: '', testId: '', closest: closest };
}

export function clickAriaOption(target) {
    const wantedText = String(target && target.text ? target.text : target || '').replace(/\s+/g, ' ').trim();
    const wantedTestId = String(target && target.testId ? target.testId : '').replace(/\s+/g, ' ').trim();
    const needle = wantedText.toLowerCase();
    const idNeedle = wantedTestId.toLowerCase();

    const nodes = Array.from(document.querySelectorAll(
        '[role="option"],[role="menuitem"],[data-test^="lang-"]'
    ));

    // Prefer an exact data-test match when the finder provided one
    if (idNeedle) {
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            const dt = (el.getAttribute('data-test') || '').toLowerCase();
            if (dt === idNeedle) {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
                el.click();
                return (el.textContent || '').replace(/\s+/g, ' ').trim() || dt;
            }
        }
    }

    let fallback = null;
    for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;

        const text = (
            el.getAttribute('aria-label') ||
            el.getAttribute('data-test') ||
            el.textContent ||
            ''
        ).replace(/\s+/g, ' ').trim();
        const textNorm = text.toLowerCase();
        const idNorm = (el.getAttribute('data-test') || '').toLowerCase();
        const score = el.getAttribute('data-test') ? 2 : (el.getAttribute('role') === 'option' ? 1 : 0);

        if (textNorm === needle ||
            idNorm === needle ||
            idNorm === 'lang-' + needle ||
            textNorm.indexOf(needle) !== -1 ||
            needle.indexOf(textNorm) !== -1) {
            if (!fallback || score > fallback.score) {
                fallback = { el: el, text: text, score: score };
            }
        }
    }

    if (fallback) {
        fallback.el.click();
        return fallback.text;
    }
    return null;
}

export function pageHoldsChoice(target) {
    const needle = String(target || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const body = (document.body && document.body.innerText ? document.body.innerText : '').slice(0, 4000);
    return body.replace(/\s+/g, ' ').trim().toLowerCase().indexOf(needle) !== -1;
}
