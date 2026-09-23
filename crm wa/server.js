require('dotenv').config();
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  askChatbot,
  isChatbotConfigured,
  getMissingConfig,
} = require('./chatbot-client');

const app = express();

// ── 1. REVERSE PROXY TRUST (Wajib untuk Vercel / Nginx / Cloudflare) ────
app.set('trust proxy', 1);

// ── 2. INSTANT FAVICON & STATIC HANDLERS (Lapisan Paling Awal) ─────────
// Menjawab request browser secara instan tanpa membebani cold start serverless
app.use((req, res, next) => {
  const cleanUrl = req.url.split('?')[0];
  if (
    cleanUrl === '/favicon.ico' ||
    cleanUrl === '/favicon.png' ||
    cleanUrl === '/apple-touch-icon.png' ||
    cleanUrl === '/apple-touch-icon-precomposed.png'
  ) {
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    return res.status(204).end();
  }
  if (cleanUrl === '/robots.txt') {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send('User-agent: *\nDisallow: /api/\n');
  }
  next();
});

// ── 3. ENVIRONMENT & SERVERLESS PATH CONFIGURATION ────────────────────
const PORT = process.env.PORT || 3005;
const NEXTJS_WEBHOOK_URL = process.env.NEXTJS_WEBHOOK_URL || 'http://localhost:3000/api/whatsapp/webhook';
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || process.env.API_KEY || '';

// Deteksi lingkungan Serverless / Read-Only Filesystem
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.FUNCTIONS_EMULATOR ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.NOW_REGION
);

// Tentukan direktori penyimpanan auth yang aman & dapat ditulis (/tmp di Serverless)
function resolveAuthPath() {
  if (process.env.AUTH_DIR) {
    return path.resolve(process.env.AUTH_DIR);
  }
  if (isServerless) {
    const tmpAuth = path.join(os.tmpdir(), 'auth_info_baileys');
    if (!fs.existsSync(tmpAuth)) {
      try { fs.mkdirSync(tmpAuth, { recursive: true }); } catch {}
    }
    return tmpAuth;
  }
  const localAuthPath = path.join(__dirname, 'auth_info_baileys');
  try {
    if (!fs.existsSync(localAuthPath)) {
      fs.mkdirSync(localAuthPath, { recursive: true });
    }
    fs.accessSync(localAuthPath, fs.constants.W_OK);
    return localAuthPath;
  } catch {
    const fallbackTmp = path.join(os.tmpdir(), 'auth_info_baileys');
    if (!fs.existsSync(fallbackTmp)) {
      try { fs.mkdirSync(fallbackTmp, { recursive: true }); } catch {}
    }
    return fallbackTmp;
  }
}

const AUTH_PATH = resolveAuthPath();

// ── 4. LAZY DYNAMIC IMPORT BAILEYS (Mencegah ERR_REQUIRE_ESM di Vercel) ──
let baileysModule = null;
async function getBaileys() {
  if (!baileysModule) {
    const mod = await import('@whiskeysockets/baileys');
    baileysModule = {
      makeWASocket: mod.default?.default || mod.default || mod.makeWASocket,
      useMultiFileAuthState: mod.useMultiFileAuthState,
      makeCacheableSignalKeyStore: mod.makeCacheableSignalKeyStore,
      DisconnectReason: mod.DisconnectReason,
      fetchLatestBaileysVersion: mod.fetchLatestBaileysVersion,
    };
  }
  return baileysModule;
}

// ── 5. RESTORE SESSION DARI ENVIRONMENT VARIABLE (WA_SESSION_BASE64) ───
function restoreSessionFromEnv() {
  const envSession = process.env.WA_SESSION_BASE64 || process.env.WA_CREDS_BASE64;
  if (!envSession) return;

  try {
    if (!fs.existsSync(AUTH_PATH)) {
      fs.mkdirSync(AUTH_PATH, { recursive: true });
    }

    const decoded = Buffer.from(envSession, 'base64').toString('utf-8');
    
    // Cek format Multi-File Bundle JSON atau Single creds.json
    if (decoded.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(decoded);
        if (parsed.__is_bundle && parsed.files) {
          for (const [filename, contentBase64] of Object.entries(parsed.files)) {
            const filePath = path.join(AUTH_PATH, filename);
            fs.writeFileSync(filePath, Buffer.from(contentBase64, 'base64'));
          }
          console.log(`🔄 Berhasil memulihkan ${Object.keys(parsed.files).length} file session dari WA_SESSION_BASE64 bundle.`);
          return;
        } else if (parsed.noiseKey || parsed.signedIdentityKey) {
          fs.writeFileSync(path.join(AUTH_PATH, 'creds.json'), decoded, 'utf-8');
          console.log('🔄 Berhasil memulihkan creds.json dari WA_SESSION_BASE64.');
          return;
        }
      } catch {}
    }

    fs.writeFileSync(path.join(AUTH_PATH, 'creds.json'), decoded, 'utf-8');
    console.log('🔄 Berhasil memulihkan auth session dari environment variable WA_SESSION_BASE64.');
  } catch (err) {
    console.warn('⚠️ Gagal memulihkan session dari WA_SESSION_BASE64:', err.message);
  }
}

