'use strict';

require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.FUNCTIONS_EMULATOR ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.NOW_REGION
);

const restoreSessionFromEnv =
  String(process.env.RESTORE_SESSION_FROM_ENV || '').toLowerCase() === 'true';
const forceFreshSession =
  String(process.env.WA_FORCE_FRESH_SESSION || '').toLowerCase() === 'true';

function resolveStatefulAuthPath() {
  if (process.env.AUTH_DIR) return path.resolve(process.env.AUTH_DIR);
  return path.join(__dirname, 'auth_info_baileys');
}

// Hostinger/VPS memiliki filesystem persisten. WA_SESSION_BASE64 ditujukan untuk
// serverless dan dapat meracuni startup bila bundle lama terus direstore.
if (!isServerless && !restoreSessionFromEnv) {
  const hadSessionEnv = Boolean(
    process.env.WA_SESSION_BASE64 || process.env.WA_CREDS_BASE64
  );

  if (hadSessionEnv) {
    console.warn(
      '[Bootstrap] WA_SESSION_BASE64/WA_CREDS_BASE64 diabaikan pada stateful runtime. ' +
      'Gunakan RESTORE_SESSION_FROM_ENV=true hanya bila restore memang disengaja.'
    );
  }

  delete process.env.WA_SESSION_BASE64;
  delete process.env.WA_CREDS_BASE64;
}

// Recovery eksplisit: aktifkan sekali untuk membuang kredensial lokal yang stale
// dan memaksa Baileys menghasilkan QR baru. Setelah QR berhasil, kembalikan false.
if (!isServerless && forceFreshSession) {
  const authPath = resolveStatefulAuthPath();
  try {
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
      console.warn(`[Bootstrap] WA_FORCE_FRESH_SESSION aktif. Auth lama dihapus: ${authPath}`);
    }
  } catch (error) {
    console.error('[Bootstrap] Gagal membersihkan auth lama:', error.message);
  }
}

const app = require('./server');

// Startup observability untuk Hostinger/VPS. Tidak mengubah behavior gateway;
// hanya mencetak status nyata agar state "initializing" tidak menjadi black box.
if (!isServerless) {
  const port = Number(process.env.PORT || 3005);
  const delayMs = Number(process.env.WA_STARTUP_DIAGNOSTIC_DELAY_MS || 15000);

  setTimeout(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`http://127.0.0.1:${port}/api/status`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const status = await response.json().catch(() => ({}));
      console.log('[Bootstrap] WhatsApp runtime status:', {
        status: status.status,
        phone: status.phone || null,
        hasSessionEnv: status.hasSessionEnv,
        authPath: status.authPath,
        lastDisconnectReason: status.lastDisconnectReason || null,
      });

      if (['initializing', 'error', 'disconnected'].includes(status.status)) {
        console.warn(
          '[Bootstrap] WhatsApp belum siap. Jika kredensial lokal stale, set ' +
          'WA_FORCE_FRESH_SESSION=true untuk satu deployment lalu scan QR baru.'
        );
      }
    } catch (error) {
      console.warn('[Bootstrap] Startup diagnostic gagal:', error.message);
    }
  }, Math.max(5000, delayMs));
}

module.exports = app;
