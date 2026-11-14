(function (root) {
  'use strict';

  // <wake-up> v2 js-ext — the v2 wake core for Chrome MV3 extension consumers.
  // Same network logic as the js-web <wake-server> element (snapdeploy wake POST +
  // HEAD poll, single-flight), WITHOUT custom element, shadow DOM or featBus — a
  // service worker / popup has no shared window and no document, so the bus transport
  // (CustomEvents) cannot exist there. The consumer calls wakeServer() directly.
  //
  // MV3 CSP (script-src 'self') forbids loading this from the feat host at runtime —
  // consumers VENDOR the file (js-node pattern); it attaches to globalThis.
  //
  // API: featWakeUp.wakeServer(base, opts) → Promise
  //   base: backend origin ("https://x.containers.snapdeploy.app")
  //   opts: { mode: 'direct'|'noy', proxy, project, interval (3000), timeout (185000),
  //           onState(state, detail) }  — onState mirrors the web element's events:
  //   'waking' {target, mode} · 'awake' {attempts, elapsedMs, strategy} ·
  //   'timeout' {attempts, elapsedMs} · 'error' {message}
  //   Resolves {awake:true, attempts, elapsedMs, strategy}, rejects on timeout/error.
  //   Concurrent calls JOIN the in-flight wake (single-flight).
  var DEFAULT_INTERVAL_MS = 3000;
  var DEFAULT_TIMEOUT_MS = 185000; // ~3 min, matches snapdeploy's own wake page
  var AWAKE_STATUSES = [200, 204, 301, 302, 401, 403, 404]; // an auth-rejecting server is an awake server

  var current = null; // {target, opts, attempts, startedAt, waiters, timer, stopped}

  function notify(opts, state, detail) {
    if (opts && typeof opts.onState === 'function') {
      try { opts.onState(state, detail || {}); } catch (e) { /* a UI hint must never break the wake */ }
    }
  }

  function settle(result) {
    var w = current.waiters;
    current = null;
    w.forEach(function (x) { x.resolve(result); });
  }

  function failAll(err) {
    var w = current.waiters;
    current = null;
    w.forEach(function (x) { x.reject(err); });
  }

  function stopTimers() {
    if (current && current.timer) { clearTimeout(current.timer); current.timer = null; }
  }

  function succeeded(strategy) {
    var detail = { attempts: current.attempts, elapsedMs: Date.now() - current.startedAt, strategy: strategy };
    var opts = current.opts;
    stopTimers();
    notify(opts, 'awake', detail);
    settle({ awake: true, attempts: detail.attempts, elapsedMs: detail.elapsedMs, strategy: strategy });
  }

  function timedOut() {
    var detail = { attempts: current.attempts, elapsedMs: Date.now() - current.startedAt };
    var opts = current.opts;
    stopTimers();
    notify(opts, 'timeout', detail);
    failAll(new Error('wake-up: timeout after ' + detail.attempts + ' attempts, ' + detail.elapsedMs + 'ms'));
  }

  // direct mode: browser/SW port of noy's wakeSnapDeploy
  function pingSnapDeploy(target) {
    var host;
    try { host = new URL(target).hostname; } catch (e) { return Promise.resolve(); }
    // *.containers.snapdeploy.app|dev → snapdeploy.dev API; somdip hosts use somdip
    var m = host.match(/^([a-z0-9-]+)\.containers\.(snapdeploy\.app|snapdeploy\.dev|somdip\.dev)$/i);
    if (!m) return Promise.resolve(); // not snapdeploy-hosted: plain polling below
    var apiBase = /\.somdip\.dev$/i.test(m[2]) ? 'https://containers.somdip.dev' : 'https://snapdeploy.dev';
    return fetch(apiBase + '/api/public/wake/' + m[1], {
      method: 'POST',
      headers: { 'accept': '*/*', 'content-type': 'application/json' },
      body: '{}',
    }).then(function () {}, function () {}); // even a 429 is fine — the poll decides
  }

  function pollDirect(target, opts, interval, timeout) {
    if (!current) return;
    if (Date.now() - current.startedAt >= timeout) return timedOut();

    current.attempts += 1;
    // HEAD on the lightweight health endpoint: no CORS from an extension page context
    // when host_permissions cover the origin — 503 = still asleep on snapdeploy.
    fetch(target.replace(/\/+$/, '') + '/healthz', { method: 'HEAD', cache: 'no-store' }).then(function (resp) {
      if (!current) return;
      if (resp && resp.status !== 503 && AWAKE_STATUSES.indexOf(resp.status) !== -1) {
        succeeded('snapdeploy');
      } else {
        current.timer = setTimeout(function () { pollDirect(target, opts, interval, timeout); }, interval);
      }
    }, function () { // network error while asleep: keep polling until the budget ends
      if (!current) return;
      current.timer = setTimeout(function () { pollDirect(target, opts, interval, timeout); }, interval);
    });
  }

  // noy mode: noy/back does the waking (GET /make-wake-request)
  function runNoy(target, opts) {
    var proxy = String(opts.proxy || '').trim().replace(/\/+$/, '');
    var qs = 'target=' + encodeURIComponent(target) +
      (opts.project ? '&app=' + encodeURIComponent(opts.project) : '');
    current.attempts += 1;

    fetch(proxy + '/make-wake-request?' + qs).then(function (resp) {
      if (!current) return;
      return resp.json().then(function (body) {
        var wake = (body && body.wake) || {};
        if (resp.ok && body && body.request === 'completed' && wake.awake) {
          succeeded(wake.strategy || 'noy');
        } else {
          notify(opts, 'timeout', { attempts: current.attempts, elapsedMs: Date.now() - current.startedAt, wake: wake });
          failAll(new Error('wake-up: noy failed — ' + JSON.stringify(wake)));
        }
      });
    }, function (err) {
      if (!current) return;
      notify(opts, 'error', { message: 'noy unreachable: ' + (err && err.message ? err.message : err) });
      failAll(new Error('wake-up: noy unreachable'));
    });
  }

  function wakeServer(base, opts) {
    var o = opts || {};
    var target = String(base || '').trim().replace(/\/+$/, '');
    var mode = (o.mode || 'direct').trim();
    if (!target) return Promise.reject(new Error('wake-up: no target'));
    if (mode !== 'direct' && mode !== 'noy') return Promise.reject(new Error('wake-up: mode must be direct|noy'));
    if (mode === 'noy' && !String(o.proxy || '').trim()) return Promise.reject(new Error('wake-up: mode=noy requires proxy'));

    if (current && current.target === target) return join(); // single-flight per target
    if (current) { // a wake for a DIFFERENT target is already running: fail the newcomer
      return Promise.reject(new Error('wake-up: another target is being woken (' + current.target + ')'));
    }

    current = { target: target, opts: o, attempts: 0, startedAt: Date.now(), waiters: [], timer: null };
    notify(o, 'waking', { target: target, mode: mode });

    if (mode === 'noy') runNoy(target, o);
    else {
      var interval = Number(o.interval) > 0 ? Number(o.interval) : DEFAULT_INTERVAL_MS;
      var timeout = Number(o.timeout) > 0 ? Number(o.timeout) : DEFAULT_TIMEOUT_MS;
      pingSnapDeploy(target).then(function () { /* any ping failure swallowed — poll anyway */ });
      pollDirect(target, o, interval, timeout);
    }
    return join();
  }

  function join() {
    return new Promise(function (resolve, reject) {
      current.waiters.push({ resolve: resolve, reject: reject });
    });
  }

  // test/inspection hook — not for consumer use
  function inFlight() { return current ? { target: current.target, attempts: current.attempts } : null; }

  var api = { contract: 2, wakeServer: wakeServer, inFlight: inFlight };
  root.featWakeUp = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
