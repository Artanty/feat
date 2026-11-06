(function () {
  'use strict';

  var ATTRS = ['version', 'project', 'namespace', 'commit', 'repo'];
  var DEV_VERSIONS = /^0\.0\.0(\.0)?$/;

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  class DeployInfo extends HTMLElement {
    static get observedAttributes() { return ATTRS; }

    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.shadowRoot) this.render(); }

    render() {
      var get = function (name) { return this.getAttribute(name) || ''; }.bind(this);
      var version = get('version');

      if (!version || DEV_VERSIONS.test(version)) {
        if (this.shadowRoot) this.shadowRoot.innerHTML = '';
        return;
      }

      if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
      var rows = ATTRS.slice(1).filter(function (name) { return get(name); })
        .map(function (name) {
          return '<tr><td>' + esc(name) + '</td><td>' + esc(get(name)) + '</td></tr>';
        }).join('');
      var oneLiner = esc(get('project')) + (get('namespace') ? '@' + esc(get('namespace')) : '') +
        ' v' + esc(version);

      this.shadowRoot.innerHTML =
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

      var badge = this.shadowRoot.getElementById('badge');
      var detail = this.shadowRoot.getElementById('detail');
      if (badge && detail) badge.addEventListener('click', function () {
        detail.classList.toggle('hidden');
      });
    }
  }

  customElements.define('deploy-info', DeployInfo);
})();