restoreSessionFromEnv();

// ── 6. MIDDLEWARE CORS & BODY PARSER ───────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-gateway-secret', 'x-api-key'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware Verifikasi API Key / Secret (Opsional)
function requireGatewayAuth(req, res, next) {
  if (!GATEWAY_SECRET) return next();

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const customKey = req.headers['x-gateway-secret'] || req.headers['x-api-key'] || req.query.secret;

  if (token === GATEWAY_SECRET || customKey === GATEWAY_SECRET) {
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized: Invalid or missing Gateway Secret/API Key',
    message: 'Harap sertakan Bearer Token atau header x-gateway-secret yang valid.',
  });
}

// ── 7. GLOBAL STATE & BAILEYS BOT MANAGEMENT ──────────────────────────
let sock = null;
let connectionStatus = 'initializing';
let currentQrImage = null;
let connectedUserPhone = null;
let lastDisconnectReason = null;
let isStartingBot = false;
const processedMessageIds = new Set();
const startupTime = new Date().toISOString();

const msgHistoryMap = new Map();

// ── OPTIONAL CHATBOT AUTO REPLY (Additive / Fail-Safe) ────────────────
// Default OFF. Existing webhook/live-chat flow remains authoritative and unchanged.
const CHATBOT_AUTO_REPLY_ENABLED =
  String(process.env.CHATBOT_AUTO_REPLY_ENABLED || 'false').toLowerCase() === 'true';
const CHATBOT_MAX_TRACKED_CONVERSATIONS = Math.max(
  100,
  Number(process.env.CHATBOT_MAX_TRACKED_CONVERSATIONS) || 5000,
);
const chatbotConversationMap = new Map();
const chatbotQueues = new Map();
const chatbotStatePath = path.join(AUTH_PATH, 'chatbot_conversations.json');

