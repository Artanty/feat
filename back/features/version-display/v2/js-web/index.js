(function () {
  'use strict';

  // v2: initial state shows ONLY tag-version (serf TAG_VERSION → v1.2.3.4.5.6);
  // full info gains tech-stack (TECH_STACK), slave-repo (TARGET_GIT_REPO),
  // slave-source (TARGET_GIT_USER). All values arrive as attributes — the
  // consuming page renders them from its .env.
  var ATTRS = [
    'version', 'project', 'namespace', 'commit', 'repo',
    'tag-version', 'tech-stack', 'slave-repo', 'slave-source'
  ];
  var DEV_VERSIONS = /^0\.0\.0(\.0)?$/;
  // expanded table shows everything except the badge's own value
  var TABLE_ATTRS = [
    'project', 'namespace', 'version', 'commit', 'repo',
    'tech-stack', 'slave-repo', 'slave-source'
  ];

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // serf stores git_tag without a guaranteed prefix; display is always v1.2.3.4.5.6
  function normalizeTag(tag) {
    if (!tag) return '';
    return tag.charAt(0) === 'v' ? tag : 'v' + tag;
  }

  class DeployInfo extends HTMLElement {
    static get observedAttributes() { return ATTRS; }

    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.shadowRoot) this.render(); }

    render() {
      var get = function (name) { return this.getAttribute(name) || ''; }.bind(this);
      var version = get('version');
      var tag = normalizeTag(get('tag-version'));

      // badge: ONLY the tag; fallback to the old one-liner when no tag given;
      // silent when there is nothing real to show (same rule as v1)
      var badgeText = tag;
      if (!badgeText && version && !DEV_VERSIONS.test(version)) {
        badgeText = get('project') +
          (get('namespace') ? '@' + get('namespace') : '') +
          ' v' + version;
      }

      if (!badgeText) {
        if (this.shadowRoot) this.shadowRoot.innerHTML = '';
        return;
      }
      badgeText = esc(badgeText);

      if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
      var rows = TABLE_ATTRS.filter(function (name) { return get(name); })
        .map(function (name) {
          return '<tr><td>' + esc(name.replace(/-/g, ' ')) + '</td><td>' +
            esc(get(name)) + '</td></tr>';
        }).join('');

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
        '<div class="badge" id="badge">' + badgeText + '</div>' +
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
