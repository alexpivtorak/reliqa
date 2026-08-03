// Runs inside the browser page, not in Node.
// BrowserController reads this file as text and hands it to page.evaluate, so it is
// never transpiled. Keep it plain JavaScript and keep it as a single expression that
// evaluates to a promise.
//
// Resolves once the DOM has stopped mutating for STABLE_MS, or when the budget runs
// out. Load states are useless on single page apps, where a route change never
// touches the network in a way Playwright can wait for.
(() => new Promise((resolve) => {
    const STABLE_MS = 250;
    const BUDGET_MS = 3000;

    let idleTimer = null;
    let hardStop = null;
    let observer = null;

    function mutationCount() {
        return typeof window.__reliqaMutations === 'number' ? window.__reliqaMutations : 0;
    }

    function stop(settled) {
        if (observer) observer.disconnect();
        clearTimeout(idleTimer);
        clearTimeout(hardStop);
        resolve({ settled: settled, mutations: mutationCount() });
    }

    observer = new MutationObserver(() => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => stop(true), STABLE_MS);
    });

    observer.observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true
    });

    idleTimer = setTimeout(() => stop(true), STABLE_MS);
    hardStop = setTimeout(() => stop(false), BUDGET_MS);
}))()