function loadChatbotConversationState() {
  try {
    if (!fs.existsSync(chatbotStatePath)) return;

    const parsed = JSON.parse(fs.readFileSync(chatbotStatePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;

    for (const [key, conversationId] of Object.entries(parsed)) {
      if (typeof conversationId === 'string' && conversationId.trim()) {
        chatbotConversationMap.set(key, conversationId.trim());
      }
    }

    console.log(
      `🧠 Chatbot state loaded: ${chatbotConversationMap.size} customer conversation(s).`,
    );
  } catch (error) {
    console.warn('⚠️ Chatbot state tidak dapat dimuat:', error.message);
  }
}

function saveChatbotConversationState() {
  try {
    fs.writeFileSync(
      chatbotStatePath,
      JSON.stringify(Object.fromEntries(chatbotConversationMap), null, 2),
      'utf8',
    );
  } catch (error) {
    // Optional feature: persistence failure must never break the gateway.
    console.warn('⚠️ Chatbot state tidak dapat disimpan:', error.message);
  }
}

function rememberChatbotConversation(key, conversationId) {
  if (!key || !conversationId) return;

  // Refresh insertion order so the map behaves like a lightweight LRU.
  chatbotConversationMap.delete(key);
  chatbotConversationMap.set(key, conversationId);

  while (chatbotConversationMap.size > CHATBOT_MAX_TRACKED_CONVERSATIONS) {
    const oldestKey = chatbotConversationMap.keys().next().value;
    if (!oldestKey) break;
    chatbotConversationMap.delete(oldestKey);
  }

  saveChatbotConversationState();
}

function isDirectCustomerJid(jid) {
  if (!jid || typeof jid !== 'string') return false;
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid');
}

function resolveCustomerIdentityJid(msg, senderJid) {
  // Newer Baileys payloads may expose the alternate PN JID when the primary JID is @lid.
  // Prefer the phone-number JID for a more stable conversation identity when available.
  const candidates = [
    msg?.key?.remoteJidAlt,
    msg?.key?.participantAlt,
    senderJid,
  ].filter(Boolean);

  return (
    candidates.find((jid) => String(jid).endsWith('@s.whatsapp.net')) ||
    senderJid
  );
}

function getChatbotConversationKey(identityJid) {
  const tenantKey = process.env.CHATBOT_TENANT_EXTERNAL_ID || 'tenant';
  return `${tenantKey}:${identityJid}`;
}

function enqueueChatbotJob(key, job) {
  const previous = chatbotQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(job);
  chatbotQueues.set(key, current);

  const cleanup = () => {
    if (chatbotQueues.get(key) === current) {
      chatbotQueues.delete(key);
    }
  };
  current.then(cleanup, cleanup);

  return current;
}

async function handleChatbotAutoReply({ senderJid, identityJid, messageText }) {
  if (!CHATBOT_AUTO_REPLY_ENABLED) return;

  if (!isChatbotConfigured()) {
    console.warn(
      `⚠️ Chatbot auto reply dilewati. Env belum lengkap: ${getMissingConfig().join(', ')}`,
    );
    return;
  }

  const conversationKey = getChatbotConversationKey(identityJid);

  return enqueueChatbotJob(conversationKey, async () => {
    const conversationId = chatbotConversationMap.get(conversationKey) || null;
    const externalUserId = `whatsapp:${identityJid}`;

    try {
      if (sock && typeof sock.sendPresenceUpdate === 'function') {
        await sock.sendPresenceUpdate('composing', senderJid).catch(() => {});
      }

      const result = await askChatbot({
        message: messageText,
        conversationId,
        externalUserId,
      });

      if (!sock || connectionStatus !== 'connected') {
        throw new Error('WhatsApp terputus sebelum balasan chatbot dapat dikirim.');
      }

      const sent = await sock.sendMessage(senderJid, { text: result.text });

      // Keep Baileys retry/getMessage behavior consistent with /api/sendText.
      if (sent?.key?.id && sent?.message) {
        msgHistoryMap.set(sent.key.id, sent.message);
        if (msgHistoryMap.size > 500) {
          const first = msgHistoryMap.keys().next().value;
          msgHistoryMap.delete(first);
        }
      }

      if (result.conversationId) {
        rememberChatbotConversation(conversationKey, result.conversationId);
      }

      console.log(
        `🤖 Optional AI auto reply terkirim ke ${senderJid} (conversation: ${result.conversationId || 'new'}).`,
      );
    } catch (error) {
      // Fail-silent for customers: existing webhook/human flow must continue untouched.
      console.error(
        `❌ Optional chatbot auto reply gagal untuk ${senderJid}:`,
        error.message,
      );
    } finally {
      if (sock && typeof sock.sendPresenceUpdate === 'function') {
        await sock.sendPresenceUpdate('paused', senderJid).catch(() => {});
      }
    }
  });
}

loadChatbotConversationState();

async function startWhatsAppBot() {
  if (isStartingBot) return;
  isStartingBot = true;

  // Bersihkan socket lama sebelum membuat instance baru (mencegah memory leak & duplicate listener)
  if (sock) {
    try {
      sock.ev?.removeAllListeners();
      if (sock.ws && typeof sock.ws.close === 'function') {
        sock.ws.close();
      }
    } catch {}
    sock = null;
  }

  try {
    if (!fs.existsSync(AUTH_PATH)) {
      fs.mkdirSync(AUTH_PATH, { recursive: true });
    }

    // Dynamic import Baileys ESM
    const { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, DisconnectReason, fetchLatestBaileysVersion } = await getBaileys();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);

    let version;
    try {
      const versionInfo = await fetchLatestBaileysVersion();
      version = versionInfo.version;
    } catch {
      version = [2, 3000, 1015901307];
    }

    const logger = pino({ level: 'silent' });

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore ? makeCacheableSignalKeyStore(state.keys, logger) : state.keys,
      },
      logger,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      browser: ['Arsalynk Gateway', 'Chrome', '120.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 250,
      getMessage: async (key) => {
        if (key && key.id && msgHistoryMap.has(key.id)) {
          return msgHistoryMap.get(key.id);
        }
        return undefined;
      },
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          currentQrImage = await QRCode.toDataURL(qr, {
            width: 320,
            margin: 2,
            color: {
              dark: '#1a3e9e',
              light: '#ffffff',
            },
          });
          connectionStatus = 'qr_ready';
          console.log('📱 QR Code baru siap di-scan via web.');
        } catch (err) {
          console.error('Failed generating QR image:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        lastDisconnectReason = `Code: ${statusCode || 'unknown'}`;
        console.log(`⚠️ Koneksi terputus. Kode: ${statusCode} | Auto-Reconnect: ${shouldReconnect}`);

        connectionStatus = 'disconnected';
        currentQrImage = null;
        connectedUserPhone = null;

        if (shouldReconnect) {
          const delay = statusCode === 515 ? 1000 : 3000;
          setTimeout(startWhatsAppBot, delay);
        } else {
          // Jika logout resmi dari HP, bersihkan auth agar siap QR baru
          if (fs.existsSync(AUTH_PATH)) {
            try {
              fs.rmSync(AUTH_PATH, { recursive: true, force: true });
            } catch (err) {
              console.warn('Gagal menghapus auth path:', err.message);
            }
          }
          setTimeout(startWhatsAppBot, 1500);
        }
      } else if (connection === 'open') {
        currentQrImage = null;
        connectionStatus = 'connected';
        lastDisconnectReason = null;
        connectedUserPhone = sock?.user?.id ? sock.user.id.split(':')[0] : 'Aktif';
        console.log(`✅ WHATSAPP ARSALYNK TERHUBUNG! Akun: ${connectedUserPhone}`);
      }
    });

    // Helper untuk mengekstrak isi teks pesan dari berbagai format Baileys
    function extractMessageContent(msg) {
      if (!msg || !msg.message) return '';
      const m = msg.message;
      return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.ephemeralMessage?.message?.conversation ||
        m.ephemeralMessage?.message?.extendedTextMessage?.text ||
        m.viewOnceMessage?.message?.conversation ||
        m.viewOnceMessage?.message?.extendedTextMessage?.text ||
        m.viewOnceMessageV2?.message?.conversation ||
        m.viewOnceMessageV2?.message?.extendedTextMessage?.text ||
        m.documentWithCaptionMessage?.message?.conversation ||
        m.documentWithCaptionMessage?.message?.extendedTextMessage?.text ||
        m.templateButtonReplyMessage?.selectedDisplayText ||
        m.buttonsResponseMessage?.selectedButtonId ||
        ''
      );
    }

    // Helper untuk mengekstrak ID Sesi dari teks pesan atau dari Quoted Message (Swipe to Reply)
    function resolveSessionIdAndBody(msg, rawText) {
      let text = String(rawText || '').trim();
      const directMatch = text.match(/\[#(guest_[a-zA-Z0-9_-]+)\]|#(guest_[a-zA-Z0-9_-]+)/i);

      if (directMatch) {
        return { body: text, sessionId: directMatch[1] || directMatch[2] };
      }

      // Periksa apakah CS membalas dengan fitur Quote / Reply pesan bot di WhatsApp
      const quoted =
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
        msg.message?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (quoted) {
        const quotedText =
          quoted.conversation ||
          quoted.extendedTextMessage?.text ||
          '';

        const quotedMatch = quotedText.match(/\[#(guest_[a-zA-Z0-9_-]+)\]|#(guest_[a-zA-Z0-9_-]+)/i);
        if (quotedMatch) {
          const guestId = quotedMatch[1] || quotedMatch[2];
          // Otomatis tambahkan format [#guest_xxx] agar webhook website langsung memprosesnya
          return {
            body: `[#${guestId}] ${text}`,
            sessionId: guestId,
          };
        }
      }

      return { body: text, sessionId: null };
    }

    // Listen for incoming messages from WhatsApp (2-way live sync)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      // Izinkan tipe 'notify' maupun 'append' (saat background sync / instant reply)
      if (type !== 'notify' && type !== 'append') return;

      for (const msg of messages) {
        const msgId = msg.key?.id;
        if (msgId && msg.message) {
          msgHistoryMap.set(msgId, msg.message);
          if (msgHistoryMap.size > 500) {
            const first = msgHistoryMap.keys().next().value;
            msgHistoryMap.delete(first);
          }
        }
        if (msgId && processedMessageIds.has(msgId)) continue;
        if (msgId) {
          processedMessageIds.add(msgId);
          if (processedMessageIds.size > 1000) {
            const firstKey = processedMessageIds.values().next().value;
            processedMessageIds.delete(firstKey);
          }
        }

        const senderJid = msg.key?.remoteJid || msg.key?.participant;
        const rawText = extractMessageContent(msg);

        if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') continue;

        const { body: messageText, sessionId } = resolveSessionIdAndBody(msg, rawText);

        // Cegah echo loop: Jangan proses notifikasi otomatis yang dikirim oleh Gateway sendiri
        if (msg.key?.fromMe) {
          const isSystemNotification = messageText.includes('[CHAT BARU DARI WEBSITE') || messageText.includes('🔔');
          // Jika pesan dari nomor bot sendiri dan bukan balasan dengan ID sesi, lewati
          if (isSystemNotification || !sessionId) {
            continue;
          }
        }

        // ── OPTIONAL AI AUTO REPLY HOOK ────────────────────────────────
        // Additive only: this does NOT replace/return/continue the existing webhook flow below.
        // Guardrails:
        // - only brand-new Baileys notifications (never history sync / append),
        // - incoming customer messages only (never fromMe),
        // - never website #guest_xxx sessions,
        // - direct individual chats only (@s.whatsapp.net / @lid).
        const shouldRunChatbotAutoReply =
          CHATBOT_AUTO_REPLY_ENABLED &&
          type === 'notify' &&
          !msg.key?.fromMe &&
          !sessionId &&
          isDirectCustomerJid(senderJid);

        if (shouldRunChatbotAutoReply) {
          const identityJid = resolveCustomerIdentityJid(msg, senderJid);
          handleChatbotAutoReply({
            senderJid,
            identityJid,
            messageText,
          }).catch((error) => {
            // Defensive catch; handler itself already fail-isolates chatbot errors.
            console.error('❌ Optional chatbot hook error:', error.message);
          });
        }

        console.log(`📩 Pesan masuk dari WhatsApp (${senderJid}) [fromMe: ${Boolean(msg.key?.fromMe)}]: "${messageText}"`);

        // Normalisasi format JID: Ubah @lid menjadi @s.whatsapp.net agar webhook Next.js tidak mengabaikannya sebagai "LID duplicate"
        const normalizedFrom = senderJid ? senderJid.replace('@lid', '@s.whatsapp.net') : senderJid;

        forwardToWebhook({
          event: 'message',
          payload: {
            id: msgId,
            from: normalizedFrom,
            body: messageText,
            sessionId,
            fromMe: Boolean(msg.key?.fromMe),
            timestamp: msg.messageTimestamp,
          },
        });
      }
    });
  } catch (error) {
    console.error('❌ Gagal menginisialisasi WhatsApp Bot:', error);
    connectionStatus = 'error';
    lastDisconnectReason = error.message;
  } finally {
    isStartingBot = false;
  }
}

