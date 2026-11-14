(function (root) {
  'use strict';

  // feat http-gate v2 — single-flight bus-recovery interceptor.
  // Spec: spec/http-gate.md (the contract; tests back/test/http-gate.test.mjs pin it).
  //
  // On a config-matched failure the gate makes ONE bus request to a declared recovery
  // provider (featBus.request(recovery.event, recovery.payload)), parks failed requests,
  // holds new ones before send, and replays everything when the provider resolves. The
  // gate is payload-agnostic: resolve = resume, reject = give up. It knows nothing about
  // waking — wake-up v2 is just one provider. While an episode runs the gate emits
  // global-loading-start / global-loading-end signals (feat global-loading shows a
  // blocking backdrop) — inject deps.signal to override, omit it to stay silent.
  //
  // v2 adds the NETWORK rule: a transport rejection (fetch TypeError) can be declared
  // recoverable. Found live on plist.twc1.net: the app's preflighted calls (x-user-id /
  // content-type headers) against a SLEEPING snapdeploy die as network errors (status 0
  // in HAR) because the sleeping edge does not answer CORS preflights — while simple
  // GETs on the same backend return a perfectly readable 503. Rules:
  //   {on: 'ERROR', trigger: <status>[, url_pattern?]}  — readable HTTP failure
  //   {on: 'NETWORK'[, url_pattern?]}                   — transport rejection
  //
  // Two layers in one file (single script tag for js-web consumers, same file evals in
  // node for tests / vending by future ng/axios namespaces):
  //   - createGate(config, deps)     pure core: no DOM, no fetch, no bus — deps injected
  //   - window.featGate              browser adapter: fetch drop-in + optional autoPatch
  //
  // Browser use:  window.FEAT_GATE_CONFIG = {rules:[…], recovery:{event, payload},
  //               timeoutMs}
  //               <script src="/http-gate/v2/js-web/"></script>
  //               fetch → featGate.request(url, init)   (or autoPatch: true to wrap fetch)
  var CONTRACT = 2;
  if (root.featGate) return; // whichever version loads first wins — never wrap twice

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

    function urlMatches(rule, url) {
      if (!rule.url_pattern) return true;
      var re = compilePattern(rule.url_pattern);
      return re ? re.test(url) : url.indexOf(String(rule.url_pattern)) !== -1;
    }

    function matches(url, status) {
      // status === undefined means the transport REJECTED (network error)
      return rules.some(function (r) {
        if (!r || !urlMatches(r, url)) return false;
        if (r.on === 'NETWORK') return status === undefined;
        if (r.on === 'ERROR') return status !== undefined && Number(r.trigger) === Number(status);
        return false;
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
        // parked requests settle with their ORIGINAL outcome — response or error
        else if ('response' in item) item.res(item.response);
        else item.rej(item.error);
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
        // transport rejection: a NETWORK rule makes it recoverable (v2 — the sleeping
        // snapdeploy does not answer CORS preflights, so preflighted API calls die as
        // network errors long before any 503 could be read)
        if (pending) {
          parked.push({ url: url, init: init, res: res, rej: rej, error: err });
          return;
        }
        if (!retried && matches(url, undefined)) {
          parked.push({ url: url, init: init, res: res, rej: rej, error: err });
          beginEpisode();
          return;
        }
        rej(err); // network errors with no NETWORK rule: pass through (v1 behavior)
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
