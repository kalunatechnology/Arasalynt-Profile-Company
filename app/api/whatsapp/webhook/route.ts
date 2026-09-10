import { NextRequest, NextResponse } from 'next/server';
import { WAHA_CONFIG } from '@/lib/waha.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/webhook
 *
 * Webhook endpoint yang dipanggil oleh Gateway Hostinger.
 * Sejak migrasi ke Gateway SQLite, route ini HANYA bertugas:
 *  1. Memvalidasi secret
 *  2. Acknowledge event (200 OK)
 *
 * Penyimpanan pesan sekarang terjadi langsung di Gateway (crm wa/server.js)
 * sebelum webhook ini dipanggil — sehingga tidak perlu menulis ke SQLite Vercel.
 * SQLite Vercel (/tmp) tidak bisa diandalkan di lingkungan Serverless karena
 * setiap container memiliki filesystem yang terisolasi.
 */

const WEBHOOK_SECRET =
  process.env.GATEWAY_WEBHOOK_SECRET || process.env.WAHA_API_KEY || '';

export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).slice(2, 8);

  try {
    // ── Validasi Secret ────────────────────────────────────────────────
    if (WEBHOOK_SECRET) {
      const incoming =
        req.headers.get('x-gateway-secret') ||
        req.headers.get('x-api-key') ||
        req.headers.get('authorization')?.replace('Bearer ', '');
      if (incoming !== WEBHOOK_SECRET) {
        console.warn('[Webhook] Unauthorized. reqId=' + requestId);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const payload = await req.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ status: 'ignored', reason: 'Invalid JSON' });
    }

    const event = payload?.event || 'message';

    // Status update (READ/DELIVERED) — acknowledge saja
    if (event !== 'message') {
      return NextResponse.json({ status: 'acknowledged', event });
    }

    // Pesan — semua penyimpanan sudah dilakukan di Gateway sebelum webhook ini dipanggil.
    // Kita hanya log dan acknowledge.
    const msgPayload = payload?.payload || payload;
    const sessionId = msgPayload?.sessionId || '-';
    const msgId = msgPayload?.id || '-';
    const fromMe = Boolean(msgPayload?.fromMe);

    if (fromMe) {
      return NextResponse.json({ status: 'ignored', reason: 'fromMe echo' });
    }

    console.log(
      `[Webhook][reqId:${requestId}] OK. session=${sessionId} msgId=${msgId}`
    );
    return NextResponse.json({ status: 'ok', sessionId, msgId });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Webhook][reqId:' + requestId + '] Error: ' + msg);
    return NextResponse.json({ error: 'Webhook error: ' + msg }, { status: 500 });
  }
}
