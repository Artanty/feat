// Contract tests for the redeploy feature's js-web build (back/spec/redeploy.md).
// String/DOM-shim level pins — no browser. Run: node --test back/test/redeploy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = resolve(dirname(fileURLToPath(import.meta.url)), '../features/redeploy/v1/js-web/index.js');
const src = readFileSync(file, 'utf8');

test('element file registers <redeploy-button> exactly once (customElements guard)', () => {
  assert.ok(src.includes("customElements.get('redeploy-button')"));
  assert.ok(src.includes("customElements.define('redeploy-button'"));
  assert.equal(src.match(/customElements\.define\(/g).length, 1);
});

test('required attrs: src, project, namespace — renders nothing when any is missing', () => {
  for (const attr of ['src', 'project', 'namespace']) {
    assert.ok(src.includes(`getAttribute('${attr}')`), `attr ${attr} read`);
  }
  assert.ok(/if \(!src \|\| !project \|\| !namespace\) return;/.test(src), 'missing-required → renders nothing');
});

test('click POSTs {project: "<project>@<namespace>"} to src with JSON content-type', () => {
  assert.ok(src.includes(`JSON.stringify({ project: \`\${project}@\${namespace}\` })`));
  assert.ok(src.includes(`fetch(src,`));
  assert.ok(src.includes("'Content-Type': 'application/json'"));
});

test('events out: feat:ready on connect, redeploy:done with {ok, project, response}', () => {
  assert.ok(src.includes("'feat:ready'"));
  assert.ok(src.includes("'redeploy:done'"));
  assert.ok(/done\((true|false)/.test(src), 'ok flag passed to done()');
  assert.ok(src.includes('{ ok, project:'), 'detail carries {ok, project, response}');
});

test('button disabled while pending; transient feedback in title', () => {
  assert.ok(/btn\.disabled = true/.test(src));
  assert.ok(/btn\.disabled = false/.test(src));
  assert.ok(src.includes('feedback('));
});

test('optional token-key attr: localStorage value sent as X-Totp-Auth', () => {
  assert.ok(src.includes("getAttribute('token-key')"));
  assert.ok(src.includes("'X-Totp-Auth'"));
  assert.ok(src.includes('localStorage.getItem(tokenKey)'));
});

test('DOM-shim smoke: class upgrades, renders a button when attrs present', () => {
  const made = [];
  const elements = new Map();
  global.document = {
    createElement: (tag) => {
      const el = {
        tag, children: [], style: {}, textContent: '', type: '', title: '', disabled: false,
        setAttribute() {}, addEventListener() {}, append(...kids) { this.children.push(...kids); },
      };
      made.push(el);
      return el;
    },
  };
  global.customElements = {
    get: () => undefined,
    define: (name, cls) => elements.set(name, cls),
  };
  global.CustomEvent = class { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } };
  global.HTMLElement = class {};
  new Function(src)(); // execute the bundle against the shim
  assert.ok(elements.has('redeploy-button'));

  const host = Object.create(elements.get('redeploy-button').prototype);
  host.getAttribute = (k) => ({ src: 'https://x/api/req/redeploy', project: 'safe', namespace: 'web' }[k]);
  host.style = {};
  host.children = [];
  host.append = (...kids) => host.children.push(...kids);
  host.dispatchEvent = () => {};
  host.connectedCallback();
  const button = made.find((el) => el.tag === 'button');
  assert.ok(button, 'button rendered');
  assert.equal(button.children.map((c) => c.textContent).join(''), '⟳Redeploy');
});
