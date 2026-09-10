require('dotenv').config();
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

const app = express();
app.set('trust proxy', 1);

app.use((req, res, next) => {
  const cleanUrl = req.url.split('?')[0];
  if (['/favicon.ico','/favicon.png','/apple-touch-icon.png','/apple-touch-icon-precomposed.png'].includes(cleanUrl)) {
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    return res.status(204).end();
  }
  if (cleanUrl === '/robots.txt') {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send('User-agent: *\nDisallow: /api/\n');
  }
  next();
});

const PORT = process.env.PORT || 3005;
const NEXTJS_WEBHOOK_URL = process.env.NEXTJS_WEBHOOK_URL || 'http://localhost:3000/api/whatsapp/webhook';
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || process.env.API_KEY || '';

const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.FUNCTIONS_EMULATOR || process.env.LAMBDA_TASK_ROOT || process.env.NOW_REGION
);

function resolveAuthPath() {
  if (process.env.AUTH_DIR) return path.resolve(process.env.AUTH_DIR);
  if (isServerless) {
    const tmp = path.join(os.tmpdir(), 'auth_info_baileys');
    if (!fs.existsSync(tmp)) try { fs.mkdirSync(tmp, { recursive: true }); } catch {}
    return tmp;
  }
  const local = path.join(__dirname, 'auth_info_baileys');
  try {
    if (!fs.existsSync(local)) fs.mkdirSync(local, { recursive: true });
    fs.accessSync(local, fs.constants.W_OK);
    return local;
  } catch {
    const fallback = path.join(os.tmpdir(), 'auth_info_baileys');
    if (!fs.existsSync(fallback)) try { fs.mkdirSync(fallback, { recursive: true }); } catch {}
    return fallback;
  }
}
const AUTH_PATH = resolveAuthPath();

// ============================================================
// PURE-JS MESSAGE STORE — untuk durable getMessage (Baileys retry)
// PERINGATAN KRITIS: Ini BUKAN auth store.
// File auth_info_baileys/ TIDAK BOLEH dihapus manual saat runtime.
// Store ini menyimpan serialized IMessage ke file JSON murni (tanpa SQLite/Python/C++).
// ============================================================
let _baileysBufferJSON = null;
const MSG_STORE_DIR = path.join(AUTH_PATH, 'msg_store');

function getMsgStoreDir() {
  try {
    if (!fs.existsSync(MSG_STORE_DIR)) {
      fs.mkdirSync(MSG_STORE_DIR, { recursive: true });
    }
    return MSG_STORE_DIR;
  } catch {
    const fallback = path.join(os.tmpdir(), 'wa_msg_store');
    if (!fs.existsSync(fallback)) try { fs.mkdirSync(fallback, { recursive: true }); } catch {}
    return fallback;
  }
}

function cleanExpiredStoredMessages() {
  try {
    const dir = getMsgStoreDir();
    const files = fs.readdirSync(dir);
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 hari
    let deleted = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(fullPath);
          deleted++;
        }
      } catch {}
    }
    if (deleted > 0) console.log(`[MsgStore] Bersihkan ${deleted} pesan kadaluarsa.`);
    return deleted;
  } catch (err) {
    return 0;
  }
}
cleanExpiredStoredMessages();

