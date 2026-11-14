(function () {
  'use strict';

  // <wake-server> — wakes a sleeping PaaS container (snapdeploy first) from the browser.
  // Port of noy/back's wakeServer.js (snapdeploy strategy) to a web component; see
  // /docs/wake-up on the feat host for the full contract.
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
    static get observedAttributes() { return ['target', 'mode', 'proxy', 'project']; }

    connectedCallback() { this.start(); }
    disconnectedCallback() { this.stop('disconnected'); }
    attributeChangedCallback(name, oldV, newV) {
      if (oldV === newV || !this.shadowRoot) return;
      this.stop('attr-change'); this.start();
    }

    // ---- state machine ------------------------------------------------------------------

    start() {
      var target = (this.getAttribute('target') || '').trim();
      var mode = (this.getAttribute('mode') || 'direct').trim();
      if (!target) { this.setState('error', 'missing target attribute'); return; }
      if (mode !== 'direct' && mode !== 'noy') { this.setState('error', 'mode must be direct|noy'); return; }
      if (mode === 'noy' && !(this.getAttribute('proxy') || '').trim()) {
        this.setState('error', 'mode=noy requires proxy attribute'); return;
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
      fire(this, 'wake-awake', { attempts: this.__attempts, elapsedMs: elapsedMs, strategy: strategy });
    }

    timedOut() {
      if (this.__stopped) return;
      this.stop();
      var elapsedMs = Date.now() - this.__startedAt;
      this.setState('timeout', '');
      fire(this, 'wake-timeout', { attempts: this.__attempts, elapsedMs: elapsedMs });
    }

    // ---- direct mode: browser port of noy's wakeSnapDeploy ------------------------------

    runDirect(target) {
      var self = this;
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
      });
    }

    fireTimeout(wake) {
      this.stop();
      fire(this, 'wake-timeout', {
        attempts: this.__attempts,
        elapsedMs: Date.now() - this.__startedAt,
        wake: wake,
      });
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
      var labels = { idle: 'idle', waking: 'waking…', awake: 'awake', timeout: 'wake timeout', error: 'wake error' };
      var elapsed = this.__startedAt ? (Math.round((Date.now() - this.__startedAt) / 100) / 10) : 0;
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
        '<span class="badge ' + esc(state) + '">' +
        '  <span class="dot"></span>' +
        '  <span class="state">' + esc(labels[state] || state) + '</span>' +
        (state === 'waking' ? '<span class="meta">' + triesText + ' tries · ' + elapsedText + 's</span>' : '') +
        (this.__note ? '<span class="meta">' + esc(this.__note) + '</span>' : '') +
        '</span>';

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