// Forward webhook helper dengan retry backoff
async function forwardToWebhook(payload, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(NEXTJS_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(GATEWAY_SECRET ? { 'x-gateway-secret': GATEWAY_SECRET } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const resData = await response.json().catch(() => null);
        if (resData?.status === 'ignored') {
          console.warn(`⚠️ Webhook mengabaikan pesan: ${resData.reason || 'Ditolak oleh website'}`);
        } else {
          console.log(`✔️ Berhasil disimpan ke percakapan website! (${NEXTJS_WEBHOOK_URL})`);
        }
        return true;
      }
      const errText = await response.text().catch(() => '');
      console.warn(`⚠️ Webhook (${NEXTJS_WEBHOOK_URL}) merespons status ${response.status}: ${errText.slice(0, 100)} (Percobaan ${attempt}/${retries})`);
    } catch (err) {
      console.warn(`⚠️ Gagal menghubungi Webhook (${NEXTJS_WEBHOOK_URL}) (Percobaan ${attempt}/${retries}): ${err.message}`);
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return false;
}

// ── 8. ENDPOINTS ───────────────────────────────────────────────────────

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    gateway: {
      connectionStatus,
      connectedUserPhone,
      isServerless,
      authStoragePath: AUTH_PATH,
      lastDisconnectReason,
      hasSessionEnv: Boolean(process.env.WA_SESSION_BASE64 || process.env.WA_CREDS_BASE64),
    },
    system: {
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: startupTime,
      memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      nodeVersion: process.version,
    },
  });
});

