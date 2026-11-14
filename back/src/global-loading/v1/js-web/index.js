(function () {
  'use strict';

  // feat global-loading v1 — full-screen blocking loader, driven by bus signals.
  // Listens DIRECTLY on the bus transport (CustomEvents on document), so load order
  // vs the bus helper doesn't matter and there is no featBus dependency at all.
  //
  //   signal 'global-loading-start'  → show backdrop (counter-based: overlapping
  //   signal 'global-loading-end'    → hide (when the last one ends)
  //
  // Today http-gate emits these around a recovery episode (spec/http-gate.md); any
  // feature may signal the same pair. The backdrop blocks ALL interaction — that is
  // the point: the app is frozen while traffic is paused anyway.
  if (window.featGlobalLoading) return; // never define twice
  var BUS_EVENT = 'feat-bus';
  var START = 'global-loading-start';
  var END = 'global-loading-end';

  var count = 0;
  var overlay = null;

  function build() {
    var el = document.createElement('div');
    el.id = 'feat-global-loading';
    el.setAttribute('style',
      'position:fixed;inset:0;z-index:2147483647;display:none;' +
      'align-items:center;justify-content:center;' +
      'background:rgba(22,22,26,.66);backdrop-filter:blur(1px);' +
      'cursor:wait;'); // pointer events stay on — that's what blocks interaction
    el.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;gap:12px;' +
      'font:13px/1.4 system-ui,sans-serif;color:#eee">' +
      '  <div style="width:28px;height:28px;border-radius:50%;' +
      '       border:3px solid rgba(255,255,255,.25);border-top-color:#eee;' +
      '       animation:feat-gl-spin .8s linear infinite"></div>' +
      '  <div>loading…</div>' +
      '</div>' +
      '<style>@keyframes feat-gl-spin{to{transform:rotate(360deg)}}</style>';
    return el;
  }

  function show() {
    if (!overlay) {
      overlay = build();
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
  }

  function hide() {
    if (overlay) overlay.style.display = 'none';
  }

  document.addEventListener(BUS_EVENT, function (e) {
    var env = e.detail;
    if (!env || env.kind !== 'signal') return;
    if (env.event === START) { count += 1; show(); }
    else if (env.event === END) { count = Math.max(0, count - 1); if (!count) hide(); }
  });

  window.featGlobalLoading = { version: 1 };
})();