function storeMessage(msg) {
  if (!msg || !msg.key || !msg.key.id || !msg.message) return;
  try {
    const dir = getMsgStoreDir();
    const replacer = _baileysBufferJSON && _baileysBufferJSON.replacer;
    const serialized = replacer ? JSON.stringify(msg.message, replacer) : JSON.stringify(msg.message);
    const safeId = String(msg.key.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    fs.writeFileSync(path.join(dir, safeId + '.json'), serialized, 'utf-8');
  } catch (err) {
    console.warn('[MsgStore] Gagal simpan ' + (msg.key && msg.key.id) + ': ' + err.message);
  }
}

async function getMessageFromStore(key) {
  if (key && key.id && msgHistoryMap.has(key.id)) return msgHistoryMap.get(key.id);
  if (!key || !key.id) return undefined;
  try {
    const dir = getMsgStoreDir();
    const safeId = String(key.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(dir, safeId + '.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const reviver = _baileysBufferJSON && _baileysBufferJSON.reviver;
      const parsed = reviver ? JSON.parse(raw, reviver) : JSON.parse(raw);
      if (parsed) {
        msgHistoryMap.set(key.id, parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[MsgStore] Gagal ambil ' + key.id + ': ' + err.message);
  }
  return undefined;
}

// ============================================================
// LIVE CHAT SQLITE STORE
// Menyimpan semua pesan live chat (user & CS) secara persisten di server ini.
// Next.js Vercel akan poll endpoint /api/messages di server ini, bukan SQLite /tmp mereka sendiri.
// ============================================================
const LIVE_CHAT_DB_PATH = process.env.LIVE_CHAT_DB_PATH
  ? path.resolve(process.env.LIVE_CHAT_DB_PATH)
  : path.join(__dirname, 'live_chat.db');

let _liveChatDb = null;
function getLiveChatDb() {
  if (_liveChatDb) return _liveChatDb;
  _liveChatDb = new Database(LIVE_CHAT_DB_PATH);
  _liveChatDb.pragma('journal_mode = WAL');
  _liveChatDb.pragma('foreign_keys = ON');
  _liveChatDb.exec(`
    CREATE TABLE IF NOT EXISTS live_chat_sessions (
      id          TEXT PRIMARY KEY,
      last_message TEXT,
      updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS live_chat_messages (
      id                 TEXT PRIMARY KEY,
      session_id         TEXT NOT NULL,
      sender             TEXT NOT NULL CHECK(sender IN ('user','human_cs')),
      content            TEXT NOT NULL,
      created_at         TEXT NOT NULL,
      wa_message_id      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lcm_session ON live_chat_messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_lcm_wa_id   ON live_chat_messages(wa_message_id);
  `);
  console.log('[LiveChatDB] SQLite siap di: ' + LIVE_CHAT_DB_PATH);
  return _liveChatDb;
}

/** Simpan pesan live chat ke SQLite (idempoten via wa_message_id) */
function saveLiveChatMessage(sessionId, sender, content, waMessageId) {
  if (!sessionId || !content) return null;
  const db = getLiveChatDb();
  // Dedup via wa_message_id
  if (waMessageId) {
    const existing = db.prepare('SELECT id FROM live_chat_messages WHERE wa_message_id = ? LIMIT 1').get(waMessageId);
    if (existing) return existing;
  }
  const id = 'lcm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const now = new Date().toISOString();
  db.prepare(
    'INSERT OR IGNORE INTO live_chat_sessions (id, last_message, updated_at) VALUES (?, ?, ?)'
  ).run(sessionId, content.slice(0, 100), now);
  db.prepare(
    'UPDATE live_chat_sessions SET last_message = ?, updated_at = ? WHERE id = ?'
  ).run(content.slice(0, 100), now, sessionId);
  db.prepare(
    'INSERT INTO live_chat_messages (id, session_id, sender, content, created_at, wa_message_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, sessionId, sender, content, now, waMessageId || null);
  return { id, sessionId, sender, content, createdAt: now };
}

/** Ambil semua pesan untuk sessionId tertentu */
function getLiveChatMessages(sessionId) {
  const db = getLiveChatDb();
  return db.prepare(
    'SELECT id, session_id as sessionId, sender, content, created_at as createdAt FROM live_chat_messages WHERE session_id = ? ORDER BY created_at ASC'
  ).all(sessionId);
}

/** Hapus pesan lebih dari 1 hari */
function cleanOldLiveChatMessages() {
  try {
    const db = getLiveChatDb();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare('DELETE FROM live_chat_messages WHERE created_at < ?').run(cutoff);
    db.prepare('DELETE FROM live_chat_sessions WHERE updated_at < ?').run(cutoff);
    if (result.changes > 0) console.log('[LiveChatDB] Hapus ' + result.changes + ' pesan kadaluarsa.');
  } catch (err) {
    console.warn('[LiveChatDB] Cleanup error: ' + err.message);
  }
}

// Jalankan cleanup saat startup dan setiap 6 jam
getLiveChatDb();
cleanOldLiveChatMessages();
setInterval(cleanOldLiveChatMessages, 6 * 60 * 60 * 1000);

// ============================================================
// BAILEYS LAZY IMPORT
// ============================================================
let baileysModule = null;
async function getBaileys() {
  if (!baileysModule) {
    const mod = await import('@whiskeysockets/baileys');
    baileysModule = {
      makeWASocket:                mod.default && mod.default.default || mod.default || mod.makeWASocket,
      useMultiFileAuthState:       mod.useMultiFileAuthState,
      makeCacheableSignalKeyStore: mod.makeCacheableSignalKeyStore,
      DisconnectReason:            mod.DisconnectReason,
      fetchLatestBaileysVersion:   mod.fetchLatestBaileysVersion,
      downloadMediaMessage:        mod.downloadMediaMessage,
      normalizeMessageContent:     mod.normalizeMessageContent,
      getContentType:              mod.getContentType,
      BufferJSON:                  mod.BufferJSON,
      Browsers:                    mod.Browsers,
    };
    _baileysBufferJSON = mod.BufferJSON;
  }
  return baileysModule;
}

// ============================================================
// SESSION RESTORE FROM ENV
// ============================================================
function restoreSessionFromEnv() {
  const envSession = process.env.WA_SESSION_BASE64 || process.env.WA_CREDS_BASE64;
  if (!envSession) return;
  try {
    if (!fs.existsSync(AUTH_PATH)) fs.mkdirSync(AUTH_PATH, { recursive: true });
    const decoded = Buffer.from(envSession, 'base64').toString('utf-8');
    if (decoded.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(decoded);
        if (parsed.__is_bundle && parsed.files) {
          const entries = Object.entries(parsed.files);
          for (let i = 0; i < entries.length; i++) {
            fs.writeFileSync(path.join(AUTH_PATH, entries[i][0]), Buffer.from(entries[i][1], 'base64'));
          }
          console.log('Pulihkan ' + Object.keys(parsed.files).length + ' file session dari env.');
          return;
        } else if (parsed.noiseKey || parsed.signedIdentityKey) {
          fs.writeFileSync(path.join(AUTH_PATH, 'creds.json'), decoded, 'utf-8');
          console.log('Pulihkan creds.json dari env.');
          return;
        }
      } catch {}
    }
    fs.writeFileSync(path.join(AUTH_PATH, 'creds.json'), decoded, 'utf-8');
    console.log('Pulihkan auth dari WA_SESSION_BASE64.');
  } catch (err) {
    console.warn('Gagal pulihkan session dari env: ' + err.message);
  }
}
restoreSessionFromEnv();

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(function(o) { return o.trim(); })
    : ['https://www.arsalynk.com', 'https://arsalynk.com'],
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','x-gateway-secret','x-api-key'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

function requireGatewayAuth(req, res, next) {
  if (!GATEWAY_SECRET) return next();
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const key = req.headers['x-gateway-secret'] || req.headers['x-api-key'] || req.query.secret;
  if (token === GATEWAY_SECRET || key === GATEWAY_SECRET) return next();
  return res.status(401).json({ error: 'Unauthorized: Invalid or missing Gateway Secret/API Key' });
}

// ============================================================
// GLOBAL STATE
// ============================================================
let sock = null;
let connectionStatus = 'initializing';
let currentQrImage = null;
let connectedUserPhone = null;
let lastDisconnectReason = null;
let isStartingBot = false;
let lastInboundMessageAt = null;
let lastSuccessfulDecryptAt = null;
let lastSuccessfulWebhookAt = null;
const processedMessageIds = new Set();
const startupTime = new Date().toISOString();

const pipelineCounters = {
  totalUpsertEvents: 0,
  totalMessagesInBatch: 0,
  notifyMessages: 0,
  appendMessages: 0,
  appendSkippedOld: 0,
  duplicateSkipped: 0,
  nullMessageDrop: 0,
  noContentDrop: 0,
  echoSystemMsgSkip: 0,
  successfullyProcessed: 0,
  webhookAttempts: 0,
  webhookSuccess: 0,
  webhookFailures: 0,
  retryQueueAdded: 0,
};

const msgHistoryMap = new Map();

// ============================================================
// RECONNECT STATE
// ============================================================
let reconnectAttempts = 0;
let lastConnectedAt = 0;
const RECONNECT_BASE_MS = 1500;
const RECONNECT_MAX_MS  = 60000;

function getReconnectDelay(statusCode) {
  if (lastConnectedAt && Date.now() - lastConnectedAt > 60000) reconnectAttempts = 0;
  reconnectAttempts++;
  if (statusCode === 515) return 500;
  const base = RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts - 1);
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  const delay = Math.min(Math.round(base + jitter), RECONNECT_MAX_MS);
  addDiagLog('warn', 'Reconnect attempt #' + reconnectAttempts + ', delay: ' + delay + 'ms');
  return delay;
}

// ============================================================
// JID CACHE
// ============================================================
const jidCache = new Map();
const JID_CACHE_TTL = 10 * 60 * 1000;
function getCachedJid(n) {
  const e = jidCache.get(n);
  if (e && Date.now() - e.ts < JID_CACHE_TTL) return e.jid;
  jidCache.delete(n);
  return null;
}
function setCachedJid(n, jid) {
  jidCache.set(n, { jid: jid, ts: Date.now() });
  if (jidCache.size > 500) jidCache.delete(jidCache.keys().next().value);
}

// ============================================================
// OUTBOUND QUEUE
// ============================================================
const outboundQueue = [];
let outboundFlushTimer = null;
function flushOutboundQueue() {
  outboundFlushTimer = null;
  if (!outboundQueue.length || connectionStatus !== 'connected' || !sock) return;
  addDiagLog('info', 'Flush outbound queue: ' + outboundQueue.length + ' pesan...');
  const batch = outboundQueue.splice(0);
  for (let i = 0; i < batch.length; i++) {
    sendMessageWithTimeout(batch[i].jid, batch[i].msgOptions)
      .then(batch[i].resolve)
      .catch(batch[i].reject);
  }
}
function scheduleOutboundFlush(ms) {
  if (!outboundFlushTimer) outboundFlushTimer = setTimeout(flushOutboundQueue, ms || 200);
}

async function sendMessageWithTimeout(jid, opts, ms) {
  const timeout = ms || 15000;
  return Promise.race([
    sock.sendMessage(jid, opts),
    new Promise(function(_, rej) { setTimeout(function() { rej(new Error('sendMessage timeout ' + timeout + 'ms')); }, timeout); }),
  ]);
}

async function resolveJid(target) {
  let jid = target.includes('@') ? target.replace('@c.us', '@s.whatsapp.net') : (target + '@s.whatsapp.net');
  const n = jid.split('@')[0];
  if (jid.includes('@g.us')) return jid;
  const cached = getCachedJid(n);
  if (cached) return cached;
  if (sock && typeof sock.onWhatsApp === 'function') {
    try {
      const list = await Promise.race([
        sock.onWhatsApp(n),
        new Promise(function(_, r) { setTimeout(function() { r(new Error('timeout')); }, 5000); }),
      ]);
      if (list && list[0] && list[0].exists && list[0].jid) jid = list[0].jid;
    } catch {}
  }
  setCachedJid(n, jid);
  return jid;
}

// ============================================================
// DIAGNOSTICS LOG
// ============================================================
const diagnosticsLog = [];
function addDiagLog(level, msg, meta) {
  const entry = { ts: new Date().toISOString(), level: level, msg: msg };
  if (meta) entry.meta = meta;
  diagnosticsLog.push(entry);
  if (diagnosticsLog.length > 200) diagnosticsLog.shift();
  if (level === 'error') console.error('[DIAG] ' + msg);
  else if (level === 'warn') console.warn('[DIAG] ' + msg);
  else console.log('[DIAG] ' + msg);
}

// ============================================================
// FAILED WEBHOOK QUEUE
// ============================================================
const failedWebhookQueue = [];
let webhookRetryTimer = null;
function scheduleWebhookRetry() {
  if (webhookRetryTimer) return;
  webhookRetryTimer = setTimeout(async function() {
    webhookRetryTimer = null;
    if (!failedWebhookQueue.length) return;
    const item = failedWebhookQueue[0];
    addDiagLog('info', 'Retry webhook (' + failedWebhookQueue.length + ' antrian)...');
    if (await forwardToWebhook(item.payload, 1, true)) {
      failedWebhookQueue.shift();
      addDiagLog('info', 'Retry webhook OK! Sisa: ' + failedWebhookQueue.length);
    } else {
      item.attempts = (item.attempts || 1) + 1;
      if (item.attempts >= 10) {
        addDiagLog('warn', 'Payload dibuang 10x gagal: msgId=' + (item.payload && item.payload.payload && item.payload.payload.id || '-'));
        failedWebhookQueue.shift();
      }
    }
    if (failedWebhookQueue.length) scheduleWebhookRetry();
  }, 15000);
}

// ============================================================
// MESSAGE CONTENT EXTRACTOR (menggunakan Baileys normalizeMessageContent)
// ============================================================
function extractMessageContent(msg) {
  if (!msg || !msg.message) return { text: '', mediaType: null };
  const normalize = baileysModule && baileysModule.normalizeMessageContent;
  const getType   = baileysModule && baileysModule.getContentType;
  const m = normalize ? (normalize(msg.message) || msg.message) : msg.message;
  if (!m) return { text: '', mediaType: null };
  const contentType = getType ? getType(m) : null;

  const text =
    m.conversation ||
    (m.extendedTextMessage && m.extendedTextMessage.text) ||
    (m.imageMessage && m.imageMessage.caption) ||
    (m.videoMessage && m.videoMessage.caption) ||
    (m.documentMessage && (m.documentMessage.caption || m.documentMessage.fileName)) ||
    (m.documentWithCaptionMessage && m.documentWithCaptionMessage.message && m.documentWithCaptionMessage.message.documentMessage && m.documentWithCaptionMessage.message.documentMessage.caption) ||
    (m.templateButtonReplyMessage && m.templateButtonReplyMessage.selectedDisplayText) ||
    (m.buttonsResponseMessage && m.buttonsResponseMessage.selectedButtonId) ||
    (m.listResponseMessage && m.listResponseMessage.singleSelectReply && m.listResponseMessage.singleSelectReply.selectedRowId) ||
    null;

  if (text) return { text: text, mediaType: null };
  if (m.imageMessage) return { text: '[Foto]', mediaType: 'image' };
  if (m.videoMessage) return { text: '[Video]', mediaType: 'video' };
  if (m.audioMessage) return { text: m.audioMessage.ptt ? '[Pesan Suara]' : '[Audio]', mediaType: 'audio' };
  if (m.stickerMessage) return { text: '[Stiker]', mediaType: 'sticker' };
  if (m.documentMessage) return { text: '[Dokumen: ' + (m.documentMessage.fileName || 'file') + ']', mediaType: 'document' };
  if (m.contactMessage) return { text: '[Kontak: ' + (m.contactMessage.displayName || '') + ']', mediaType: 'contact' };
  if (m.locationMessage) return { text: '[Lokasi]', mediaType: 'location' };
  if (m.reactionMessage || m.protocolMessage || m.senderKeyDistributionMessage) return { text: '', mediaType: null, isProtocol: true };
  if (contentType) return { text: '', mediaType: null, unknownType: contentType };
  return { text: '', mediaType: null };
}

// ============================================================
// CONTEXT INFO EXTRACTOR
// ============================================================
function extractContextInfo(msg) {
  if (!msg || !msg.message) return null;
  const normalize = baileysModule && baileysModule.normalizeMessageContent;
  const m = normalize ? (normalize(msg.message) || msg.message) : msg.message;
  return (
    (m.extendedTextMessage && m.extendedTextMessage.contextInfo) ||
    (m.imageMessage && m.imageMessage.contextInfo) ||
    (m.videoMessage && m.videoMessage.contextInfo) ||
    (m.audioMessage && m.audioMessage.contextInfo) ||
    (m.documentMessage && m.documentMessage.contextInfo) ||
    (m.stickerMessage && m.stickerMessage.contextInfo) ||
    (m.documentWithCaptionMessage && m.documentWithCaptionMessage.message && m.documentWithCaptionMessage.message.documentMessage && m.documentWithCaptionMessage.message.documentMessage.contextInfo) ||
    null
  );
}

// ============================================================
// SESSION ID RESOLVER
// ============================================================
function resolveSessionIdAndBody(msg, rawText) {
  const text = String(rawText || '').trim();
  const PAT = /\[#(guest_[a-zA-Z0-9_-]+)\]|(?:^|\s)#(guest_[a-zA-Z0-9_-]+)/i;
  const direct = text.match(PAT);
  if (direct) return { body: text, sessionId: direct[1] || direct[2] };

  const ctx = extractContextInfo(msg);
  if (ctx && ctx.quotedMessage) {
    const qm = ctx.quotedMessage;
    const qText =
      qm.conversation ||
      (qm.extendedTextMessage && qm.extendedTextMessage.text) ||
      (qm.imageMessage && qm.imageMessage.caption) ||
      '';
    const qMatch = qText.match(PAT);
    if (qMatch) {
      const gid = qMatch[1] || qMatch[2];
      return { body: '[#' + gid + '] ' + text, sessionId: gid };
    }
    const stanzaId = ctx.stanzaId;
    if (stanzaId && msgHistoryMap.has(stanzaId)) {
      const cm = msgHistoryMap.get(stanzaId);
      const cText = (cm && cm.conversation) || (cm && cm.extendedTextMessage && cm.extendedTextMessage.text) || '';
      const cMatch = cText.match(PAT);
      if (cMatch) {
        const gid = cMatch[1] || cMatch[2];
        return { body: '[#' + gid + '] ' + text, sessionId: gid };
      }
    }
  }
  return { body: text, sessionId: null };
}

// ============================================================
// FORWARD TO WEBHOOK
// ============================================================
async function forwardToWebhook(payload, maxRetries, isRetryFromQueue) {
  maxRetries = maxRetries || 3;
  pipelineCounters.webhookAttempts++;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (GATEWAY_SECRET) headers['x-gateway-secret'] = GATEWAY_SECRET;
      const response = await fetch(NEXTJS_WEBHOOK_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });
      if (response.ok) {
        const data = await response.json().catch(function() { return null; });
        if (data && data.status === 'ignored') {
          addDiagLog('warn', 'Webhook ignored: ' + (data.reason || '-'), { msgId: payload.payload && payload.payload.id });
        } else {
          pipelineCounters.webhookSuccess++;
          lastSuccessfulWebhookAt = Date.now();
          addDiagLog('info', 'Webhook OK! session=' + (payload.payload && payload.payload.sessionId || '-'), { msgId: payload.payload && payload.payload.id });
        }
        return true;
      }
      const errText = await response.text().catch(function() { return ''; });
      addDiagLog('warn', 'Webhook HTTP ' + response.status + ' (attempt ' + attempt + '/' + maxRetries + '): ' + errText.slice(0, 120),
        { msgId: payload.payload && payload.payload.id });
    } catch (err) {
      addDiagLog('warn', 'Webhook error (attempt ' + attempt + '/' + maxRetries + '): ' + err.message,
        { msgId: payload.payload && payload.payload.id });
    }
    if (attempt < maxRetries) await new Promise(function(r) { setTimeout(r, 1500 * Math.pow(2, attempt - 1)); });
  }
  pipelineCounters.webhookFailures++;
  if (!isRetryFromQueue) {
    if (failedWebhookQueue.length < 50) {
      failedWebhookQueue.push({ payload: payload, attempts: 1 });
      pipelineCounters.retryQueueAdded++;
      addDiagLog('warn', 'Webhook gagal - masuk retry queue (' + failedWebhookQueue.length + ').');
      scheduleWebhookRetry();
    } else {
      addDiagLog('error', 'Retry queue penuh. Payload DIBUANG. msgId=' + (payload.payload && payload.payload.id || '-'));
    }
  }
  return false;
}

// ============================================================
// msgRetryCounterCache - MODUL-LEVEL (tidak di-reset saat reconnect)
// Sesuai contoh resmi Baileys example.ts
// ============================================================
const msgRetryCounterMap = new Map();
const msgRetryCounterCache = {
  get: function(k) { return msgRetryCounterMap.get(k); },
  set: function(k, v) {
    msgRetryCounterMap.set(k, v);
    if (msgRetryCounterMap.size > 2000) msgRetryCounterMap.delete(msgRetryCounterMap.keys().next().value);
  },
  del: function(k) { msgRetryCounterMap.delete(k); },
  flushAll: function() { msgRetryCounterMap.clear(); },
};

// ============================================================
// WHATSAPP BOT
// CATATAN KRITIS: autoHealCorruptedSession telah DIHAPUS.
// Alasan: menghapus session-*.json saat socket aktif merusak Signal Protocol
// dan menyebabkan "Waiting for this message" secara permanen pada semua
// pesan berikutnya. Baileys mengelola session internally - jangan interfere.
// ============================================================
async function startWhatsAppBot() {
  if (isStartingBot) {
    addDiagLog('warn', 'startWhatsAppBot sedang berjalan. Diabaikan.');
    return;
  }
  isStartingBot = true;
  if (sock) {
    addDiagLog('info', 'Menutup socket lama...');
    try {
      if (sock.ev) sock.ev.removeAllListeners();
      if (sock.ws && typeof sock.ws.close === 'function') sock.ws.close();
    } catch {}
    sock = null;
  }
  try {
    if (!fs.existsSync(AUTH_PATH)) fs.mkdirSync(AUTH_PATH, { recursive: true });
    const B = await getBaileys();
    const makeWASocket = B.makeWASocket;
    const useMultiFileAuthState = B.useMultiFileAuthState;
    const makeCacheableSignalKeyStore = B.makeCacheableSignalKeyStore;
    const DisconnectReason = B.DisconnectReason;
    const fetchLatestBaileysVersion = B.fetchLatestBaileysVersion;
    const Browsers = B.Browsers;

    const authState = await useMultiFileAuthState(AUTH_PATH);
    const state = authState.state;
    const saveCreds = authState.saveCreds;

    let version;
    try {
      const vi = await fetchLatestBaileysVersion();
      version = vi.version;
      addDiagLog('info', 'WA version: ' + version.join('.'));
    } catch {
      version = [2, 3000, 1043857760];
      addDiagLog('warn', 'Fallback WA version: ' + version.join('.'));
    }

    const logger = pino({ level: 'silent' });

    sock = makeWASocket({
      version: version,
      auth: {
        creds: state.creds,
        // makeCacheableSignalKeyStore: mengurangi I/O Signal key store
        keys: makeCacheableSignalKeyStore ? makeCacheableSignalKeyStore(state.keys, logger) : state.keys,
      },
      logger: logger,
      // msgRetryCounterCache di modul-level - tidak di-reset per reconnect
      msgRetryCounterCache: msgRetryCounterCache,
      shouldIgnoreJid: function(jid) { return Boolean(jid && (jid.endsWith('@broadcast') || jid === 'status@broadcast')); },
      // Browser string standar - tidak custom untuk hindari anomali multi-device
      browser: Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4'],
      connectTimeoutMs: 30000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 250,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      // getMessage DURABLE - pure-JS file store + in-memory cache
      // Kritis untuk menangani "Waiting for this message"
      getMessage: getMessageFromStore,
    });

    // WAJIB: creds.update harus selalu disimpan
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async function(update) {
      const connection = update.connection;
      const lastDisconnect = update.lastDisconnect;
      const qr = update.qr;

      if (qr) {
        try {
          currentQrImage = await QRCode.toDataURL(qr, { width: 320, margin: 2, color: { dark: '#1a3e9e', light: '#ffffff' } });
          connectionStatus = 'qr_ready';
          addDiagLog('info', 'QR Code siap di-scan.');
        } catch (err) { console.error('QR gen error:', err.message); }
      }

      if (connection === 'close') {
        const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        lastDisconnectReason = 'Code: ' + (code || 'unknown');
        addDiagLog('warn', 'Koneksi terputus. Kode: ' + code + ' | Reconnect: ' + shouldReconnect);
        if (connectionWatchdogTimer) { clearInterval(connectionWatchdogTimer); connectionWatchdogTimer = null; }
        connectionStatus = 'disconnected';
        currentQrImage = null;
        connectedUserPhone = null;
        if (shouldReconnect) {
          setTimeout(startWhatsAppBot, getReconnectDelay(code));
        } else {
          reconnectAttempts = 0;
          addDiagLog('info', 'Logout resmi. Hapus auth dan mulai ulang...');
          if (fs.existsSync(AUTH_PATH)) {
            try { fs.rmSync(AUTH_PATH, { recursive: true, force: true }); } catch {}
          }
          setTimeout(startWhatsAppBot, 1500);
        }
      } else if (connection === 'open') {
        currentQrImage = null;
        connectionStatus = 'connected';
        lastDisconnectReason = null;
        lastConnectedAt = Date.now();
        reconnectAttempts = 0;
        connectedUserPhone = sock && sock.user && sock.user.id ? sock.user.id.split(':')[0] : 'Aktif';
        addDiagLog('info', 'WHATSAPP TERHUBUNG! Akun: ' + connectedUserPhone);
        startConnectionWatchdog();
        if (outboundQueue.length) {
          addDiagLog('info', 'Flush ' + outboundQueue.length + ' pesan tertunda.');
          scheduleOutboundFlush(500);
        }
      }
    });

    // ========================================================
    // INBOUND MESSAGE PROCESSOR
    // TIDAK ADA SILENT DROP - setiap skip punya log dengan kode DIAG.
    // KRITIS: Pesan yang gagal didekripsi (msg.message null) TIDAK dimasukkan
    // ke processedMessageIds agar ketika WhatsApp mengirim retry, pesan retry
    // bisa diterima dan diproses, bukan dianggap duplikat.
    // ========================================================
    async function handleInboundMessage(msg, type) {
      if (!msg) return;
      const msgId = msg.key && msg.key.id;
      const jid   = msg.key && msg.key.remoteJid;
      const fromMe = Boolean(msg.key && msg.key.fromMe);
      const participant = msg.key && msg.key.participant;
      const ts   = msg.messageTimestamp ? Number(msg.messageTimestamp) : Math.floor(Date.now() / 1000);
      const tsMs = ts * 1000;

      // DIAG-1: append lama - abaikan history sync
      if (type === 'append') {
        const isRecent = !tsMs || (Date.now() - tsMs < 10 * 60 * 1000);
        if (!isRecent) {
          pipelineCounters.appendSkippedOld++;
          addDiagLog('info', '[DIAG-1] skip append lama: id=' + msgId + ' jid=' + jid + ' ts=' + new Date(tsMs).toISOString());
          return;
        }
        addDiagLog('info', '[append-recent] id=' + msgId + ' jid=' + jid);
      }

      // Simpan ke in-memory cache dan SQLite jika ada payload pesan
      if (msgId && msg.message) {
        msgHistoryMap.set(msgId, msg.message);
        if (msgHistoryMap.size > 1000) msgHistoryMap.delete(msgHistoryMap.keys().next().value);
        storeMessage(msg);
      }

      // DIAG-2: duplikat — HANYA jika pesan ini SUDAH PERNAH sukses diproses sebelumnya
      if (msgId && processedMessageIds.has(msgId)) {
        pipelineCounters.duplicateSkipped++;
        addDiagLog('info', '[DIAG-2] duplikat (sudah diproses): id=' + msgId);
        return;
      }

      // DIAG-3: msg.message null (kemungkinan gagal dekripsi / menunggu retry dari WA)
      // JANGAN tambahkan ke processedMessageIds agar paket retry yang tiba berikutnya bisa diproses!
      if (!msg.message) {
        pipelineCounters.nullMessageDrop++;
        addDiagLog('warn',
          '[DIAG-3] msg.message=null (menunggu retry/kunci Signal): id=' + msgId +
          ' jid=' + jid + ' fromMe=' + fromMe + ' type=' + type +
          ' stub=' + (msg.messageStubType || 'none'),
          { msgId: msgId, jid: jid, fromMe: fromMe, type: type, ts: new Date(tsMs).toISOString() }
        );
        return;
      }

      lastInboundMessageAt = Date.now();

      const extracted = extractMessageContent(msg);
      const rawText = extracted.text;
      const mediaType = extracted.mediaType;
      const isProtocol = extracted.isProtocol;
      const unknownType = extracted.unknownType;

      // DIAG-4: protocol message
      if (isProtocol) {
        addDiagLog('info', '[DIAG-4] protocol msg: id=' + msgId + ' jid=' + jid);
        return;
      }

      // DIAG-5: tidak ada konten
      if (!rawText && !mediaType) {
        pipelineCounters.noContentDrop++;
        if (unknownType) {
          addDiagLog('warn', '[DIAG-5a] unknown type=' + unknownType + ': id=' + msgId + ' jid=' + jid, { msgId: msgId, jid: jid, unknownType: unknownType });
        } else {
          addDiagLog('info', '[DIAG-5b] no content: id=' + msgId + ' jid=' + jid + ' fromMe=' + fromMe + ' type=' + type);
        }
        return;
      }

      lastSuccessfulDecryptAt = Date.now();

      const resolved = resolveSessionIdAndBody(msg, rawText);
      const messageText = resolved.body;
      const sessionId = resolved.sessionId;

      // DIAG-6: echo system msg dari gateway sendiri
      if (fromMe) {
        const isEcho =
          messageText.indexOf('[CHAT BARU DARI WEBSITE') !== -1 ||
          messageText.indexOf('[NOTIFIKASI ARSALYNK]') !== -1 ||
          messageText.indexOf('Cara Membalas:') !== -1 ||
          (messageText.indexOf('🔔') !== -1 && !sessionId);
        if (isEcho) {
          pipelineCounters.echoSystemMsgSkip++;
          addDiagLog('info', '[DIAG-6] skip echo system: "' + messageText.slice(0, 60) + '"');
          return;
        }
        addDiagLog('info', '[fromMe-CS] id=' + msgId + ' session=' + (sessionId || '-') + ': "' + messageText.slice(0, 60) + '"');
      }

      // DIAG-7: Filter wajib - Hanya pesan yang memiliki kode sesi tamu website
      // (baik lewat ketikan kode [#guest_...] atau quote/swipe reply ke pesan bot)
      // yang boleh diteruskan ke webhook website.
      // Mencegah pesan pancingan ("test", "tes"), chat pribadi CS, atau pesan acak
      // bocor ke live chat website pengunjung.
      if (!sessionId) {
        addDiagLog('info', '[DIAG-7] skip non-session msg (tanpa kode [#guest_...]): id=' + msgId + ' text="' + messageText.slice(0, 50) + '"');
        return;
      }

      // SEKARANG setelah pesan terbukti valid dan siap diforward, tandai ID agar tidak duplikat
      if (msgId) {
        processedMessageIds.add(msgId);
        if (processedMessageIds.size > 2000) processedMessageIds.delete(processedMessageIds.values().next().value);
      }

      // PROSES & FORWARD
      const senderDisplay = participant ? (jid + '(p:' + participant + ')') : jid;
      addDiagLog('info',
        '[DIAG-OK] id=' + msgId + ' from=' + senderDisplay + ' fromMe=' + fromMe +
        ' type=' + type + ' media=' + (mediaType || 'text') + ' session=' + (sessionId || '-') +
        ' text="' + messageText.slice(0, 80) + '"'
      );

      let normFrom = jid ? jid.replace('@lid', '@s.whatsapp.net') : jid;
      if (normFrom && normFrom.indexOf(':') !== -1) normFrom = normFrom.replace(/:.*@/, '@');

      // Simpan pesan CS ke SQLite Live Chat DB (sumber tunggal untuk polling Next.js)
      const senderType = fromMe ? 'human_cs' : 'user';
      saveLiveChatMessage(sessionId, senderType, messageText, msgId);

      pipelineCounters.successfullyProcessed++;
      forwardToWebhook({
        event: 'message',
        payload: {
          id: msgId,
          from: normFrom,
          body: messageText,
          sessionId: sessionId,
          fromMe: fromMe,
          mediaType: mediaType || null,
          timestamp: ts,
        },
      });
    }

    // ========================================================
    // MESSAGES.UPSERT HANDLER
    // ========================================================
    sock.ev.on('messages.upsert', async function(evt) {
      const messages = evt.messages;
      const type = evt.type;

      pipelineCounters.totalUpsertEvents++;
      pipelineCounters.totalMessagesInBatch += messages.length;
      if (type === 'notify') pipelineCounters.notifyMessages += messages.length;
      else if (type === 'append') pipelineCounters.appendMessages += messages.length;

      for (let i = 0; i < messages.length; i++) {
        await handleInboundMessage(messages[i], type);
      }
    });

    // ========================================================
    // MESSAGES.UPDATE HANDLER (Status Centang & Retry Decrypted)
    // ========================================================
    const STATUS_LABELS = { 0: 'ERROR', 1: 'PENDING', 2: 'SENT', 3: 'DELIVERED', 4: 'READ', 5: 'PLAYED' };
    sock.ev.on('messages.update', async function(updates) {
      for (let i = 0; i < updates.length; i++) {
        const upd = updates[i];

        // 1. Cek jika update membawa pesan yang baru berhasil didekripsi oleh Baileys
        if (upd.update && upd.update.message && upd.key && upd.key.id) {
          const mId = upd.key.id;
          if (!processedMessageIds.has(mId)) {
            addDiagLog('info', '[Retry-Decrypted] id=' + mId + ' berhasil didekripsi via messages.update!');
            await handleInboundMessage({
              key: upd.key,
              message: upd.update.message,
              messageTimestamp: upd.update.messageTimestamp || Math.floor(Date.now() / 1000)
            }, 'update_retry');
          }
        }

        // 2. Status update
        const status = upd.update && upd.update.status;
        if (status === undefined) continue;
        const lbl = STATUS_LABELS[status] || String(status);
        addDiagLog('info', 'Status: id=' + (upd.key && upd.key.id) + ' -> ' + lbl);
        if (status >= 3 || status === 0) {
          forwardToWebhook({ event: 'message_status_update', payload: {
            id: upd.key && upd.key.id,
            to: upd.key && upd.key.remoteJid,
            fromMe: Boolean(upd.key && upd.key.fromMe),
            status: lbl,
            statusCode: status,
            timestamp: Date.now(),
          }});
        }
      }
    });

  } catch (err) {
    console.error('Gagal init WhatsApp Bot: ' + err.message);
    connectionStatus = 'error';
    lastDisconnectReason = err.message;
    addDiagLog('error', 'Gagal init bot: ' + err.message);
    setTimeout(startWhatsAppBot, getReconnectDelay(null));
  } finally {
    isStartingBot = false;
  }
}

// ============================================================
// WATCHDOG
// ============================================================
let connectionWatchdogTimer = null;
let lastWatchdogPingOk = Date.now();
let consecutiveWatchdogFailures = 0;

function startConnectionWatchdog() {
  if (connectionWatchdogTimer) clearInterval(connectionWatchdogTimer);
  consecutiveWatchdogFailures = 0;
  connectionWatchdogTimer = setInterval(async function() {
    if (connectionStatus !== 'connected' || !sock) {
      clearInterval(connectionWatchdogTimer);
      connectionWatchdogTimer = null;
      return;
    }
    try {
      const wsOk = Boolean(sock.ws && (sock.ws.isOpen || (sock.ws.socket && sock.ws.socket.readyState === 1)));
      if (!wsOk) {
        consecutiveWatchdogFailures++;
        addDiagLog('warn', '[Watchdog] WS tidak OPEN (' + consecutiveWatchdogFailures + '/3).');
        if (consecutiveWatchdogFailures >= 3) {
          addDiagLog('warn', '[Watchdog] WS mati 3x. Force reconnect...');
          connectionStatus = 'disconnected';
          connectedUserPhone = null;
          try { sock.end(new Error('Watchdog dead socket')); } catch {}
          setTimeout(startWhatsAppBot, getReconnectDelay(null));
          clearInterval(connectionWatchdogTimer);
          connectionWatchdogTimer = null;
        }
        return;
      }
      consecutiveWatchdogFailures = 0;
      lastWatchdogPingOk = Date.now();
      const lastMsg = lastInboundMessageAt ? (Math.floor((Date.now() - lastInboundMessageAt) / 1000) + 's lalu') : 'belum ada';
      addDiagLog('info', '[Watchdog] Sehat. Uptime:' + Math.floor(process.uptime()) + 's | LastInbound:' + lastMsg);
    } catch (err) { addDiagLog('warn', '[Watchdog] Error: ' + err.message); }
  }, 60000);
}

// Periodic cleanup
setInterval(function() {
  try {
    const deleted = cleanExpiredStoredMessages();
    if (deleted) addDiagLog('info', '[MsgStore] Bersihkan ' + deleted + ' pesan kadaluarsa.');
  } catch {}
}, 6 * 60 * 60 * 1000);

// ============================================================
// ENDPOINTS
// ============================================================
app.get('/health', function(req, res) {
  const ok = connectionStatus === 'connected';
  res.status(ok ? 200 : 503).json({
    status: ok ? 'healthy' : 'degraded',
    gateway: { connectionStatus: connectionStatus, connectedUserPhone: connectedUserPhone, isServerless: isServerless, authStoragePath: AUTH_PATH, lastDisconnectReason: lastDisconnectReason, failedWebhookQueue: failedWebhookQueue.length },
    pipeline: {
      lastInboundMessageAgeMs: lastInboundMessageAt ? Date.now() - lastInboundMessageAt : null,
      lastSuccessfulDecryptAt: lastSuccessfulDecryptAt ? new Date(lastSuccessfulDecryptAt).toISOString() : null,
      lastSuccessfulWebhookAt: lastSuccessfulWebhookAt ? new Date(lastSuccessfulWebhookAt).toISOString() : null,
    },
    system: { uptimeSeconds: Math.floor(process.uptime()), startedAt: startupTime, memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024), nodeVersion: process.version },
  });
});

