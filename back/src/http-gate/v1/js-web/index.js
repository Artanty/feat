(function (root) {
  'use strict';

  // feat http-gate v1 — single-flight bus-recovery interceptor.
  // Spec: spec/http-gate.md (the contract; tests back/test/http-gate.test.mjs pin it).
  //
  // On a config-matched failure (e.g. 503 from a sleeping backend, 401 from an expired
  // token) the gate makes ONE bus request to a declared recovery provider
  // (featBus.request(recovery.event, recovery.payload)), parks failed requests, holds
  // new ones before send, and replays everything when the provider resolves. The gate
  // is payload-agnostic: resolve = resume, reject = give up. It knows nothing about
  // waking — wake-up v2 is just one provider. While an episode runs the gate emits
  // global-loading-start / global-loading-end signals (feat global-loading shows a
  // blocking backdrop) — inject deps.signal to override, omit it to stay silent.
  //
  // Two layers in one file (single script tag for js-web consumers, same file evals in
  // node for tests / vending by future ng/axios namespaces):
  //   - createGate(config, deps)     pure core: no DOM, no fetch, no bus — deps injected
  //   - window.featGate              browser adapter: fetch drop-in + optional autoPatch
  //
  // Browser use:  window.FEAT_GATE_CONFIG = {rules:[…], recovery:{feature, event, payload},
  //               timeoutMs}
  //               <script src="/http-gate/v1/js-web/"></script>
  //               fetch → featGate.request(url, init)   (or autoPatch: true to wrap fetch)
  var CONTRACT = 1;
  if (root.featGate && root.featGate.contract === CONTRACT) return;

  function compilePattern(p) {
    var clean = String(p).replace(/^\/|\/$/g, '');
    try { return new RegExp(clean); } catch (e) { return null; }
  }

  function createGate(config, deps) {
    var cfg = config || {};
    var rules = Array.isArray(cfg.rules) ? cfg.rules.slice() : [];
    var rec = cfg.recovery || {};
    // misconfigured gate = pure passthrough — a feature must never break the host page
    if (!rules.length || !rec.event ||
        typeof deps.request !== 'function' || typeof deps.recover !== 'function') {
      return {
        request: function (url, init) { return deps.request(url, init); },
        state: function () { return 'idle'; },
      };
    }

    var state = 'idle';
    var pending = null;   // set only while a recovery episode runs
    var parked = [];      // failed requests awaiting retry after resume
    var held = [];        // requests held before send while recovering

    function signal(name) {
      if (typeof deps.signal === 'function') {
        try { deps.signal(name); } catch (e) { /* a UI hint must never break recovery */ }
      }
    }

    function matches(url, status) {
      return rules.some(function (r) {
        if (!r || r.on !== 'ERROR' || Number(r.trigger) !== Number(status)) return false;
        if (!r.url_pattern) return true;
        var re = compilePattern(r.url_pattern);
        return re ? re.test(url) : url.indexOf(String(r.url_pattern)) !== -1;
      });
    }

    function beginEpisode() {
      state = 'recovering';
      signal('global-loading-start');
      pending = Promise.resolve(deps.recover()).then(function () {
        finishEpisode(true); // resolve = resume; the payload is the provider's business
      }, function () {
        finishEpisode(false); // reject/NO_HANDLER/timeout: fail the episode, never the pipeline
      });
    }

    function finishEpisode(resumed) {
      var p = parked, h = held;
      parked = []; held = []; pending = null;
      state = resumed ? 'resumed' : 'failed';
      signal('global-loading-end');
      p.forEach(function (item) {
        if (resumed) send(item.url, item.init, item.res, item.rej, true); // retry ONCE
        else item.res(item.response); // parked requests get their ORIGINAL response back
      });
      h.forEach(function (item) {
        if (resumed) send(item.url, item.init, item.res, item.rej, false);
        else {
          var e = new Error('feat http-gate: recovery failed; request was never sent');
          e.code = 'FEAT_GATE_RECOVERY_FAILED';
          item.rej(e);
        }
      });
    }

    function send(url, init, res, rej, retried) {
      deps.request(url, init).then(function (response) {
        if (response && response.ok) return res(response);
        var status = response && response.status;
        if (pending) { // an episode is already running: join it, never start a second
          parked.push({ url: url, init: init, res: res, rej: rej, response: response });
          return;
        }
        if (!retried && matches(url, status)) { // fresh failure matches a rule: new episode
          parked.push({ url: url, init: init, res: res, rej: rej, response: response });
          beginEpisode();
          return;
        }
        res(response); // retried failure (loop guard) or non-matching: pass through
      }, function (err) {
        rej(err); // network errors are not the recoverable signal — pass through
      });
    }

    return {
      request: function (url, init) {
        return new Promise(function (res, rej) {
          if (pending) { // hold BEFORE send — don't feed the broken backend
            held.push({ url: url, init: init, res: res, rej: rej });
            return;
          }
          send(url, init, res, rej, false);
        });
      },
      state: function () { return state; },
    };
  }

  var api = { contract: CONTRACT, createGate: createGate };

  // ---- browser adapter ------------------------------------------------------------------
  if (typeof document !== 'undefined') {
    var conf = root.FEAT_GATE_CONFIG || {};
    var instance = null;
    var origFetch = null;

    function gate() {
      if (!instance) {
        instance = createGate(conf, {
          request: function (url, init) { return root.fetch(url, init); },
          recover: function () {
            var r = conf.recovery || {};
            var timeoutMs = conf.timeoutMs || 200000; // bus default is 5s — a recovery runs minutes
            return root.featBus.request(r.event, r.payload || {}, { timeoutMs: timeoutMs });
          },
          signal: function (name) { root.featBus.signal(name); },
        });
      }
      return instance;
    }

    api.request = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || String(input);
      return gate().request(url, init);
    };

    if (conf.autoPatch && typeof root.fetch === 'function') {
      origFetch = root.fetch;
      root.fetch = function (input, init) { return api.request(input, init); };
      api.restore = function () { root.fetch = origFetch; };
    }
  }

  root.featGate = api;
})(typeof window !== 'undefined' ? window : globalThis);
