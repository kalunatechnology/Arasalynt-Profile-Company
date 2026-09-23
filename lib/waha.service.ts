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
    // [#guest_xxx], *[#guest_xxx]*, optionally followed by ':'
    .replace(/^\s*\*?\[#\s*guest_[a-zA-Z0-9_-]+\]\*?\s*:?[\s]*/i, '')
    // #guest_xxx, *#guest_xxx*, optionally followed by ':'
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
 * Format standard Indonesian/International phone to WAHA chatId (e.g. 628213939569@c.us)
 */
export function formatChatId(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  const normalized = cleaned.startsWith('0') ? `62${cleaned.slice(1)}` : cleaned;
  return `${normalized}@c.us`;
}

/**
 * Send WhatsApp text message via WAHA HTTP API / Baileys Gateway
 */
export async function sendWahaMessage(toPhone: string, text: string): Promise<boolean> {
  if (!WA_CONFIG.configured) {
    console.warn('[WAHA] Pengiriman dibatalkan: konfigurasi gateway belum lengkap.');
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
      console.warn(`[WAHA] Gateway returned HTTP ${res.status}: ${msg}`);
      return false;
    }

    if (resData && resData.queued) {
      console.info(`[WAHA] Pesan disimpan di antrean gateway (status: ${resData.status || 'offline'}). Akan terkirim setelah WhatsApp online.`);
    }

    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`[WAHA] Timeout: WhatsApp Gateway (${url}) tidak merespon dalam ${Math.round(timeoutLimit / 1000)} detik.`);
    } else {
      console.warn('[WAHA] Failed to connect to WhatsApp Gateway:', err);
    }
    return false;
  }
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

  // Pastikan session ada. Internal routing markers are intentionally not stored
  // in the customer-facing history for human CS messages.
  db.prepare(
    `INSERT INTO live_chat_sessions (id, last_message, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_message = excluded.last_message, updated_at = excluded.updated_at`
  ).run(sessionId, displayContent, now);

  // Simpan pesan dengan whatsapp_message_id untuk deduplication
  db.prepare(
    `INSERT INTO live_chat_messages (id, session_id, sender, content, created_at, whatsapp_message_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, sessionId, sender, displayContent, now, whatsappMessageId || null);

  return { id, sessionId, sender, content: displayContent, createdAt: now };
}

/**
 * Get message history for a specific guest session.
 * Existing historical rows are normalized on read so older messages that still
 * contain [#guest_xxx] are immediately rendered cleanly without a DB migration.
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
 * Escalate guest inquiry to CS WhatsApp number via WAHA
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
