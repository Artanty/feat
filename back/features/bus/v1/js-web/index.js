(function () {
  'use strict';

  // featBus — reference implementation of the feat feature-contract v1
  // (docs/feature-contract.md). Stateless helper: the transport is CustomEvents on
  // document, so features loaded as separate bundles need no shared instance and no
  // load order. If a featBus with the same contract version already exists, this
  // script is a no-op — never define it twice, never break the host page.
  var CONTRACT = 1;
  var BUS_EVENT = 'feat-bus';
  var LOG_LIMIT = 200;
  var DEFAULT_TIMEOUT_MS = 5000;

  if (window.featBus && window.featBus.contract === CONTRACT) return;

  var handlers = [];      // {pattern, fn} — passive listeners (featBus.on)
  var served = {};        // event -> [handler] — active responders (featBus.serve)
  var logBuffer = [];

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function envelope(kind, from, to, event, payload, reqId) {
    return {
      id: uuid(),
      contract: CONTRACT,
      kind: kind,
      from: from,
      to: to,
      event: event,
      payload: payload,
      reqId: reqId || undefined,
      ts: Date.now(),
    };
  }

  function dispatch(env) {
    logBuffer.push(env);
    if (logBuffer.length > LOG_LIMIT) logBuffer.shift();
    document.dispatchEvent(new CustomEvent(BUS_EVENT, { detail: env }));
  }

  function matches(pattern, env) {
    if (pattern === '*') return true;
    if (pattern.indexOf('signal:') === 0) return env.kind === 'signal' && env.event === pattern.slice(7);
    if (pattern.indexOf('request:') === 0) return env.kind === 'request' && env.event === pattern.slice(8);
    if (pattern.indexOf('from:') === 0) return env.from === pattern.slice(5);
    return env.event === pattern; // bare event name = any kind
  }

  document.addEventListener(BUS_EVENT, function (e) {
    var env = e.detail;
    if (!env || env.contract !== CONTRACT) return;

    // Route requests to the first registered serve() handler for that event.
    // Broadcast requests (to === '*') are announcements — never answered.
    if (env.kind === 'request' && env.to !== '*') {
      var responders = served[env.event];
      if (!responders || responders.length === 0) {
        dispatch(envelope('error', env.to, env.from, env.event,
          { code: 'NO_HANDLER', message: 'nobody serves ' + env.event }, env.reqId));
      } else {
        var handler = responders[0];
        Promise.resolve().then(function () {
          return handler(env.payload, env.from);
        }).then(function (result) {
          dispatch(envelope('response', env.to, env.from, env.event, result, env.reqId));
        }, function (err) {
          dispatch(envelope('error', env.to, env.from, env.event,
            { code: 'HANDLER_ERROR', message: String(err && err.message || err) }, env.reqId));
        });
      }
    }

    // Passive listeners always see every envelope; a listener must never break the bus.
    handlers.slice().forEach(function (h) {
      if (matches(h.pattern, env)) {
        try { h.fn(env); } catch (err) { /* ignore */ }
      }
    });
  });

  window.featBus = {
    contract: CONTRACT,

    signal: function (event, payload, opts) {
      var o = opts || {};
      dispatch(envelope('signal', o.from || 'anonymous', o.to || '*', event, payload));
    },

    request: function (event, payload, opts) {
      // addressed by EVENT alone — serve() is keyed by event, the first handler wins.
      // opts.to still overrides for directed requests (logging/filtering).
      var o = opts || {};
      var timeoutMs = o.timeoutMs || DEFAULT_TIMEOUT_MS;
      var reqId = uuid();
      var from = o.from || 'anonymous';
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          document.removeEventListener(BUS_EVENT, onReply);
          reject({ code: 'TIMEOUT', message: 'no answer for ' + event + ' within ' + timeoutMs + 'ms' });
        }, timeoutMs);

        function onReply(e) {
          var env = e.detail;
          // the requester's own request envelope carries the same reqId — only
          // response/error kinds answer it
          if (!env || env.reqId !== reqId || env.kind === 'request') return;
          clearTimeout(timer);
          document.removeEventListener(BUS_EVENT, onReply);
          if (env.kind === 'response') resolve(env.payload);
          else reject(env.payload || { code: 'HANDLER_ERROR', message: 'unknown error' });
        }

        document.addEventListener(BUS_EVENT, onReply);
        var env = envelope('request', from, o.to, event, payload, reqId);
        if (!env.to) delete env.to; // broadcast requests (to === '*') are announcements — never answered
        dispatch(env);
      });
    },

    serve: function (event, handler) {
      (served[event] = served[event] || []).push(handler);
      return function () {
        var list = served[event] || [];
        var i = list.indexOf(handler);
        if (i !== -1) list.splice(i, 1);
      };
    },

    on: function (pattern, fn) {
      var h = { pattern: pattern, fn: fn };
      handlers.push(h);
      return function () {
        var i = handlers.indexOf(h);
        if (i !== -1) handlers.splice(i, 1);
      };
    },

    log: function () {
      return logBuffer.slice();
    },
  };
})();