// Phone <-> LID Mapping Store (Sinkronisasi Anti-Bad-MAC)
const phoneToLidPath = path.join(AUTH_PATH, 'phone_lid_map.json');
let phoneLidMap = {
  '6282252856710': '140858435367138@lid',
};

try {
  if (fs.existsSync(phoneToLidPath)) {
    phoneLidMap = { ...phoneLidMap, ...JSON.parse(fs.readFileSync(phoneToLidPath, 'utf8')) };
  }
} catch {}

function savePhoneLidMap() {
  try {
    fs.writeFileSync(phoneToLidPath, JSON.stringify(phoneLidMap, null, 2));
  } catch {}
}

// Outbound message API
app.post('/api/sendText', requireGatewayAuth, async (req, res) => {
  const { chatId, text, phone } = req.body;
  const target = chatId || (phone ? `${String(phone).replace(/\D/g, '')}@s.whatsapp.net` : null);

  if (!target || !text) {
    return res.status(400).json({ error: 'Parameter chatId/phone dan text wajib diisi.' });
  }

  if (!sock || connectionStatus !== 'connected') {
    return res.status(503).json({
      error: 'WhatsApp Gateway belum terhubung. Silakan buka dashboard untuk scan QR.',
      status: connectionStatus,
      lastDisconnectReason,
    });
  }

  try {
    let jid = target.includes('@') ? target.replace('@c.us', '@s.whatsapp.net') : `${target}@s.whatsapp.net`;
    const rawNumber = jid.split('@')[0];

    // Sinkronisasi Sesi Signal: Jika ada pemetaan LID untuk nomor ini, kirim langsung ke LID
    // Ini menghilangkan 'Bad MAC' pada balasan pertama karena pengirim dan penerima memakai session ratchet yang sama
    if (jid.endsWith('@s.whatsapp.net')) {
      if (phoneLidMap[rawNumber]) {
        jid = phoneLidMap[rawNumber];
      } else if (sock && typeof sock.onWhatsApp === 'function') {
        try {
          const resList = await sock.onWhatsApp(rawNumber);
          const found = resList && resList[0];
          if (found && found.lid) {
            phoneLidMap[rawNumber] = found.lid;
            savePhoneLidMap();
            jid = found.lid;
            console.log(`🔗 Target nomor ${rawNumber} dipetakan ke WhatsApp LID: ${jid}`);
          }
        } catch {}
      }
    }

    const result = await sock.sendMessage(jid, { text: String(text) });
    if (result?.key?.id && result?.message) {
      msgHistoryMap.set(result.key.id, result.message);
      if (msgHistoryMap.size > 500) {
        const first = msgHistoryMap.keys().next().value;
        msgHistoryMap.delete(first);
      }
    }
    console.log(`📤 Pesan terkirim ke WhatsApp (${jid}): "${String(text).slice(0, 50)}..."`);
    return res.json({
      success: true,
      messageId: result?.key?.id,
      to: jid,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('❌ Gagal mengirim pesan WhatsApp:', error);
    return res.status(500).json({ error: error.message });
  }
});

// JSON Status API for Dashboard
app.get('/api/status', (req, res) => {
  res.json({
    status: connectionStatus,
    qrImage: currentQrImage,
    phone: connectedUserPhone,
    port: PORT,
    isServerless,
    authPath: AUTH_PATH,
    hasSessionEnv: Boolean(process.env.WA_SESSION_BASE64 || process.env.WA_CREDS_BASE64),
    lastDisconnectReason,
  });
});

// Export Session Bundle ke Base64 untuk Serverless Environment (Vercel / Cloud ENV)
app.get('/api/session/export', requireGatewayAuth, (req, res) => {
  try {
    if (!fs.existsSync(AUTH_PATH)) {
      return res.status(404).json({
        error: 'Belum ada kredensial aktif untuk diekspor. Scan QR terlebih dahulu.',
      });
    }

    const files = fs.readdirSync(AUTH_PATH);
    if (!files.includes('creds.json')) {
      return res.status(404).json({
        error: 'File creds.json belum terbentuk. Selesaikan proses scan QR terlebih dahulu.',
      });
    }

    const fileBundle = {};
    for (const file of files) {
      const filePath = path.join(AUTH_PATH, file);
      if (fs.statSync(filePath).isFile()) {
        const fileContent = fs.readFileSync(filePath);
        fileBundle[file] = fileContent.toString('base64');
      }
    }

    const bundlePayload = JSON.stringify({
      __is_bundle: true,
      createdAt: new Date().toISOString(),
      phone: connectedUserPhone,
      files: fileBundle,
    });

    const base64Session = Buffer.from(bundlePayload).toString('base64');

    return res.json({
      success: true,
      fileCount: Object.keys(fileBundle).length,
      instruction: 'Salin nilai sessionBase64 ke Environment Variable WA_SESSION_BASE64 di Vercel / Cloud Provider Anda agar login tersimpan permanen.',
      sessionBase64: base64Session,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Repair / Clear broken session caches without logging out (Fix Bad MAC)
app.post('/api/session/repair', requireGatewayAuth, async (req, res) => {
  try {
    if (fs.existsSync(AUTH_PATH)) {
      const files = fs.readdirSync(AUTH_PATH);
      let removedCount = 0;
      for (const file of files) {
        if (file.startsWith('session-') || file.startsWith('pre-key-')) {
          try {
            fs.unlinkSync(path.join(AUTH_PATH, file));
            removedCount++;
          } catch {}
        }
      }
      console.log(`🧹 Berhasil membersihkan ${removedCount} cache kunci sesi lama (Signal Ratchet Reset).`);
    }
    if (sock) {
      try { sock.end(undefined); } catch {}
    }
    setTimeout(startWhatsAppBot, 1000);
    res.json({ success: true, message: 'Kunci enkripsi berhasil disinkronkan ulang. Login akun tetap aktif!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Disconnect / Reset session
app.post('/api/logout', requireGatewayAuth, async (req, res) => {
  try {
    if (sock) {
      try { await sock.logout(); } catch {}
    }
    if (fs.existsSync(AUTH_PATH)) {
      fs.rmSync(AUTH_PATH, { recursive: true, force: true });
    }
    connectionStatus = 'disconnected';
    currentQrImage = null;
    connectedUserPhone = null;
    setTimeout(startWhatsAppBot, 1000);
    res.json({ success: true, message: 'Sesi berhasil direset. Menyiapkan QR Code baru...' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── 9. WEB DASHBOARD CONTROL CENTER ────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Arsalynk WhatsApp Gateway Control Center</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220%22%200%20100%20100%22><text y=%22.9em%22 font-size=%2290%22>💬</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #1a3e9e;
      --primary-hover: #152571;
      --success: #10b981;
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .container {
      width: 100%;
      max-width: 540px;
      background: var(--card-bg);
      border-radius: 24px;
      border: 1px solid var(--border);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
      overflow: hidden;
    }
    .header {
      padding: 24px 28px;
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .header-icon {
      width: 48px;
      height: 48px;
      background: rgba(255, 255, 255, 0.18);
      backdrop-filter: blur(8px);
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    .header-title h1 { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; }
    .header-title p { font-size: 12.5px; color: rgba(255, 255, 255, 0.88); margin-top: 2px; }
    .body {
      padding: 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 12.5px;
      font-weight: 700;
      margin-bottom: 20px;
    }
    .status-connected {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-qr {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .status-disconnected {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot-connected { background: #10b981; }
    .dot-qr { background: #3b82f6; animation: pulse 1.5s infinite; }
    .dot-disconnected { background: #ef4444; }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.3); }
    }
    .qr-card {
      padding: 16px;
      background: #ffffff;
      border-radius: 18px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      margin-bottom: 20px;
    }
    .qr-img { width: 250px; height: 250px; border-radius: 10px; display: block; }
    .instructions {
      background: #0f172a;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 18px;
      text-align: left;
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-muted);
      width: 100%;
      margin-bottom: 18px;
    }
    .instructions strong { color: #f8fafc; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 11px 20px;
      border-radius: 12px;
      font-size: 13.5px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      transition: all 150ms ease;
      width: 100%;
      margin-top: 10px;
    }
    .btn-danger {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.25); }
    .btn-outline {
      background: #0f172a;
      color: #60a5fa;
      border: 1px solid #3b82f6;
    }
    .btn-outline:hover { background: #1e3a8a; color: #ffffff; }
    .success-box {
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .success-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.15);
      border: 2px solid #10b981;
      color: #34d399;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
    }
    .connected-phone { font-size: 20px; font-weight: 800; color: #f8fafc; }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 6px;
      margin-top: 4px;
    }
    .modal-box {
      margin-top: 14px;
      padding: 12px;
      background: #020617;
      color: #38bdf8;
      border: 1px solid #1e293b;
      border-radius: 10px;
      font-size: 11px;
      text-align: left;
      font-family: monospace;
      word-break: break-all;
      max-height: 120px;
      overflow-y: auto;
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-icon">💬</div>
      <div class="header-title">
        <h1>Arsalynk WhatsApp Gateway</h1>
        <p>Live 2-Way Sync & Serverless Deployment Ready</p>
      </div>
    </div>

    <div class="body" id="app">
      <div class="status-pill status-qr">
        <span class="dot dot-qr"></span>
        <span>Menghubungkan ke WhatsApp...</span>
      </div>
      <p style="color: var(--text-muted); font-size: 13px;">Memuat status gateway...</p>
    </div>
  </div>

  <script>
    async function updateDashboard() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        const app = document.getElementById('app');

        const envBadge = data.isServerless
          ? '<span class="badge" style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3)">⚡ Serverless (Vercel / Cloud)</span>'
          : '<span class="badge" style="background:rgba(59,130,246,0.15);color:#93c5fd;border:1px solid rgba(59,130,246,0.3)">🖥️ Standard Server / VPS</span>';

        if (data.status === 'connected') {
          app.innerHTML = \`
            <div class="status-pill status-connected">
              <span class="dot dot-connected"></span>
              <span>WhatsApp Terhubung & Aktif</span>
            </div>

            <div class="success-box">
              <div class="success-icon">✓</div>
              <h3 style="font-size: 16px; font-weight: 700;">Gateway Siap Mengirim & Menerima Pesan</h3>
              <div class="connected-phone">📱 \${data.phone || 'Nomor WhatsApp Anda'}</div>
              \${envBadge}
              <p style="font-size: 12.5px; color: var(--text-muted); max-width: 340px; margin-top: 6px;">
                Website Arsalynk terhubung langsung dengan nomor ini untuk komunikasi 2 arah secara real-time.
              </p>
            </div>

            <button class="btn btn-outline" onclick="exportSession()">
              📦 Export Session (WA_SESSION_BASE64)
            </button>
            <div id="sessionBox" class="modal-box"></div>

            <button class="btn btn-outline" style="border-color: #eab308; color: #fde047;" onclick="repairSession()">
              ⚡ Perbaiki Enkripsi (Fix Bad MAC / Pre-Key)
            </button>

            <button class="btn btn-danger" onclick="logoutSession()">
              🔄 Putuskan & Scan Ulang WhatsApp
            </button>
          \`;
        } else if (data.status === 'qr_ready' && data.qrImage) {
          app.innerHTML = \`
            <div class="status-pill status-qr">
              <span class="dot dot-qr"></span>
              <span>Silakan Scan QR Code</span>
            </div>

            <div class="qr-card">
              <img src="\${data.qrImage}" class="qr-img" alt="Scan QR Code" />
            </div>

            <div class="instructions">
              <strong>👉 Cara Menghubungkan:</strong><br>
              1. Buka <strong>WhatsApp</strong> di HP Anda.<br>
              2. Ketuk menu <strong>Perangkat Tertaut (Linked Devices)</strong>.<br>
              3. Ketuk <strong>Tautkan Perangkat</strong> dan arahkan kamera ke QR Code di atas.
            </div>
            \${envBadge}
          \`;
        } else {
          app.innerHTML = \`
            <div class="status-pill status-disconnected">
              <span class="dot dot-disconnected"></span>
              <span>Sedang Menyiapkan Sesi...</span>
            </div>
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
              Mohon tunggu beberapa detik, QR Code sedang dibuat...
            </p>
            \${envBadge}
          \`;
        }
      } catch (err) {
        console.error(err);
      }
    }

    async function repairSession() {
      try {
        const res = await fetch('/api/session/repair', { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'Kunci enkripsi berhasil diperbaiki!');
        updateDashboard();
      } catch (err) {
        alert('Gagal memperbaiki enkripsi: ' + err.message);
      }
    }

    async function exportSession() {
      try {
        const res = await fetch('/api/session/export');
        const data = await res.json();
        const box = document.getElementById('sessionBox');
        if (data.sessionBase64) {
          box.style.display = 'block';
          box.innerText = data.sessionBase64;
          navigator.clipboard.writeText(data.sessionBase64);
          alert('Berhasil disalin ke clipboard! (' + data.fileCount + ' files bundle)\\n\\nTempelkan ke Environment Variable WA_SESSION_BASE64 di Vercel agar login tersimpan permanen.');
        } else {
          alert(data.error || 'Gagal mengekspor session');
        }
      } catch (err) {
        alert('Gagal mengambil session: ' + err.message);
      }
    }

    async function logoutSession() {
      if (!confirm('Apakah Anda yakin ingin memutuskan dan scan ulang WhatsApp?')) return;
      await fetch('/api/logout', { method: 'POST' });
      updateDashboard();
    }

    updateDashboard();
    setInterval(updateDashboard, 2500);
  </script>
</body>
</html>
  `);
});

// ── 10. SERVER BOOTSTRAP ───────────────────────────────────────────────
if (!isServerless || process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\n🤖 WhatsApp Gateway Control Center aktif di: http://localhost:${PORT}`);
    console.log(`📁 Auth Storage Path: ${AUTH_PATH} (Serverless Mode: ${isServerless})`);
    startWhatsAppBot();
  });
} else {
  // Auto-init for Serverless Container Cold Start
  startWhatsAppBot();
}

// ── 11. GLOBAL PROCESS ERROR SHIELDS (Anti-Crash Guard) ────────────────
// Mencegah server Node.js crash ketika Baileys socket terputus saat proses retry enkripsi
process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  const isTransientSocketError =
    msg.includes('Connection Closed') ||
    msg.includes('rate-overlimit') ||
    msg.includes('WebSocket') ||
    msg.includes('Precondition Required') ||
    reason?.output?.statusCode === 428 ||
    reason?.output?.statusCode === 408;

  if (isTransientSocketError) {
    console.warn('⚠️ [Shield] Baileys transient socket disconnect ditangani dengan aman.');
    return;
  }
  console.error('⚠️ [Shield] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err);
  const isTransientSocketError =
    msg.includes('Connection Closed') ||
    msg.includes('rate-overlimit') ||
    msg.includes('WebSocket') ||
    msg.includes('Precondition Required') ||
    err?.output?.statusCode === 428 ||
    err?.output?.statusCode === 408;

  if (isTransientSocketError) {
    console.warn('⚠️ [Shield] Baileys socket error ditangani secara otomatis.');
    return;
  }
  console.error('⚠️ [Shield] Uncaught Exception:', err);
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing WhatsApp connection...');
  if (sock) {
    try { sock.end(); } catch {}
  }
  process.exit(0);
});

module.exports = app;
