import { getDb } from '@/lib/db/db';
import { WA_CONFIG } from '@/lib/whatsapp/config';

export const WAHA_CONFIG = {
  get baseUrl() {
    return WA_CONFIG.baseUrl;
  },
  get session() {
    return process.env.WAHA_SESSION || 'default';
  },
  get apiKey() {
    return WA_CONFIG.secret;
  },
  get csPhone() {
    return WA_CONFIG.csPhone;
  },
  get timeoutMs() {
    return WA_CONFIG.timeoutMs;
  },
};

export interface LiveChatMessageRecord {
  id: string;
  sessionId: string;
  sender: 'user' | 'bot' | 'human_cs';
  content: string;
  createdAt: string;
}

/**
 * Remove the internal website-session marker from customer-facing CS messages.
 *
 * The marker remains part of the WhatsApp routing contract, for example:
 *   [#guest_xxx] Halo kak
 * but the website only displays:
 *   Halo kak
 */
function stripWebsiteSessionTag(text: string): string {
  const raw = String(text || '').trim();
  if (!raw) return '';

  return raw
    .replace(/^\s*\*?\[#\s*guest_[a-zA-Z0-9_-]+\]\*?\s*:?[\s]*/i, '')
    .replace(/^\s*\*?#\s*guest_[a-zA-Z0-9_-]+\*?\s*:?[\s]*/i, '')
    .trim();
}

function normalizeLiveChatContent(
  sender: 'user' | 'bot' | 'human_cs',
  content: string
): string {
  if (sender !== 'human_cs') return String(content || '');
  return stripWebsiteSessionTag(content) || String(content || '').trim();
}

/**
 * Format standard Indonesian/International phone to WAHA chatId.
 */
export function formatChatId(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  const normalized = cleaned.startsWith('0') ? `62${cleaned.slice(1)}` : cleaned;
  return `${normalized}@c.us`;
}

function normalizePhone(phone: string): string {
  const cleaned = String(phone || '').replace(/\D/g, '');
  return cleaned.startsWith('0') ? `62${cleaned.slice(1)}` : cleaned;
}

async function sendViaCrmWa(toPhone: string, text: string): Promise<boolean> {
  if (!WA_CONFIG.gatewayConfigured) {
    console.warn('[WhatsApp][crm_wa] Pengiriman dibatalkan: konfigurasi gateway belum lengkap.');
    return false;
  }

  const url = `${WAHA_CONFIG.baseUrl}/api/sendText`;
  const chatId = formatChatId(toPhone);
  const timeoutLimit = WAHA_CONFIG.timeoutMs;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (WAHA_CONFIG.apiKey) {
      headers['X-Api-Key'] = WAHA_CONFIG.apiKey;
      headers['x-gateway-secret'] = WAHA_CONFIG.apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutLimit);

    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        chatId,
        text,
        session: WAHA_CONFIG.session,
      }),
    });
    clearTimeout(timeout);

    const resData = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = resData?.error || resData?.message || JSON.stringify(resData);
      console.warn(`[WhatsApp][crm_wa] Gateway returned HTTP ${res.status}: ${msg}`);
      return false;
    }

    if (resData && resData.queued) {
      console.info(
        `[WhatsApp][crm_wa] Pesan disimpan di antrean gateway (status: ${resData.status || 'offline'}).`
      );
    }

    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(
        `[WhatsApp][crm_wa] Timeout: Gateway (${url}) tidak merespon dalam ${Math.round(timeoutLimit / 1000)} detik.`
      );
    } else {
      console.warn('[WhatsApp][crm_wa] Failed to connect to gateway:', err);
    }
    return false;
  }
}

