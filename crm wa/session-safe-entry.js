'use strict';

/**
 * Stateful Hostinger session preflight.
 *
 * IMPORTANT:
 * - This file does NOT create an HTTP server and never calls listen().
 * - server.js remains the sole owner of Express/Baileys startup.
 * - The only responsibility here is keeping the WhatsApp device credential
 *   outside Hostinger's version-scoped build directory and preventing stale
 *   Signal peer sessions from being restored across deployments.
 */
require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');

const SIGNAL_REPAIR_VERSION = '2026-09-bad-mac-v1';

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.FUNCTIONS_EMULATOR ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.NOW_REGION
);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
}

function copyFileIfExists(sourceDir, targetDir, filename) {
  const source = path.join(sourceDir, filename);
  const target = path.join(targetDir, filename);
  if (!fs.existsSync(source) || fs.existsSync(target)) return false;
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  return true;
}

/**
 * Find the newest previous Hostinger build containing a Baileys creds.json.
 * Hostinger layout observed in production:
 *   .../hbuilds/versions/<build-id>/nodejs/
 *
 * We intentionally migrate ONLY the device credential and app-state keys.
 * session-*, pre-key-*, sender-key-* are peer encryption caches and MUST NOT
 * be copied because stale copies are the common source of Signal "Bad MAC".
 */
function findPreviousBuildAuthDir() {
  try {
    const nodeDir = __dirname;
    const currentBuildDir = path.dirname(nodeDir);
    const versionsDir = path.dirname(currentBuildDir);

    if (path.basename(versionsDir) !== 'versions' || !fs.existsSync(versionsDir)) {
      return null;
    }

    const candidates = fs
      .readdirSync(versionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const buildDir = path.join(versionsDir, entry.name);
        const authDir = path.join(buildDir, 'nodejs', 'auth_info_baileys');
        let mtimeMs = 0;
        try { mtimeMs = fs.statSync(buildDir).mtimeMs; } catch {}
        return { buildDir, authDir, mtimeMs };
      })
      .filter((item) => item.buildDir !== currentBuildDir)
      .filter((item) => fs.existsSync(path.join(item.authDir, 'creds.json')))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    return candidates[0]?.authDir || null;
  } catch (error) {
    console.warn('[SessionSafe] Tidak dapat memindai build sebelumnya:', error.message);
    return null;
  }
}

function migrateSafeAuth(sourceDir, targetDir) {
  if (!sourceDir || !fs.existsSync(sourceDir)) return 0;

  const SAFE_PATTERNS = [
    /^creds\.json$/,
    /^app-state-sync-key-.*\.json$/,
    /^app-state-sync-version-.*\.json$/,
  ];

  let copied = 0;
  for (const filename of fs.readdirSync(sourceDir)) {
    if (!SAFE_PATTERNS.some((pattern) => pattern.test(filename))) continue;
    try {
      if (copyFileIfExists(sourceDir, targetDir, filename)) copied++;
    } catch (error) {
      console.warn(`[SessionSafe] Gagal migrasi ${filename}:`, error.message);
    }
  }
  return copied;
}

function purgePeerSignalCaches(authDir) {
  if (!fs.existsSync(authDir)) return 0;

  let removed = 0;
  for (const filename of fs.readdirSync(authDir)) {
    // Preserve creds.json + app-state. These files are peer crypto caches only.
    if (
      filename.startsWith('session-') ||
      filename.startsWith('pre-key-') ||
      filename.startsWith('sender-key-') ||
      filename.startsWith('sender-key-memory-key-')
    ) {
      try {
        fs.rmSync(path.join(authDir, filename), { force: true });
        removed++;
      } catch (error) {
        console.warn(`[SessionSafe] Gagal membersihkan ${filename}:`, error.message);
      }
    }
  }
  return removed;
}

function runOneTimeSignalRepair(authDir) {
  const markerPath = path.join(authDir, '.signal-repair-version');
  let currentMarker = '';
  try {
    if (fs.existsSync(markerPath)) {
      currentMarker = fs.readFileSync(markerPath, 'utf8').trim();
    }
  } catch {}

  if (currentMarker === SIGNAL_REPAIR_VERSION) return;

  const removed = purgePeerSignalCaches(authDir);
  try {
    fs.writeFileSync(markerPath, SIGNAL_REPAIR_VERSION, 'utf8');
  } catch (error) {
    console.warn('[SessionSafe] Gagal menulis marker Signal repair:', error.message);
  }

  console.log(
    `[SessionSafe] One-time Bad MAC repair selesai: ${removed} Signal peer cache dibersihkan; creds.json/login dipertahankan.`,
  );
}

if (!isServerless) {
  const persistentAuthDir = process.env.AUTH_DIR
    ? path.resolve(process.env.AUTH_DIR)
    : path.join(os.homedir(), '.arsalynk-wa', 'auth_info_baileys');

  ensureDir(persistentAuthDir);

  const credsPath = path.join(persistentAuthDir, 'creds.json');
  let migrated = 0;

  // First rollout: preserve the currently paired device from the newest old
  // Hostinger build, but deliberately DO NOT bring stale Signal sessions.
  if (!fs.existsSync(credsPath)) {
    const previousAuthDir = findPreviousBuildAuthDir();
    if (previousAuthDir) {
      migrated = migrateSafeAuth(previousAuthDir, persistentAuthDir);
      console.log(
        `[SessionSafe] Migrasi credential aman dari build sebelumnya: ${migrated} file.`,
      );
    }
  }

  // Run exactly once for this repair version, even if AUTH_DIR was already set
  // manually. This fixes stale peer sessions without touching the device login.
  if (fs.existsSync(credsPath) || migrated > 0) {
    runOneTimeSignalRepair(persistentAuthDir);
  }

  // On stateful Hostinger, an old WA_SESSION_BASE64 bundle must never overwrite
  // a newer QR/device session unless explicitly opted in.
  const allowEnvRestore =
    String(process.env.RESTORE_SESSION_FROM_ENV || 'false').toLowerCase() === 'true';

  if (!allowEnvRestore) {
    if (process.env.WA_SESSION_BASE64 || process.env.WA_CREDS_BASE64) {
      console.warn(
        '[SessionSafe] WA_SESSION_BASE64/WA_CREDS_BASE64 diabaikan pada Hostinger stateful untuk mencegah stale Signal session.',
      );
    }
    delete process.env.WA_SESSION_BASE64;
    delete process.env.WA_CREDS_BASE64;
  }

  process.env.AUTH_DIR = persistentAuthDir;
  console.log(`[SessionSafe] Persistent AUTH_DIR aktif: ${persistentAuthDir}`);
}

module.exports = require('./server');