app.get('/api/status', function(req, res) {
  res.json({
    status: connectionStatus, qrImage: currentQrImage, phone: connectedUserPhone,
    port: PORT, isServerless: isServerless, authPath: AUTH_PATH,
    hasSessionEnv: Boolean(process.env.WA_SESSION_BASE64 || process.env.WA_CREDS_BASE64),
    lastDisconnectReason: lastDisconnectReason, failedWebhookQueue: failedWebhookQueue.length, webhookUrl: NEXTJS_WEBHOOK_URL,
  });
});

app.get('/api/diagnostics', requireGatewayAuth, function(req, res) {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  res.json({
    connectionStatus: connectionStatus, phone: connectedUserPhone, webhookUrl: NEXTJS_WEBHOOK_URL, lastDisconnectReason: lastDisconnectReason,
    failedQueueSize: failedWebhookQueue.length, outboundQueueSize: outboundQueue.length,
    retryCounterCacheSize: msgRetryCounterMap.size, processedMsgCount: processedMessageIds.size,
    historyMapSize: msgHistoryMap.size, jidCacheSize: jidCache.size,
    reconnectAttempts: reconnectAttempts, watchdogActive: Boolean(connectionWatchdogTimer),
    lastWatchdogPingOk: lastWatchdogPingOk ? new Date(lastWatchdogPingOk).toISOString() : null,
    lastInboundMessageAt: lastInboundMessageAt ? new Date(lastInboundMessageAt).toISOString() : null,
    lastSuccessfulDecryptAt: lastSuccessfulDecryptAt ? new Date(lastSuccessfulDecryptAt).toISOString() : null,
    lastSuccessfulWebhookAt: lastSuccessfulWebhookAt ? new Date(lastSuccessfulWebhookAt).toISOString() : null,
    pipelineCounters: pipelineCounters,
    logs: diagnosticsLog.slice(-limit).reverse(),
  });
});

