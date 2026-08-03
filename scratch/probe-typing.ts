import { BrowserController } from '../src/agent/BrowserController.js';

const PAGE = `
<!doctype html>
<html><body style="margin:0;font-family:sans-serif">
  <h1 style="height:120px">Billing Address</h1>
  <input data-test="city" placeholder="Your City" style="display:block;height:40px;margin:10px">
  <div style="height:600px">empty space, nothing to type into down here</div>
  <input data-test="state" placeholder="Your State" style="display:block;height:40px;margin:10px">
</body></html>
`;

const results: string[] = [];
function check(label: string, passed: boolean, detail: string) {
    results.push(`${passed ? 'PASS' : 'FAIL'} ${label} ${detail}`);
}

const browser = new BrowserController('./artifacts/videos');
await browser.launch(true);
await browser.startSession('probe-typing');
await browser.page!.setContent(PAGE);

// The failure mode from the run: typing at a guessed coordinate over empty space
const missNotes = await browser.executeActions([
    { type: 'type', coordinate: { x: 640, y: 690 }, text: 'CA', reason: 'guessed coordinate' } as any
]);
check('coordinate miss is reported', missNotes.length === 1, JSON.stringify(missNotes));
check(
    'note explains nothing received the text',
    missNotes[0]?.includes('landed nowhere') === true,
    missNotes[0] || 'no note'
);

// Selector typing on the same off screen field must stay silent and actually work
const selectorNotes = await browser.executeActions([
    { type: 'type', selector: '[data-test="state"]', text: 'CA', reason: 'selector' } as any
]);
const value = await browser.page!.inputValue('[data-test="state"]');
check('selector typing reports no problem', selectorNotes.length === 0, JSON.stringify(selectorNotes));
check('selector typing filled the off screen field', value === 'CA', `value="${value}"`);

// A coordinate that does hit a field should stay silent too
await browser.page!.evaluate(() => window.scrollTo(0, 0));
const cityCenter = await browser.getElementCenter('[data-test="city"]');
const hitNotes = await browser.executeActions([
    { type: 'type', coordinate: cityCenter!, text: 'Anytown', reason: 'coordinate on the city field' } as any
]);
const cityValue = await browser.page!.inputValue('[data-test="city"]');
check('coordinate hit is not reported', hitNotes.length === 0, JSON.stringify(hitNotes));
check('coordinate hit filled the field', cityValue === 'Anytown', `value="${cityValue}"`);

console.log(results.join('\n'));

await browser.closeSession();
await browser.cleanup();
process.exit(results.some((line) => line.startsWith('FAIL')) ? 1 : 0);
