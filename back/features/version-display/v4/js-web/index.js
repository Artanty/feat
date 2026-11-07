/**
 * deploy-info v4 — dynamic shell (badge one-liner = version only).
 *
 * Contract (see also render.js):
 * - This file is the STABLE bootstrap. It defines <deploy-info> exactly once
 *   (the customElements.get guard makes it safe to re-run) and never changes
 *   its behavior with a feature release. Logic upgrades ship as a NEW version
 *   directory's render.js; the shell discovers it via the `manifest` attribute
 *   and hot-swaps the module — the element class is never redefined, so no
 *   "already defined" errors and no consumer redeploy.
 * - Attributes:
 *     src      JSON endpoint the element polls once per connect for its data
 *              ({version, project, namespace, commit, repo}; null/missing
 *              fields are treated as absent)
 *     manifest feat /manifest.json URL — enables the toggle loop
 *     refresh  poll interval seconds (default 300; 0 disables polling)
 *     version/project/namespace/commit/repo  legacy direct attributes, still
 *              honored; direct attr wins over src, src wins over defaults
 * - `project` defaults to the hostname's first label when nothing supplies it.
 * - Stays silent (empty shadow) without a real version — 0.0.0(.0) is dev.
 * - If the manifest/render.js fetch fails for any reason, the built-in
 *   fallback renderer (identical markup to the last known good render.js)
 *   keeps the badge working.
 */
