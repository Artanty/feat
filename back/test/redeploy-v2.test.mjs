// Contract tests for the redeploy feature's js-web v2 build (back/spec/redeploy.md).
// String/DOM-shim level pins — no browser. Run: node --test back/test/redeploy-v2.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = resolve(dirname(fileURLToPath(import.meta.url)), '../features/redeploy/v2/js-web/index.js');
const src = readFileSync(file, 'utf8');

test('v1 contract intact: <redeploy-button> once, required attrs, POST body shape', () => {
  assert.equal(src.match(/customElements\.define\(/g).length, 1);
  assert.ok(/if \(!src \|\| !project \|\| !namespace\) return;/.test(src));
  assert.ok(src.includes('JSON.stringify({ project: `${project}@${namespace}` })'));
});

test('v2 thru attr: routes the click as GET <thru>?target=<src>&method=post&body&timeout_s', () => {
  assert.ok(src.includes("getAttribute('thru')"));
  assert.ok(src.includes('new URLSearchParams({'), 'query built via URLSearchParams');
  assert.ok(src.includes('target: src,'), 'target = src attr');
  assert.ok(src.includes("method: 'post'"), 'method=post rides the query');
  assert.ok(src.includes('timeout_s: String(timeoutS)'));
  assert.ok(src.includes('url = `${thru}?${query}`'), 'request goes to the thru URL');
  assert.ok(/init = \{ method: 'GET', headers \}/.test(src), 'thru mode is a GET');
});

test('v2 timeout-s attr defaults to 120 (cold start) when absent/invalid', () => {
  assert.ok(src.includes("getAttribute('timeout-s')"));
  assert.ok(src.includes('|| 120'));
});

test('v2 direct mode unchanged: no thru attr → POST src with JSON body', () => {
  assert.ok(/if \(thru\) \{/.test(src), 'thru branch');
  assert.ok(src.includes('fetch(url, init)'), 'single fetch for both modes');
});
