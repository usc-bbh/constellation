// Tests the extension's background script (src/extension/background.js) with a stand-in for Chrome's
// APIs: what happens when the student clicks the button on a STARS tab, on another tab, or on a tab
// whose frames can't all be read. Uses the fictional test/fixture-report.txt only.
// Usage: node test/extension.mjs (also part of npm test)
import fs from 'fs';
import vm from 'vm';
import assert from 'assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const P = require('../src/parser.js');
const SAMPLE = fs.readFileSync(new URL('./fixture-report.txt', import.meta.url), 'utf8');
const BG = fs.readFileSync(new URL('../src/extension/background.js', import.meta.url), 'utf8');

// Load background.js with a fake chrome object. `frames` is what each frame of the clicked tab shows.
function load({ frames, allFramesFails = false }) {
  const listeners = {}, created = [];
  const on = name => ({ addListener: f => { listeners[name] = f; } });
  const chrome = {
    action: { onClicked: on('click') },
    runtime: { onMessage: on('message'), getURL: p => `chrome-extension://abc/${p}` },
    tabs: { create: async o => { created.push(o); return { id: 99, ...o }; } },
    scripting: {
      executeScript: async ({ target, func }) => {
        if (target.allFrames && allFramesFails) throw new Error('Cannot access contents of the page');
        const list = target.allFrames ? frames : frames.slice(0, 1);
        return list.map(doc => ({ result: vm.runInNewContext(`(${func})()`, { document: doc }) }));
      }
    }
  };
  vm.runInNewContext(BG, { chrome, crypto: { randomUUID: () => 'key-1' }, setTimeout: () => 0, Map, module: undefined });
  const ask = key => new Promise(res => listeners.message({ type: 'constellation:get-report', key }, {}, res));
  return { click: tab => listeners.click(tab), ask, created };
}
// A fake document: the report in a <pre>, or plain body text.
const doc = ({ pre, body = '' }) => ({
  querySelectorAll: sel => sel === 'pre' && pre ? [{ innerText: pre }] : [],
  body: { innerText: body }
});

let failed = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`ok    ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message.split('\n').join('\n      ')}`); }
};

await test('clicking on a STARS tab opens the summary with the report', async () => {
  const x = load({ frames: [doc({ pre: SAMPLE })] });
  await x.click({ id: 7, index: 2 });
  assert.equal(x.created.length, 1);
  assert.equal(x.created[0].url, 'chrome-extension://abc/summary.html#key-1');
  assert.equal(x.created[0].index, 3);
  const r = await x.ask('key-1');
  assert.equal(r.text, SAMPLE);
  assert.equal(P.parse(r.text).gpa, '3.412'); // the handed-over text parses like the PDF text
});

await test('the report is handed over once, then forgotten', async () => {
  const x = load({ frames: [doc({ pre: SAMPLE })] });
  await x.click({ id: 7, index: 0 });
  await x.ask('key-1');
  assert.equal(await x.ask('key-1'), null);
  assert.equal(await x.ask('some-other-key'), null);
});

await test('the report can be in a frame of the page', async () => {
  const x = load({ frames: [doc({ body: 'USC portal' }), doc({ pre: SAMPLE })] });
  await x.click({ id: 7, index: 0 });
  assert.equal((await x.ask('key-1')).text, SAMPLE);
});

await test('a page without <pre> is read from its body text', async () => {
  const x = load({ frames: [doc({ body: SAMPLE })] });
  await x.click({ id: 7, index: 0 });
  assert.equal((await x.ask('key-1')).text, SAMPLE);
});

await test('a tab that is not a STARS report gives a clear message, not a summary', async () => {
  const x = load({ frames: [doc({ body: 'Welcome to my USC' })] });
  await x.click({ id: 7, index: 0 });
  const r = await x.ask('key-1');
  assert.equal(r.text, undefined);
  assert.match(r.error, /doesn't show a STARS report/);
});

await test('if some frames are off limits, the main frame is still read', async () => {
  const x = load({ frames: [doc({ pre: SAMPLE }), doc({ body: 'other site' })], allFramesFails: true });
  await x.click({ id: 7, index: 0 });
  assert.equal((await x.ask('key-1')).text, SAMPLE);
});

if (failed) { console.log(`\n${failed} extension test(s) failed`); process.exit(1); }
console.log('\nAll extension tests passed');
