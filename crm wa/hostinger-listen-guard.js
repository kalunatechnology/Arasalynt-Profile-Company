'use strict';

const express = require('express');

const originalListen = express.application.listen;

express.application.listen = function hostingerSafeListen(...args) {
  const stack = new Error().stack || '';
  const isGatewayInternalListen =
    stack.includes('server.js') && stack.includes('bootstrapRuntime');

  // This file is loaded only by hostinger-entry.js. Therefore the runtime is
  // already known to be the managed Hostinger/OpenLiteSpeed entrypoint; do not
  // depend on undocumented LSNode environment variables. Suppress only the
  // second listener initiated asynchronously by server.js after DB startup.
  if (isGatewayInternalListen) {
    const maybeCallback = args[args.length - 1];
    console.log(
      '[Hostinger] Duplicate internal app.listen() suppressed; platform owns the HTTP listener.'
    );

    // server.js starts Baileys from this callback, so preserve the callback even
    // though no second socket/listener is created.
    if (typeof maybeCallback === 'function') {
      setImmediate(() => maybeCallback());
    }

    return this;
  }

  // Any non-gateway call remains untouched. This keeps the module safe if the
  // entrypoint is reused in a test harness or another framework integration.
  return originalListen.apply(this, args);
};

module.exports = {
  managedEntrypoint: true,
};
