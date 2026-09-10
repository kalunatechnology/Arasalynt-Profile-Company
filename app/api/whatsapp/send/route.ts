import { NextRequest, NextResponse } from 'next/server';
import { forwardGuestInquiryToWhatsApp, WAHA_CONFIG } from '@/lib/waha.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/send
 * Body: { sessionId, message, name? }
 *
 * Menyimpan pesan user di Gateway SQLite (stateful, persisten)
 * lalu meneruskan ke CS WhatsApp via WAHA.
 *
 * SQLite Vercel /tmp TIDAK digunakan lagi untuk live chat karena
 * setiap Serverless container memiliki /tmp yang terisolasi.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, message, name } = body;

    if (!sessionId || !message) {
      return NextResponse.json(
        { error: 'sessionId and message are required' },
        { status: 400 }
      );
    }

    // Simpan pesan user ke Gateway SQLite (non-blocking)
    saveUserMessageToGateway(sessionId, message).catch((err) => {
      console.warn('[WA Send] Failed saving user message to gateway:', err);
    });

    // Teruskan ke CS WhatsApp via WAHA (non-blocking)
    forwardGuestInquiryToWhatsApp(sessionId, message, name).catch((err) => {
      console.warn('[WA Send] Failed forwarding to WAHA:', err);
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed sending message: ${errorMsg}` },
      { status: 500 }
    );
  }
}

/**
 * Simpan pesan pengunjung web ke SQLite di Gateway Hostinger.
 * POST {WAHA_BASE_URL}/api/messages/user
 */
async function saveUserMessageToGateway(sessionId: string, message: string): Promise<void> {
  if (!process.env.WAHA_BASE_URL) return;

  const url = `${WAHA_CONFIG.baseUrl}/api/messages/user`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (WAHA_CONFIG.apiKey) {
    headers['x-gateway-secret'] = WAHA_CONFIG.apiKey;
    headers['X-Api-Key'] = WAHA_CONFIG.apiKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WAHA_CONFIG.timeoutMs);

  try {
    await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({ sessionId, message }),
    });
  } finally {
    clearTimeout(timeout);
  }
}
