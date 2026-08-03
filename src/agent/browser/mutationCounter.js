// Runs inside the browser page, not in Node.
// Installed as an init script on every document and re-checked before each capture,
// because document.write and setContent replace the document and take the observer
// with them. The tally lets the controller tell whether the page moved between the
// screenshot and the DOM read, which is how stale context slips into the prompt.
(() => {
    if (typeof window.__reliqaMutations === 'number') return false;

    window.__reliqaMutations = 0;

    new MutationObserver((records) => {
        window.__reliqaMutations += records.length;
    }).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true
    });

    return true;
})()