async function sendViaMetaCloud(toPhone: string, text: string): Promise<boolean> {
  if (!WA_CONFIG.cloudConfigured || !WA_CONFIG.cloudMessagesUrl) {
    console.warn(
      '[WhatsApp][meta_cloud] Pengiriman dibatalkan: WHATSAPP_CLOUD_PHONE_NUMBER_ID / WHATSAPP_CLOUD_ACCESS_TOKEN belum lengkap.'
    );
    return false;
  }

  const timeoutLimit = WA_CONFIG.timeoutMs;
  const to = normalizePhone(toPhone);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutLimit);

    const res = await fetch(WA_CONFIG.cloudMessagesUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WA_CONFIG.cloudAccessToken}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body: String(text),
        },
      }),
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const metaMessage =
        data?.error?.message ||
        data?.error?.error_user_msg ||
        JSON.stringify(data);
      console.warn(
        `[WhatsApp][meta_cloud] Graph API HTTP ${res.status}: ${metaMessage}`
      );
      return false;
    }

    console.info(
      `[WhatsApp][meta_cloud] Pesan terkirim ke ${to}. messageId=${data?.messages?.[0]?.id || '-'}`
    );
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(
        `[WhatsApp][meta_cloud] Timeout Graph API setelah ${Math.round(timeoutLimit / 1000)} detik.`
      );
    } else {
      console.warn('[WhatsApp][meta_cloud] Gagal menghubungi Graph API:', err);
    }
    return false;
  }
}

/**
 * Unified outbound WhatsApp sender.
 *
 * BAYPASS=true  -> crm wa / Baileys gateway
 * BAYPASS=false -> Meta WhatsApp Cloud API
 */
export async function sendWahaMessage(toPhone: string, text: string): Promise<boolean> {
  return WA_CONFIG.baypass
    ? sendViaCrmWa(toPhone, text)
    : sendViaMetaCloud(toPhone, text);
}

/**
 * Store message in SQLite live_chat_messages table
 */
export function recordLiveChatMessage(
  sessionId: string,
  sender: 'user' | 'bot' | 'human_cs',
  content: string,
  whatsappMessageId?: string
): LiveChatMessageRecord {
  const db = getDb();
  const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const displayContent = normalizeLiveChatContent(sender, content);

  db.prepare(
    `INSERT INTO live_chat_sessions (id, last_message, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_message = excluded.last_message, updated_at = excluded.updated_at`
  ).run(sessionId, displayContent, now);

  db.prepare(
    `INSERT INTO live_chat_messages (id, session_id, sender, content, created_at, whatsapp_message_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, sessionId, sender, displayContent, now, whatsappMessageId || null);

  return { id, sessionId, sender, content: displayContent, createdAt: now };
}

/**
 * Get message history for a specific guest session.
 */
export function getLiveChatMessages(sessionId: string): LiveChatMessageRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, session_id as sessionId, sender, content, created_at as createdAt
       FROM live_chat_messages
       WHERE session_id = ?
       ORDER BY created_at ASC`
    )
    .all(sessionId) as LiveChatMessageRecord[];

  return rows.map((row) => ({
    ...row,
    content: normalizeLiveChatContent(row.sender, row.content),
  }));
}

/**
 * Escalate guest inquiry to CS WhatsApp number through the selected provider.
 */
export async function forwardGuestInquiryToWhatsApp(
  sessionId: string,
  guestMessage: string,
  guestName?: string
): Promise<boolean> {
  const name = guestName || `Tamu Website (${sessionId.slice(-6)})`;
  const notificationText =
    `🔔 *[CHAT BARU DARI WEBSITE ARSALYNK]*\n\n` +
    `👤 *Pengirim:* ${name}\n` +
    `🆔 *Sesi:* #${sessionId}\n` +
    `💬 *Pesan:* "${guestMessage}"\n\n` +
    `──────────────────────\n` +
    `👉 *Cara Membalas:* Cukup balas chat ini dengan awalan format:\n` +
    `*[#${sessionId}] Balasan anda...*\n\n` +
    `_Balasan Anda akan langsung muncul di layar obrolan website pengunjung secara otomatis._`;

  return await sendWahaMessage(WAHA_CONFIG.csPhone, notificationText);
}