function cacheOutboundMessage(result) {
  if (result && result.key && result.key.id && result.message) {
    msgHistoryMap.set(result.key.id, result.message);
    if (msgHistoryMap.size > 1000) msgHistoryMap.delete(msgHistoryMap.keys().next().value);
    storeMessage(result);
  }
}

// ============================================================
// LIVE CHAT MESSAGE ENDPOINTS
// Digunakan oleh Next.js (Vercel) untuk polling pesan secara real-time.
// Karena Vercel Serverless memiliki /tmp yang terisolasi per-container,
// semua pesan disimpan di sini (server stateful) dan Next.js poll ke sini.
// ============================================================

/**
 * GET /api/messages?sessionId=guest_xxx
 * Mengembalikan seluruh riwayat pesan untuk sesi tamu tertentu.
 * Auth: x-gateway-secret (wajib jika GATEWAY_SECRET dikonfigurasi)
 */
app.get('/api/messages', requireGatewayAuth, function(req, res) {
  const sessionId = req.query.sessionId;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId parameter wajib diisi.' });
  }
  try {
    const messages = getLiveChatMessages(sessionId);
    return res.json({ success: true, data: messages });
  } catch (err) {
    addDiagLog('error', '[LiveChatDB] GET /api/messages error: ' + err.message);
    return res.status(500).json({ error: 'Gagal mengambil pesan: ' + err.message });
  }
});

