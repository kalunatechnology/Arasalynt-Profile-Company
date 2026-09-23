'use strict';

const express = require('express');

const isManagedHttpRuntime = Boolean(
  process.env.LSNODE_SOCKET ||
  process.env.LSNODE_ROOT ||
  process.env.LSNODE_APP_ROOT ||
  process.env.LSWS_HOME ||
  process.env.PASSENGER_APP_ENV ||
  process.env.PASSENGER_INSTANCE_REGISTRY_DIR
);

if (isManagedHttpRuntime) {
  const originalListen = express.application.listen;

  express.application.listen = function hostingerSafeListen(...args) {
    const stack = new Error().stack || '';
    const isGatewayInternalListen =
      stack.includes('server.js') && stack.includes('bootstrapRuntime');

    // OpenLiteSpeed/LSNode performs reverse port binding automatically after
    // requiring the exported Express app. server.js also reaches app.listen()
    // asynchronously after DB initialization. Suppress only that second call,
    // but still execute its callback so startWhatsAppBot() runs normally.
    if (isGatewayInternalListen) {
      const maybeCallback = args[args.length - 1];
      console.log(
        '[Hostinger] Managed HTTP listener detected; duplicate internal app.listen() suppressed.'
      );
      if (typeof maybeCallback === 'function') {
        setImmediate(() => maybeCallback());
      }
      return this;
    }

    return originalListen.apply(this, args);
  };
}

module.exports = { isManagedHttpRuntime };
