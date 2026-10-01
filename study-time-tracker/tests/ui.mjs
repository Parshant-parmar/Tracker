import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import assert from 'node:assert/strict';

const out = await build({ entryPoints: ['src/main.jsx'], bundle: true, write: false, format: 'esm', jsx: 'automatic',
  loader: { '.css': 'empty' }, define: { __APP_VERSION__: '"test"', 'process.env.NODE_ENV': '"development"' } });
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'location', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  try { Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true }); } catch {}
}
w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
w.scrollTo = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
const errors = []; const ce = console.error; console.error = (...a) => { errors.push(a.join(' ')); ce(...a); };

const code = out.outputFiles[0].text;
await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const $ = (sel, text) => [...w.document.querySelectorAll(sel)].find((e) => !text || e.textContent.trim() === text);
const click = async (el) => { assert.ok(el, 'element missing'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(); };
await wait(200);

assert.ok($('button', 'Start Session'), 'home renders'); console.log('ok home renders');
await click($('button', 'Start Session'));
assert.ok(w.document.body.textContent.includes('Session in progress')); assert.ok($('button', 'Start Session').disabled);
assert.ok(!/\d+h \d+m|\d+m\b/.test(w.document.querySelector('.status').textContent)); console.log('ok active session shown, no duration, Start disabled');
await wait(30);
await click($('button', 'End Session'));
assert.ok(w.document.body.textContent.includes('Session recorded.')); console.log('ok session recorded');
await click($('button', 'End for the Day'));
assert.ok(w.document.body.textContent.includes('Are you sure you want to finish today’s tracking?')); console.log('ok end-day confirm');
await click($('dialog button', 'Confirm'));
await wait(100);
assert.ok(w.document.body.textContent.includes('Total Study') && w.document.body.textContent.includes('Longest Session')); console.log('ok day report shown after confirm');
for (const hash of ['history', 'stats', 'exam', 'settings']) {
  w.location.hash = `/${hash}`; await wait(80);
  assert.ok(w.document.querySelector('h1'), hash); console.log('ok route', hash);
}
assert.equal(errors.filter((e) => !/act\(/.test(e)).length, 0, errors.join('\n'));
console.log('UI smoke test passed');
process.exit(0);