/**
 * POST /api/messages/user
 * Menerima pesan dari pengunjung website (Next.js) dan menyimpannya ke SQLite.
 * Dipanggil oleh Next.js route /api/whatsapp/send sebelum atau sesudah mengirim ke WA.
 * Body: { sessionId, message, name? }
 * Auth: x-gateway-secret (wajib jika GATEWAY_SECRET dikonfigurasi)
 */
app.post('/api/messages/user', requireGatewayAuth, function(req, res) {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId dan message wajib diisi.' });
  }
  // Batasi panjang pesan untuk mencegah bloat SQLite
  const MAX_MSG_LENGTH = 4000;
  const trimmedMsg = String(message).slice(0, MAX_MSG_LENGTH);
  if (!trimmedMsg.trim()) {
    return res.status(400).json({ error: 'message tidak boleh kosong.' });
  }
  // Validasi sessionId (hanya karakter aman)
  if (!/^guest_[a-zA-Z0-9_-]{4,64}$/.test(String(sessionId))) {
    return res.status(400).json({ error: 'sessionId tidak valid.' });
  }
  try {
    const saved = saveLiveChatMessage(String(sessionId), 'user', trimmedMsg, null);
    addDiagLog('info', '[LiveChatDB] Pesan user disimpan: session=' + sessionId + ' text="' + trimmedMsg.slice(0, 50) + '"');
    return res.json({ success: true, data: saved });
  } catch (err) {
    addDiagLog('error', '[LiveChatDB] POST /api/messages/user error: ' + err.message);
    return res.status(500).json({ error: 'Gagal menyimpan pesan: ' + err.message });
  }
});

