(function () {
  'use strict';

  // <wake-server> v2 — wakes a sleeping PaaS container (snapdeploy first) from the browser.
  // v1 behavior kept (attr-driven, badge UI); v2 adds the interceptor-slot shape:
  //   - `manual` attr: the element stays resident but dormant — no auto-wake on connect;
  //     it only serves bus requests (the http-gate / backend-request slot deployment).
  //   - featBus.serve('wake-up'): featBus.request('wake-server@v2', 'wake-up', {target,…})
  //     resolves {awake:true, attempts, elapsedMs, strategy} on success, REJECTS on
  //     timeout/error (bus contract: resolve = resume, reject = give up — see
  //     spec/http-gate.md). Concurrent requests join the in-flight wake (single-flight).
  // See /docs/wake-up on the feat host for the full contract.
  var DEFAULT_INTERVAL_MS = 3000;
  var DEFAULT_TIMEOUT_MS = 185000; // ~3 min, matches snapdeploy's own wake page
  var AWAKE_STATUSES = [200, 204, 301, 302, 401, 403, 404]; // an auth-rejecting server is an awake server

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function fire(el, name, detail) {
    el.dispatchEvent(new CustomEvent(name, { detail: detail || {}, bubbles: true }));
  }

  class WakeServer extends HTMLElement {
    static get observedAttributes() { return ['target', 'mode', 'proxy', 'project', 'manual']; }

    connectedCallback() {
      this.__unserve = this.serveBus();
      if (this.hasAttribute('manual')) { this.__state = 'dormant'; this.render(); return; }
      this.start();
    }
    disconnectedCallback() {
      this.stop('disconnected');
      if (this.__unserve) this.__unserve();
    }
    attributeChangedCallback(name, oldV, newV) {
      if (oldV === newV || !this.shadowRoot) return;
      if (name === 'manual') return; // residency toggle only — no restart
      this.stop('attr-change'); this.start();
    }

    // ---- bus (v2) ------------------------------------------------------------------------

    serveBus() {
      var self = this;
      if (window.featBus && window.featBus.serve) {
        return window.featBus.serve('wake-up', function (payload) { return self.onWakeRequest(payload); });
      }
      // bus not loaded yet — bundles load in ANY order by contract, so keep watching
      // (bounded: a host without the bus gets no eternal interval)
      var tries = 0;
      this.__busTimer = setInterval(function () {
        tries += 1;
        if (window.featBus && window.featBus.serve) {
          clearInterval(self.__busTimer);
          self.__busTimer = null;
          self.__unserve = window.featBus.serve('wake-up', function (payload) { return self.onWakeRequest(payload); });
        } else if (tries > 80) { // ~20s
          clearInterval(self.__busTimer);
          self.__busTimer = null;
        }
      }, 250);
      return function () {
        clearInterval(self.__busTimer);
        self.__busTimer = null;
      };
    }

    onWakeRequest(payload) {
      var p = payload || {};
      if (this.__state === 'waking') return this.joinWake(); // single-flight join
      var target = (p.target || this.getAttribute('target') || '').trim();
      if (!target) {
        return Promise.reject(new Error('wake-up: no target (payload or attribute)'));
      }
      this.start({
        target: target,
        mode: p.mode,
        proxy: p.proxy,
        project: p.project,
      });
      return this.joinWake();
    }

    joinWake() {
      var self = this;
      this.__waiters = this.__waiters || [];
      return new Promise(function (resolve, reject) {
        self.__waiters.push({ resolve: resolve, reject: reject });
      });
    }

    // bus contract (spec/http-gate.md): resolve = resume, reject = give up
    settleWaiters(result) {
      (this.__waiters || []).forEach(function (w) { w.resolve(result); });
      this.__waiters = [];
    }

    failWaiters(err) {
      (this.__waiters || []).forEach(function (w) { w.reject(err); });
      this.__waiters = [];
    }

    // ---- state machine ------------------------------------------------------------------

    start(overrides) {
      var o = overrides || {};
      var target = (o.target || this.getAttribute('target') || '').trim();
      var mode = (o.mode || this.getAttribute('mode') || 'direct').trim();
      if (!target) { this.setState('error', 'missing target attribute'); this.failWaiters(new Error('wake-up: missing target')); return; }
      if (mode !== 'direct' && mode !== 'noy') { this.setState('error', 'mode must be direct|noy'); this.failWaiters(new Error('wake-up: mode must be direct|noy')); return; }
      if (mode === 'noy') {
        var proxy = (o.proxy || this.getAttribute('proxy') || '').trim();
        if (!proxy) {
          this.setState('error', 'mode=noy requires proxy attribute');
          this.failWaiters(new Error('wake-up: mode=noy requires proxy'));
          return;
        }
      }

      this.__attempts = 0;
      this.__startedAt = Date.now();
      this.__stopped = false;
      this.setState('waking', '');
      fire(this, 'wake-start', { target: target, mode: mode });

      if (mode === 'noy') this.runNoy(target);
      else this.runDirect(target);
    }

    stop(reason) {
      this.__stopped = true;
      if (this.__timer) { clearTimeout(this.__timer); this.__timer = null; }
      if (this.__renderTimer) { clearTimeout(this.__renderTimer); this.__renderTimer = null; }
    }

    succeeded(strategy) {
      if (this.__stopped) return;
      this.stop();
      var elapsedMs = Date.now() - this.__startedAt;
      this.setState('awake', strategy);
      var detail = { attempts: this.__attempts, elapsedMs: elapsedMs, strategy: strategy };
      fire(this, 'wake-awake', detail);
      this.settleWaiters({ awake: true, attempts: detail.attempts, elapsedMs: detail.elapsedMs, strategy: strategy });
    }

    timedOut() {
      if (this.__stopped) return;
      this.stop();
      var elapsedMs = Date.now() - this.__startedAt;
      this.setState('timeout', '');
      var detail = { attempts: this.__attempts, elapsedMs: elapsedMs };
      fire(this, 'wake-timeout', detail);
      this.failWaiters(new Error('wake-up: timeout after ' + detail.attempts + ' attempts, ' + detail.elapsedMs + 'ms'));
    }

    // ---- direct mode: browser port of noy's wakeSnapDeploy ------------------------------

    runDirect(target) {
      this.pingSnapDeploy(target).then(function () { /* any ping failure swallowed — poll anyway */ });
      this.pollDirect(target);
    }

    pingSnapDeploy(target) {
      var host;
      try { host = new URL(target).hostname; } catch (e) { return Promise.resolve(); }
      // *.containers.snapdeploy.app|dev → snapdeploy.dev API; dev hosts use somdip
      var m = host.match(/^([a-z0-9-]+)\.containers\.(snapdeploy\.app|snapdeploy\.dev|somdip\.dev)$/i);
      if (!m) return Promise.resolve(); // not snapdeploy-hosted: plain polling below
      var apiBase = /\.somdip\.dev$/i.test(m[2]) ? 'https://containers.somdip.dev' : 'https://snapdeploy.dev';
      return fetch(apiBase + '/api/public/wake/' + m[1], {
        method: 'POST',
        headers: { 'accept': '*/*', 'content-type': 'application/json' },
        body: '{}',
      }).then(function () {}, function () {}); // even a 429 is fine — the poll decides
    }

    pollDirect(target) {
      var self = this;
      var interval = this.intAttr('interval', DEFAULT_INTERVAL_MS);
      var timeout = this.intAttr('timeout', DEFAULT_TIMEOUT_MS);
      if (Date.now() - this.__startedAt >= timeout) return this.timedOut();

      this.__attempts += 1;
      // Plain cors-mode HEAD: the target must send CORS headers (plst's back reflects any
      // origin) so the real status is readable — 503 = still asleep on snapdeploy.
      fetch(target, { method: 'HEAD', cache: 'no-store' }).then(function (resp) {
        if (self.__stopped) return;
        if (resp && resp.status !== 503 && AWAKE_STATUSES.indexOf(resp.status) !== -1) {
          self.succeeded('snapdeploy');
        } else {
          self.__timer = setTimeout(function () { self.pollDirect(target); }, interval);
        }
      }, function () { // network error while asleep: keep polling until the budget ends
        if (self.__stopped) return;
        self.__timer = setTimeout(function () { self.pollDirect(target); }, interval);
      });
    }

    // ---- noy mode: noy/back does the waking (GET /make-wake-request) ----------------------

    runNoy(target) {
      var self = this;
      var proxy = (this.getAttribute('proxy') || '').trim().replace(/\/+$/, '');
      var project = this.getAttribute('project') || '';
      var qs = 'target=' + encodeURIComponent(target) +
        (project ? '&app=' + encodeURIComponent(project) : '');
      this.__attempts += 1;

      fetch(proxy + '/make-wake-request?' + qs).then(function (resp) {
        if (self.__stopped) return;
        return resp.json().then(function (body) {
          var wake = (body && body.wake) || {};
          if (resp.ok && body && body.request === 'completed' && wake.awake) {
            self.succeeded(wake.strategy || 'noy');
          } else {
            self.setState('timeout', 'noy returned ' + resp.status);
            self.fireTimeout(wake);
          }
        });
      }, function (err) {
        if (self.__stopped) return;
        self.setState('error', 'noy unreachable: ' + (err && err.message ? err.message : err));
        self.failWaiters(new Error('wake-up: noy unreachable'));
      });
    }

    fireTimeout(wake) {
      this.stop();
      var detail = {
        attempts: this.__attempts,
        elapsedMs: Date.now() - this.__startedAt,
        wake: wake,
      };
      fire(this, 'wake-timeout', detail);
      this.failWaiters(new Error('wake-up: noy failed — ' + JSON.stringify(wake)));
    }

    // ---- ui ------------------------------------------------------------------------------

    intAttr(name, fallback) {
      var v = parseInt(this.getAttribute(name), 10);
      return isNaN(v) || v <= 0 ? fallback : v;
    }

    setState(state, note) {
      this.__state = state;
      this.__note = note || '';
      this.render();
    }

    render() {
      if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
      var state = this.__state || 'idle';
      var labels = { idle: 'idle', dormant: 'wake on demand', waking: 'waking…', awake: 'awake', timeout: 'wake timeout', error: 'wake error' };
      var elapsed = this.__startedAt && state === 'waking' ? (Math.round((Date.now() - this.__startedAt) / 100) / 10) : 0;
      // fixed widths so growing digits (1.3 → 20.0, 9 → 10 tries) don't shift the badge
      var elapsedText = elapsed.toFixed(1).padStart(5, ' ');
      var triesText = String(this.__attempts).padStart(2, ' ');

      this.shadowRoot.innerHTML =
        '<style>' +
        '  :host { font: 11px/1.4 ui-monospace, Menlo, Consolas, monospace; }' +
        '  .badge { display: inline-flex; align-items: center; gap: 6px;' +
        '           background: rgba(30, 30, 30, .82); color: #eee; border-radius: 6px; padding: 3px 8px; }' +
        '  .dot { width: 6px; height: 6px; border-radius: 50%; background: #888; }' +
        '  .waking .dot { background: #e2b93b; animation: wu-pulse 1s infinite; }' +
        '  .awake .dot { background: #4caf50; }' +
        '  .timeout .dot, .error .dot { background: #e0533d; }' +
        '  .meta { color: #888; white-space: pre; }' +
        '  @keyframes wu-pulse { 50% { opacity: .25; } }' +
        '</style>' +
        (state === 'dormant' ? '' : // manual mode: invisible until something needs waking
        '<span class="badge ' + esc(state) + '">' +
        '  <span class="dot"></span>' +
        '  <span class="state">' + esc(labels[state] || state) + '</span>' +
        (state === 'waking' ? '<span class="meta">' + triesText + ' tries · ' + elapsedText + 's</span>' : '') +
        (this.__note ? '<span class="meta">' + esc(this.__note) + '</span>' : '') +
        '</span>');

      if (state === 'waking') {
        var self = this;
        this.__renderTimer = setTimeout(function () { self.render(); }, 500); // live elapsed counter
      } else if (this.__renderTimer) {
        clearTimeout(this.__renderTimer);
      }
    }
  }

  if (!customElements.get('wake-server')) customElements.define('wake-server', WakeServer);
})();
