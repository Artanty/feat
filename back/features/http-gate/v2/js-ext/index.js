(function (root) {
  'use strict';

  // feat http-gate v2 js-ext — the v2 single-flight recovery interceptor for Chrome
  // MV3 extension consumers. Same pure core as js-web (copied verbatim so the two
  // namespaces never drift silently), different adapter: no featBus (a service worker
  // / popup has no shared window for the CustomEvents transport) — recovery is a
  // DIRECT call to featWakeUp.wakeServer (wake-up v2 js-ext), which must be vendored
  // alongside this file. Consumers VENDOR both files (MV3 CSP forbids remote scripts).
  //
  // Rules (same semantics as js-web v2):
  //   {on: 'ERROR', trigger: <status>[, url_pattern?]}  — readable HTTP failure
  //   {on: 'NETWORK'[, url_pattern?]}                   — transport rejection
  //
  // Use:  globalThis.FEAT_GATE_CONFIG = { rules: [...], recovery: { target: <backend> },
  //                                       timeoutMs: 200000, onState?: fn }
  //       featGate.request(url, init)   — fetch drop-in
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
    if (!rules.length || !rec.target ||
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
      signal('gate-recovering');
      pending = Promise.resolve(deps.recover()).then(function () {
        finishEpisode(true); // resolve = resume; the payload is the provider's business
      }, function () {
        finishEpisode(false); // reject/timeout: fail the episode, never the pipeline
      });
    }

    function finishEpisode(resumed) {
      var p = parked, h = held;
      parked = []; held = []; pending = null;
      state = resumed ? 'resumed' : 'failed';
      signal('gate-recovered');
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
        // transport rejection: a NETWORK rule makes it recoverable — the sleeping
        // snapdeploy edge does not answer preflighted calls, they die as network errors
        if (pending) {
          parked.push({ url: url, init: init, res: res, rej: rej, error: err });
          return;
        }
        if (!retried && matches(url, undefined)) {
          parked.push({ url: url, init: init, res: res, rej: rej, error: err });
          beginEpisode();
          return;
        }
        rej(err); // network errors with no NETWORK rule: pass through
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

  // ---- ext adapter ----------------------------------------------------------------------
  // recovery.target is the backend base URL; the recover dep calls featWakeUp
  // directly. deps.onState (from config) forwards gate state to the popup UI.
  // Config is read at FIRST REQUEST, not at load: in a Chrome extension the bundles
  // (vendor scripts) load before popup.js, which is where the host sets
  // FEAT_GATE_CONFIG — a load-time capture would see {} and silently degrade the
  // gate to a passthrough (found live: an import against a sleeping snapdeploy
  // backend failed with "Failed to fetch" and no wake ever ran).
  var instance = null;
  var conf = null;

  function gate() {
    if (!instance) {
      conf = root.FEAT_GATE_CONFIG || {};
      instance = createGate(conf, {
        request: function (url, init) { return fetch(url, init); },
        recover: function () {
          var r = conf.recovery || {};
          if (!root.featWakeUp || typeof root.featWakeUp.wakeServer !== 'function') {
            return Promise.reject(new Error('feat http-gate: featWakeUp (wake-up js-ext) not loaded'));
          }
          return root.featWakeUp.wakeServer(r.target, {
            interval: r.interval,
            timeout: r.timeout,
            onState: typeof conf.onState === 'function' ? conf.onState : undefined,
          });
        },
        signal: function (name) {
          if (typeof conf.onState === 'function') {
            try { conf.onState(name, { target: (conf.recovery || {}).target }); } catch (e) {}
          }
        },
      });
    }
    return instance;
  }

  api.request = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    return gate().request(url, init);
  };

  root.featGate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
