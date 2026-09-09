import { NextRequest, NextResponse } from 'next/server';
import { recordLiveChatMessage } from '@/lib/waha.service';
import { getDb } from '@/lib/db/db';

export const dynamic = 'force-dynamic';

/**
 * Webhook endpoint untuk WhatsApp Gateway (Baileys)
 * Dipanggil saat CS membalas dari perangkat WhatsApp mereka.
 *
 * Hardening:
 * - Validasi x-gateway-secret jika GATEWAY_WEBHOOK_SECRET dikonfigurasi
 * - Deduplication menggunakan WhatsApp message ID (bukan hanya konten)
 * - Logging terstruktur dengan request ID
 * - Status 'ignored' untuk pesan yang dilewati (bukan 4xx/5xx)
 */

const WEBHOOK_SECRET = process.env.GATEWAY_WEBHOOK_SECRET || process.env.WAHA_API_KEY || '';

export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).slice(2, 8);

  try {
    // ── Validasi Secret (jika dikonfigurasi) ──────────────────────────
    if (WEBHOOK_SECRET) {
      const incomingSecret =
        req.headers.get('x-gateway-secret') ||
        req.headers.get('x-api-key') ||
        req.headers.get('authorization')?.replace('Bearer ', '');
      if (incomingSecret !== WEBHOOK_SECRET) {
        console.warn('[Webhook] Unauthorized request - invalid secret. reqId=' + requestId);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const payload = await req.json();

    // ── Hanya proses event 'message' ──────────────────────────────────
    const event = payload?.event || 'message';
    if (event !== 'message') {
      // Status update dan event lain: acknowledge tapi tidak simpan
      return NextResponse.json({ status: 'acknowledged', event });
    }

    const msgPayload = payload?.payload || payload;
    const senderFrom = msgPayload?.from || payload?.from || '';
    const messageId  = msgPayload?.id || payload?.id || null;
    const sessionId  = msgPayload?.sessionId || null;
    const fromMe     = Boolean(msgPayload?.fromMe || payload?.fromMe);

    // ── Abaikan echo dari bot itu sendiri (outgoing) ────────────────
    if (fromMe) {
      return NextResponse.json({ status: 'ignored', reason: 'Bot outgoing echo ignored' });
    }

    const messageBody: string =
      msgPayload?.body ||
      payload?.body ||
      payload?.message?.text ||
      payload?.text ||
      '';

    if (!messageBody || typeof messageBody !== 'string') {
      return NextResponse.json({ status: 'ignored', reason: 'Empty body' });
    }

    const db = getDb();

    // ── Deduplication menggunakan WhatsApp message ID ─────────────────
    // Ini lebih reliable daripada dedup berbasis konten+timestamp
    if (messageId) {
      const existing = db
        .prepare('SELECT id FROM live_chat_messages WHERE whatsapp_message_id = ? LIMIT 1')
        .get(messageId) as { id: string } | undefined;
      if (existing) {
        return NextResponse.json({ status: 'ignored', reason: 'Duplicate message ID: ' + messageId });
      }
    }

    // ── Resolve session ID ─────────────────────────────────────────────
    // Priority 1: sessionId dari gateway (sudah di-parse dari quote/teks)
    // Priority 2: Tag [#guest_xxx] atau #guest_xxx dari body teks
    // Priority 3: Sesi aktif terbaru di database (fallback jika CS membalas langsung tanpa tag)

    let targetSessionId = '';
    let replyText = messageBody.trim();

    if (sessionId && typeof sessionId === 'string' && sessionId.trim()) {
      targetSessionId = sessionId.trim();
      // Bersihkan tag [#guest_xxx] atau variasinya dari balasan teks
      replyText = replyText
        .replace(/(?:\*?\[#\s*|\*?#)[a-zA-Z0-9_-]+(?:\]\*?|:)?\s*/gi, '')
        .trim() || replyText;
    }

    if (!targetSessionId) {
      // Tangkap format [#guest_xxx], *[#guest_xxx]*, #guest_xxx
      const tagMatch = messageBody.match(/(?:\[#|#|\*\[#)([a-zA-Z0-9_-]+)(?:\]\*|\]|:)?/i);
      if (tagMatch && tagMatch[1]) {
        targetSessionId = tagMatch[1].trim();
        replyText = messageBody
          .replace(/(?:\*?\[#\s*|\*?#)[a-zA-Z0-9_-]+(?:\]\*?|:)?\s*/gi, '')
          .trim() || messageBody.trim();
      }
    }

    // ── Validasi Ketat Sesi (Strict Session Matching) ─────────────────
    // Pesan HANYA diterima jika memiliki identitas sesi yang valid:
    // 1. Dideteksi via quote/reply WhatsApp oleh gateway (sessionId)
    // 2. Ditulis secara eksplisit dengan tag [#guest_xxx] atau variasinya
    // TIDAK ADA fallback tebak sesi agar tidak terjadi salah kirim antar pengunjung!
    if (!targetSessionId || !replyText) {
      console.warn(`[Webhook][reqId:${requestId}] Ditolak: Pesan tidak memiliki tag sesi yang valid atau isi pesan kosong.`);
      return NextResponse.json({
        status: 'ignored',
        reason: 'Missing valid session tag or empty reply (strict session matching)',
      });
    }

    // ── Content deduplication (backup: konten identik < 5 detik) ─────
    const lastMessage = db
      .prepare(
        `SELECT content, created_at FROM live_chat_messages
         WHERE session_id = ? AND sender = 'human_cs'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(targetSessionId) as { content: string; created_at: string } | undefined;

    if (lastMessage && lastMessage.content === replyText) {
      const timeDiff = Date.now() - new Date(lastMessage.created_at).getTime();
      if (timeDiff < 5000) {
        return NextResponse.json({ status: 'ignored', reason: 'Duplicate content within 5s' });
      }
    }

    // ── Simpan ke database ─────────────────────────────────────────────
    const saved = recordLiveChatMessage(targetSessionId, 'human_cs', replyText, messageId || undefined);
    console.log(
      '[Webhook][reqId:' + requestId + '] CS reply saved: session=' + targetSessionId +
      ' msgId=' + (messageId || '-') + ' text="' + replyText.slice(0, 60) + '"'
    );

    return NextResponse.json({ success: true, data: saved });

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Webhook][reqId:' + requestId + '] Error:', errorMsg);
    return NextResponse.json({ error: 'Webhook error: ' + errorMsg }, { status: 500 });
  }
}
