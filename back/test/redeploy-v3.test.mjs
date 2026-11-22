// Contract tests for the redeploy feature's js-web v3 build (back/spec/redeploy.md).
// String/DOM-shim level pins — no browser. Run: node --test back/test/redeploy-v3.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = resolve(dirname(fileURLToPath(import.meta.url)), '../features/redeploy/v3/js-web/index.js');
const src = readFileSync(file, 'utf8');

test('v1/v2 contract intact: element once, required attrs, POST body shape', () => {
  assert.equal(src.match(/customElements\.define\(/g).length, 1);
  assert.ok(/if \(!this\.attr\('src'\) \|\| !this\.attr\('project'\) \|\| !this\.attr\('namespace'\)\) return;/.test(src));
  assert.ok(src.includes('JSON.stringify({ project })'));
});

test('thru mode: GET <thru>?target=<src>&method=post&body&timeout_s', () => {
  assert.ok(src.includes('new URLSearchParams({'), 'query built via URLSearchParams');
  assert.ok(src.includes('target: src,'), 'target = click-time src');
  assert.ok(src.includes("method: 'post'"), 'method=post rides the query');
  assert.ok(src.includes('timeout_s: String(timeoutS)'));
  assert.ok(src.includes('url = `${thru}?${query}`'), 'request goes to the thru URL');
  assert.ok(/init = \{ method: 'GET', headers \}/.test(src), 'thru mode is a GET');
});

test('timeout-s attr defaults to 120 (cold start) when absent/invalid', () => {
  assert.ok(src.includes("this.attr('timeout-s')"));
  assert.ok(src.includes('|| 120'));
});

test('v2 direct mode unchanged: no thru attr → POST src with JSON body', () => {
  assert.ok(/if \(thru\) \{/.test(src), 'thru branch');
  assert.ok(src.includes('fetch(url, init)'), 'single fetch for both modes');
});

test('v3 stale-attribute fix: project/namespace/src/thru read at CLICK time, not connect', () => {
  // the click handler builds the payload from attr() calls on `this` — never from
  // captured connectedCallback locals (the v2 bug: switching runs sent the OLD project)
  assert.ok(src.includes('const src = this.attr('), 'src read at click time');
  assert.ok(src.includes("const project = `${this.attr('project')}@${this.attr('namespace')}`"), 'project@namespace built from click-time attrs');
  assert.ok(src.includes("const thru = this.attr('thru')"), 'thru read at click time');
  assert.ok(!/const (src|project|namespace|thru) = \(this\.getAttribute/.test(src), 'no captured attr locals');
  assert.ok(src.includes('attr(name)'), 'attr() helper');
});

test('v3 title/labels recompute from current attrs (refreshTitle)', () => {
  assert.ok(src.includes('this.refreshTitle'));
  assert.ok(src.includes('timer = setTimeout(() => this.refreshTitle(), ms)'));
});