(function () {
  'use strict';

  if (customElements.get('deploy-info')) return;

  var DEV_VERSIONS = /^0\.0\.0(\.0)?$/;
  var POLL_SECONDS_DEFAULT = 300;
  var DATA_KEYS = ['version', 'project', 'namespace', 'commit', 'repo'];

  // ---- fallback renderer (the v4 markup, inlined) --------------------------
  // Kept byte-for-byte in sync with the v4 render.js so a failed module fetch
  // degrades to the same UI instead of a dead badge.
  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function renderV4(root, data) {
    var rows = ['project', 'namespace', 'commit', 'repo']
      .filter(function (name) { return data[name]; })
      .map(function (name) {
        return '<tr><td>' + esc(name) + '</td><td>' + esc(data[name]) + '</td></tr>';
      })
      .join('');
    // v4 contract: badge one-liner is the VERSION ONLY (project lives in the rows).
    var oneLiner = 'v' + esc(data.version);

    root.innerHTML =
      '<style>' +
      '  :host { position: fixed; right: 8px; bottom: 8px; z-index: 2147483647;' +
      '          font: 11px/1.4 ui-monospace, Menlo, Consolas, monospace; }' +
      '  .badge { background: rgba(30, 30, 30, .82); color: #eee; border-radius: 6px;' +
      '           padding: 3px 8px; cursor: pointer; user-select: none; }' +
      '  .badge:hover { background: rgba(30, 30, 30, .95); }' +
      '  table { margin-top: 4px; border-collapse: collapse;' +
      '          background: rgba(30, 30, 30, .95); border-radius: 6px;' +
      '          padding: 6px 8px; max-width: 70vw; }' +
      '  td { padding: 1px 6px 1px 0; color: #ddd; }' +
      '  td:first-child { color: #888; }' +
      '  .hidden { display: none; }' +
      '</style>' +
      '<div class="badge" id="badge">' + oneLiner + '</div>' +
      (rows ? '<table class="hidden" id="detail">' + rows + '</table>' : '');

    var badge = root.getElementById('badge');
    var detail = root.getElementById('detail');
    if (badge && detail) {
      badge.addEventListener('click', function () { detail.classList.toggle('hidden'); });
    }
  }

  function renderWith(root, data, render) {
    if (!data.version || DEV_VERSIONS.test(data.version)) {
      root.innerHTML = '';
      return;
    }
    render(root, data);
  }

  // ---- data resolution ------------------------------------------------------

  function fetchJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.json();
    });
  }

  function directAttrs(el) {
    var data = {};
    DATA_KEYS.forEach(function (key) {
      var value = el.getAttribute(key);
      if (value) data[key] = value;
    });
    return data;
  }

  function mergeFetched(el, data) {
    var src = el.getAttribute('src');
    if (!src) return Promise.resolve(data);
    return fetchJson(src).then(function (remote) {
      DATA_KEYS.forEach(function (key) {
        var value = remote && remote[key];
        if (value && !data[key]) data[key] = String(value);
      });
      return data;
    });
  }

  function resolveData(el) {
    return mergeFetched(el, directAttrs(el)).then(function (data) {
      if (!data.project) {
        var first = (location.hostname || '').split('.')[0];
        if (first) data.project = first;
      }
      return data;
    });
  }

  // ---- swappable render module ---------------------------------------------

  // renderUrlFor turns a manifest URL into the latest render.js URL:
  // https://host/manifest.json -> https://host/version-display/v<n>/js-web/render.js
  function renderUrlFor(manifestUrl, latest) {
    var base = new URL('.', manifestUrl).href;
    return base + 'version-display/' + latest + '/js-web/render.js';
  }

  function adoptLatest(el, manifestUrl) {
    return fetchJson(manifestUrl).then(function (doc) {
      var feature = doc && doc.features && doc.features['version-display'];
      var latest = feature && feature.latest;
      if (!latest) return;
      el.__latestSeen = latest;
      return import(renderUrlFor(manifestUrl, latest)).then(function (mod) {
        if (mod && typeof mod.render === 'function') {
          el.__renderer = mod.render;
          el.__render();
        }
      });
    });
  }

  function startPolling(el) {
    stopPolling(el);
    var manifestUrl = el.getAttribute('manifest');
    var seconds = Number(el.getAttribute('refresh')) || POLL_SECONDS_DEFAULT;
    if (!manifestUrl || seconds <= 0) return;
    el.__timer = setInterval(function () {
      fetchJson(manifestUrl).then(function (doc) {
        var feature = doc && doc.features && doc.features['version-display'];
        var latest = feature && feature.latest;
        if (!latest || latest === el.__latestSeen) return;
        return adoptLatest(el, manifestUrl);
      }).catch(function () {
        // A failed poll keeps the current renderer; the next tick retries.
      });
    }, seconds * 1000);
  }

  function stopPolling(el) {
    if (el.__timer) {
      clearInterval(el.__timer);
      el.__timer = null;
    }
  }

  // ---- the element ----------------------------------------------------------

  class DeployInfo extends HTMLElement {
    static get observedAttributes() {
      return ['src', 'manifest', 'refresh'].concat(DATA_KEYS);
    }

    connectedCallback() {
      if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
      this.__render();
      var el = this;
      // Initial logic load: adopt the manifest's latest renderer (falling back
      // to the built-in one if the manifest or module is unreachable), then poll.
      var manifestUrl = el.getAttribute('manifest');
      if (manifestUrl) {
        adoptLatest(el, manifestUrl).catch(function () {
          el.__render(); // built-in renderer already ran; keep it
        });
      }
      resolveData(el).then(function (data) {
        el.__data = data;
        el.__render();
      }).catch(function () {
        el.__data = directAttrs(el);
        el.__render();
      });
      startPolling(el);
    }

    disconnectedCallback() {
      stopPolling(this);
    }

    attributeChangedCallback() {
      if (!this.shadowRoot) return;
      if (this.getAttribute('manifest') !== this.__lastManifest) {
        this.__lastManifest = this.getAttribute('manifest');
        startPolling(this);
      }
      var el = this;
      resolveData(el).then(function (data) {
        el.__data = data;
        el.__render();
      }).catch(function () {
        el.__data = directAttrs(el);
        el.__render();
      });
    }

    __render() {
      if (!this.shadowRoot) return;
      var data = this.__data;
      if (!data) return;
      renderWith(this.shadowRoot, data, this.__renderer || renderV4);
    }
  }

  customElements.define('deploy-info', DeployInfo);
})();
