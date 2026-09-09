import { getDb } from '@/lib/db/db';

export const WAHA_CONFIG = {
  get baseUrl() {
    let url = (process.env.WAHA_BASE_URL || 'http://localhost:3000').trim();
    // Bersihkan karakter accidental '=' di depan (misal salah paste: =https://...)
    url = url.replace(/^=+/, '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    return url.replace(/\/+$/, '');
  },
  get session() {
    return process.env.WAHA_SESSION || 'default';
  },
  get apiKey() {
    return (process.env.WAHA_API_KEY || process.env.GATEWAY_SECRET || '').trim();
  },
  get csPhone() {
    return (process.env.WHATSAPP_CS_PHONE || '6282252856710').trim();
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
  // If WAHA is pointing to default Next.js port 3000 without dedicated WAHA container, avoid spamming 404s
  if (!process.env.WAHA_BASE_URL && WAHA_CONFIG.baseUrl.includes(':3000')) {
    console.warn('[WAHA] Pengiriman dibatalkan: WAHA_BASE_URL belum dikonfigurasi di .env.');
    return false;
  }

  const url = `${WAHA_CONFIG.baseUrl}/api/sendText`;
  const chatId = formatChatId(toPhone);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (WAHA_CONFIG.apiKey) {
      headers['X-Api-Key'] = WAHA_CONFIG.apiKey;
      headers['x-gateway-secret'] = WAHA_CONFIG.apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

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

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[WAHA] Gateway returned HTTP ${res.status}: ${errText}`);
    }

    return res.ok;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`[WAHA] Timeout: WhatsApp Gateway (${url}) tidak merespon dalam 3 detik.`);
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

  // Pastikan session ada
  db.prepare(
    `INSERT INTO live_chat_sessions (id, last_message, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_message = excluded.last_message, updated_at = excluded.updated_at`
  ).run(sessionId, content, now);

  // Simpan pesan dengan whatsapp_message_id untuk deduplication
  db.prepare(
    `INSERT INTO live_chat_messages (id, session_id, sender, content, created_at, whatsapp_message_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, sessionId, sender, content, now, whatsappMessageId || null);

  return { id, sessionId, sender, content, createdAt: now };
}

/**
 * Get message history for a specific guest session
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

  return rows;
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
    `ðŸ”” *[CHAT BARU DARI WEBSITE ARSALYNK]*\n\n` +
    `ðŸ‘¤ *Pengirim:* ${name}\n` +
    `ðŸ†” *Sesi:* #${sessionId}\n` +
    `ðŸ’¬ *Pesan:* "${guestMessage}"\n\n` +
    `â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n` +
    `ðŸ‘‰ *Cara Membalas:* Cukup balas chat ini dengan awalan format:\n` +
    `*[#${sessionId}] Balasan anda...*\n\n` +
    `_Balasan Anda akan langsung muncul di layar obrolan website pengunjung secara otomatis._`;

  return await sendWahaMessage(WAHA_CONFIG.csPhone, notificationText);
}
