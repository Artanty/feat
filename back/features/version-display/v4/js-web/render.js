/**
 * deploy-info v4 render module — the swappable half of the feature.
 *
 * The pinned index.js shell (stable custom-element class) imports the LATEST
 * version's render.js it finds via the feat manifest and calls its default
 * export with (shadowRoot, data):
 *
 *   data = { version, project, namespace, commit, repo }  (all plain strings,
 *   possibly empty; version is guaranteed real — dev values never reach here)
 *
 * A new release = a new version directory with its own render.js (never edit a
 * published one). The built-in fallback in index.js must stay byte-compatible
 * with this markup so a failed module fetch degrades to the same UI.
 */
export function render(root, data) {
  var esc = function (value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };

  var rows = ['project', 'namespace', 'commit', 'repo']
    .filter(function (name) { return data[name]; })
    .map(function (name) {
      return '<tr><td>' + esc(name) + '</td><td>' + esc(data[name]) + '</td></tr>';
    })
    .join('');
  // v4 contract: the badge one-liner is the VERSION ONLY — project and friends moved into
  // the click-expand rows.
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

export default { render: render };