app.post('/api/sendText', requireGatewayAuth, async function(req, res) {
  const chatId = req.body.chatId;
  const text = req.body.text;
  const phone = req.body.phone;
  const target = chatId || (phone ? (String(phone).replace(/\D/g, '') + '@s.whatsapp.net') : null);
  if (!target || !text) return res.status(400).json({ error: 'chatId/phone dan text wajib diisi.' });
  if (!sock || connectionStatus !== 'connected') {
    if (outboundQueue.length < 100) {
      const q = await new Promise(function(resolve, reject) {
        outboundQueue.push({ jid: target, msgOptions: { text: String(text) }, resolve: resolve, reject: reject, enqueued: Date.now() });
        addDiagLog('warn', '[OutboundQueue] sendText antri. Queue: ' + outboundQueue.length);
      }).catch(function(e) { return { _error: e.message }; });
      if (q && q._error) return res.status(500).json({ error: q._error });
      cacheOutboundMessage(q);
      return res.json({ success: true, messageId: q && q.key && q.key.id, to: target, queued: true, timestamp: Date.now() });
    }
    return res.status(503).json({ error: 'Gateway reconnect, antrian penuh.', status: connectionStatus });
  }
  try {
    const jid = await resolveJid(target);
    const result = await sendMessageWithTimeout(jid, { text: String(text) });
    cacheOutboundMessage(result);
    addDiagLog('info', 'Pesan terkirim ke (' + jid + '): "' + String(text).slice(0, 50) + '"');
    return res.json({ success: true, messageId: result && result.key && result.key.id, to: jid, queued: false, timestamp: Date.now() });
  } catch (err) {
    addDiagLog('error', 'Gagal kirim ke ' + target + ': ' + err.message);
    if (outboundQueue.length < 100) {
      outboundQueue.push({ jid: target, msgOptions: { text: String(text) }, resolve: function() {}, reject: function() {}, enqueued: Date.now() });
      scheduleOutboundFlush(3000);
      return res.status(202).json({ error: err.message, queued: true });
    }
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/sendReply', requireGatewayAuth, async function(req, res) {
  const chatId = req.body.chatId;
  const phone = req.body.phone;
  const text = req.body.text;
  const quotedMessageId = req.body.quotedMessageId;
  const quotedText = req.body.quotedText;
  const quotedParticipant = req.body.quotedParticipant;
  const target = chatId || (phone ? (String(phone).replace(/\D/g, '') + '@s.whatsapp.net') : null);
  if (!target || !text) return res.status(400).json({ error: 'chatId/phone dan text wajib diisi.' });
  function buildOpts(jid) {
    if (!quotedMessageId) return { text: String(text) };
    const cachedMsg = msgHistoryMap.get(quotedMessageId);
    const qKey = { remoteJid: jid, fromMe: false, id: quotedMessageId };
    if (quotedParticipant) qKey.participant = quotedParticipant;
    return { text: String(text), quoted: { key: qKey, message: cachedMsg || (quotedText ? { conversation: String(quotedText) } : { conversation: '...' }) } };
  }
  if (!sock || connectionStatus !== 'connected') {
    const pJid = target.includes('@') ? target.replace('@c.us', '@s.whatsapp.net') : (target + '@s.whatsapp.net');
    if (outboundQueue.length < 100) {
      const q = await new Promise(function(r, j) { outboundQueue.push({ jid: pJid, msgOptions: buildOpts(pJid), resolve: r, reject: j, enqueued: Date.now() }); }).catch(function(e) { return { _error: e.message }; });
      if (q && q._error) return res.status(500).json({ error: q._error });
      cacheOutboundMessage(q);
      return res.json({ success: true, messageId: q && q.key && q.key.id, to: pJid, queued: true, timestamp: Date.now() });
    }
    return res.status(503).json({ error: 'Gateway reconnect, antrian penuh.', status: connectionStatus });
  }
  try {
    const jid = await resolveJid(target);
    const result = await sendMessageWithTimeout(jid, buildOpts(jid));
    cacheOutboundMessage(result);
    addDiagLog('info', 'Reply terkirim ke (' + jid + ') quoted:' + (quotedMessageId || 'none'));
    return res.json({ success: true, messageId: result && result.key && result.key.id, to: jid, queued: false, timestamp: Date.now() });
  } catch (err) {
    addDiagLog('error', 'Gagal reply ke ' + target + ': ' + err.message);
    if (outboundQueue.length < 100) {
      const fJid = target.includes('@') ? target : (target + '@s.whatsapp.net');
      outboundQueue.push({ jid: fJid, msgOptions: buildOpts(fJid), resolve: function() {}, reject: function() {}, enqueued: Date.now() });
      scheduleOutboundFlush(3000);
      return res.status(202).json({ error: err.message, queued: true });
    }
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/session/export', requireGatewayAuth, function(req, res) {
  try {
    if (!fs.existsSync(AUTH_PATH)) return res.status(404).json({ error: 'Belum ada kredensial. Scan QR dahulu.' });
    const files = fs.readdirSync(AUTH_PATH);
    if (!files.includes('creds.json')) return res.status(404).json({ error: 'creds.json belum ada.' });
    const bundle = {};
    for (let i = 0; i < files.length; i++) {
      const fp = path.join(AUTH_PATH, files[i]);
      if (fs.statSync(fp).isFile()) bundle[files[i]] = fs.readFileSync(fp).toString('base64');
    }
    const b64 = Buffer.from(JSON.stringify({ __is_bundle: true, createdAt: new Date().toISOString(), phone: connectedUserPhone, files: bundle })).toString('base64');
    return res.json({ success: true, fileCount: Object.keys(bundle).length, sessionBase64: b64, instruction: 'Salin ke WA_SESSION_BASE64 di Vercel.' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// KRITIS: /api/session/repair TIDAK menghapus Signal session files.
// Versi sebelumnya menghapus session-*, pre-key-*, sender-key-* yang
// menyebabkan Signal session rusak permanen. Sekarang hanya restart socket.
app.post('/api/session/repair', requireGatewayAuth, async function(req, res) {
  try {
    addDiagLog('info', '[Repair] Restart socket. Signal session files TIDAK dihapus.');
    msgHistoryMap.clear();
    jidCache.clear();
    processedMessageIds.clear();
    failedWebhookQueue.length = 0;
    msgRetryCounterMap.clear();
    if (sock) try { sock.end(new Error('Manual repair')); } catch {}
    setTimeout(startWhatsAppBot, 1500);
    res.json({ success: true, message: 'Socket restart. Auth & Signal session AMAN. Tidak perlu scan ulang QR.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/logout', requireGatewayAuth, async function(req, res) {
  try {
    if (sock) try { await sock.logout(); } catch {}
    if (fs.existsSync(AUTH_PATH)) fs.rmSync(AUTH_PATH, { recursive: true, force: true });
    connectionStatus = 'disconnected'; currentQrImage = null; connectedUserPhone = null;
    addDiagLog('info', 'Logout manual. QR baru disiapkan...');
    setTimeout(startWhatsAppBot, 1000);
    res.json({ success: true, message: 'Sesi direset. QR baru disiapkan.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/', function(req, res) {
  res.send('<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Arsalynk WA Gateway</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>:root{--bg:#0f172a;--card:#1e293b;--border:#334155;--text:#f8fafc;--muted:#94a3b8}*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Plus Jakarta Sans",sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px 40px}.container{width:100%;max-width:620px;background:var(--card);border-radius:24px;border:1px solid var(--border);box-shadow:0 20px 50px rgba(0,0,0,.4);overflow:hidden}.header{padding:24px 28px;background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;display:flex;align-items:center;gap:14px}.hicon{width:48px;height:48px;background:rgba(255,255,255,.18);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px}.htitle{font-size:20px;font-weight:800}.hsub{font-size:13px;opacity:.8;margin-top:2px}.body{padding:24px 28px}.card{background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:16px;padding:18px 20px;margin-bottom:16px}.row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-size:14px}.row:last-child{margin-bottom:0}.lbl{color:var(--muted);font-weight:500}.badge{padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700}.b-ok{background:rgba(16,185,129,.18);color:#10b981}.b-err{background:rgba(239,68,68,.18);color:#ef4444}.b-warn{background:rgba(245,158,11,.18);color:#f59e0b}.b-init{background:rgba(148,163,184,.18);color:#94a3b8}.qr-wrap{display:none;text-align:center;padding:20px;background:#fff;border-radius:16px;margin-bottom:16px}.qr-wrap img{width:240px;height:240px;border-radius:8px}.qr-tip{font-size:13px;color:#475569;margin-top:10px}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px}.gi{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-size:12px}.gi .v{font-size:18px;font-weight:800;color:#60a5fa}.gi .l{color:var(--muted);margin-top:2px}.btn{width:100%;padding:12px;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s;margin-bottom:10px}.btn-danger{background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3)}.btn-danger:hover{background:rgba(239,68,68,.25)}.btn-warn{background:rgba(245,158,11,.15);color:#f59e0b;border:1px solid rgba(245,158,11,.3)}.btn-warn:hover{background:rgba(245,158,11,.25)}.btn-info{background:rgba(99,102,241,.15);color:#818cf8;border:1px solid rgba(99,102,241,.3)}.btn-info:hover{background:rgba(99,102,241,.25)}.logs-title{font-size:13px;font-weight:700;color:var(--muted);margin-bottom:10px;margin-top:20px}.log{font-size:11px;padding:4px 8px;border-radius:6px;margin-bottom:4px;font-family:"Courier New",monospace;word-break:break-all}.l-info{background:rgba(99,102,241,.08);color:#a5b4fc}.l-warn{background:rgba(245,158,11,.08);color:#fcd34d}.l-error{background:rgba(239,68,68,.08);color:#fca5a5}.sbox{display:none;background:#0f172a;border:1px solid var(--border);border-radius:8px;padding:12px;font-size:10px;word-break:break-all;color:#94a3b8;margin-top:10px;max-height:100px;overflow:auto}.sec-input{width:100%;background:rgba(15,23,42,.6);border:1px solid var(--border);color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;margin-top:6px;outline:none}.sec-input:focus{border-color:#3b82f6}</style></head><body><div class="container"><div class="header"><div class="hicon">💬</div><div><div class="htitle">Arsalynk Gateway</div><div class="hsub">WhatsApp Live Chat Control Center</div></div></div><div class="body"><div id="qr" class="qr-wrap"><img id="qrImg" src="" alt="QR"><div class="qr-tip">Scan via WhatsApp > Perangkat Tertaut</div></div><div class="card"><div class="row"><span class="lbl">Status</span><span id="badge" class="badge b-init">Inisialisasi...</span></div><div class="row"><span class="lbl">Akun</span><span id="phone" style="font-weight:700;font-size:13px">-</span></div><div class="row"><span class="lbl">Webhook</span><span style="font-size:11px;color:var(--muted)">' + NEXTJS_WEBHOOK_URL + '</span></div><div style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.06);padding-top:10px"><span class="lbl" style="font-size:12px">🔑 Gateway Secret (Opsional untuk Buka Log & Tombol)</span><input type="password" id="gwSec" class="sec-input" placeholder="Masukkan GATEWAY_SECRET jika diaktifkan..." oninput="saveSecret(this.value)"></div></div><div class="grid"><div class="gi"><div class="v" id="pc1">-</div><div class="l">Diproses</div></div><div class="gi"><div class="v" id="pc2">-</div><div class="l">Webhook OK</div></div><div class="gi"><div class="v" id="pc3">-</div><div class="l">Decrypt Gagal</div></div></div><button class="btn btn-warn" onclick="repairSession()">🔧 Restart Socket (Aman)</button><button class="btn btn-info" onclick="exportSession()">📦 Export Session Base64</button><button class="btn btn-danger" onclick="logoutSession()">🔴 Logout & Scan Ulang QR</button><div id="sbox" class="sbox"></div><div class="logs-title">📋 Log Terbaru (refresh 5s)</div><div id="logs"><div class="log l-info">Menunggu data / masukkan Gateway Secret untuk melihat live logs...</div></div></div></div><script>function getSecret(){return localStorage.getItem("gw_secret")||new URLSearchParams(window.location.search).get("secret")||"";}function saveSecret(v){if(v)localStorage.setItem("gw_secret",v.trim());else localStorage.removeItem("gw_secret");upd();}document.addEventListener("DOMContentLoaded",function(){const s=getSecret();if(s)document.getElementById("gwSec").value=s;});function getHeaders(){const s=getSecret();return s?{"Content-Type":"application/json","x-gateway-secret":s}:{"Content-Type":"application/json"};}async function upd(){try{const sRes=await fetch("/api/status");const s=sRes.ok?await sRes.json():{};let d={};const sec=getSecret();try{const dRes=await fetch("/api/diagnostics"+(sec?"?secret="+encodeURIComponent(sec):""),{headers:getHeaders()});if(dRes.ok)d=await dRes.json();}catch{}const curStatus=(d&&d.connectionStatus)||s.status||"unknown";const phoneNum=(d&&d.phone)||s.phone||"-";const map={connected:["Terhubung \u2713","b-ok"],disconnected:["Terputus","b-err"],qr_ready:["Scan QR","b-warn"],initializing:["Inisialisasi","b-init"],error:["Error","b-err"]};const[lbl,cls]=map[curStatus]||["Unknown","b-init"];const el=document.getElementById("badge");el.textContent=lbl;el.className="badge "+cls;document.getElementById("phone").textContent=phoneNum;const qr=document.getElementById("qr");if(s.qrImage){qr.style.display="block";document.getElementById("qrImg").src=s.qrImage;}else{qr.style.display="none";}const pc=(d&&d.pipelineCounters)||{};document.getElementById("pc1").textContent=pc.successfullyProcessed||0;document.getElementById("pc2").textContent=pc.webhookSuccess||0;document.getElementById("pc3").textContent=pc.nullMessageDrop||0;if(d&&Array.isArray(d.logs)&&d.logs.length>0){document.getElementById("logs").innerHTML=d.logs.slice(0,30).map(l=>{const c=l.level==="error"?"l-error":l.level==="warn"?"l-warn":"l-info";return"<div class=\\"log "+c+"\\">["+((l.ts||"").slice(11,19))+"] "+esc(l.msg)+"</div>";}).join("");}else if(!sec){document.getElementById("logs").innerHTML="<div class=\\"log l-info\\">Status terhubung! Masukkan Gateway Secret di atas untuk melihat detail log aktivitas.</div>";}}catch{}}function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}async function repairSession(){if(!confirm("Restart socket WhatsApp? Auth & session TIDAK akan dihapus."))return;const sec=getSecret();const res=await fetch("/api/session/repair"+(sec?"?secret="+encodeURIComponent(sec):""),{method:"POST",headers:getHeaders()});if(!res.ok){const err=await res.json().catch(()=>({error:"Unauthorized"}));alert("Gagal: "+(err.error||"Periksa Gateway Secret"));}else{alert("Socket berhasil direstart.");upd();}}async function exportSession(){try{const sec=getSecret();const res=await fetch("/api/session/export"+(sec?"?secret="+encodeURIComponent(sec):""),{headers:getHeaders()});const d=await res.json();const box=document.getElementById("sbox");if(d.sessionBase64){box.style.display="block";box.innerText=d.sessionBase64;navigator.clipboard.writeText(d.sessionBase64).catch(()=>{});alert("Disalin! ("+d.fileCount+" files)\\nTempelkan ke WA_SESSION_BASE64 di Vercel.");}else alert(d.error||"Gagal export. Periksa Gateway Secret.");}catch(e){alert("Error: "+e.message);}}async function logoutSession(){if(!confirm("PERINGATAN: Session dihapus, perlu scan QR ulang. Yakin?"))return;const sec=getSecret();const res=await fetch("/api/logout"+(sec?"?secret="+encodeURIComponent(sec):""),{method:"POST",headers:getHeaders()});if(!res.ok){alert("Gagal logout. Periksa Gateway Secret.");}else{alert("Sesi dibersihkan. Memuat ulang QR...");upd();}}upd();setInterval(upd,5000);</script></body></html>');
});

// ============================================================
// SERVER BOOTSTRAP
// ============================================================
if (!isServerless || process.env.NODE_ENV !== 'test') {
  app.listen(PORT, function() {
    console.log('\n🤖 Arsalynk WhatsApp Gateway aktif di: http://localhost:' + PORT);
    console.log('📁 Auth Storage Path: ' + AUTH_PATH + ' (Serverless Mode: ' + isServerless + ')');
    console.log('🔗 Webhook Target: ' + NEXTJS_WEBHOOK_URL);
    try { getMsgStoreDir(); } catch (e) { console.warn('MsgStore init gagal: ' + e.message); }
    startWhatsAppBot();
  });
} else {
  startWhatsAppBot();
}

// ============================================================
// GLOBAL ERROR SHIELDS
// PENTING: console.error TIDAK di-override. Baileys mengelola Signal session
// secara internal. Override console.error untuk memanggil autoHeal (yang
// menghapus session-*.json) adalah ROOT CAUSE "Waiting for this message".
// ============================================================
process.on('unhandledRejection', function(reason) {
  const msg = (reason && reason.message) || String(reason);
  const isTransient = msg.indexOf('Connection Closed') !== -1 || msg.indexOf('rate-overlimit') !== -1 ||
    msg.indexOf('WebSocket') !== -1 || msg.indexOf('Precondition Required') !== -1 ||
    (reason && reason.output && (reason.output.statusCode === 428 || reason.output.statusCode === 408));
  if (isTransient) { console.warn('[Shield] Baileys transient error (aman).'); return; }
  console.error('[Shield] Unhandled Rejection: ' + msg.slice(0, 200));
});

process.on('uncaughtException', function(err) {
  const msg = (err && err.message) || String(err);
  const isTransient = msg.indexOf('Connection Closed') !== -1 || msg.indexOf('rate-overlimit') !== -1 ||
    msg.indexOf('WebSocket') !== -1 || msg.indexOf('Precondition Required') !== -1 ||
    (err && err.output && (err.output.statusCode === 428 || err.output.statusCode === 408));
  if (isTransient) { console.warn('[Shield] Baileys socket error (aman).'); return; }
  console.error('[Shield] Uncaught Exception: ' + msg.slice(0, 200));
});

module.exports = app;
