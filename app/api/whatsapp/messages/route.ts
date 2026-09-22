import { NextRequest, NextResponse } from 'next/server';
import { WA_CONFIG } from '@/lib/whatsapp/config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/whatsapp/messages?sessionId=guest_xxx
 *
 * Proxy ke Gateway Hostinger: GET {WAHA_BASE_URL}/api/messages?sessionId=...
 *
 * Mengapa ini perlu?
 * - Next.js berjalan di Vercel Serverless: setiap container memiliki /tmp terisolasi.
 * - Pesan live chat TIDAK bisa dibaca antar-container dari SQLite /tmp.
 * - Gateway Hostinger (Node.js stateful) menyimpan semua pesan di SQLite persisten.
 * - Route ini menjadi proxy agar browser tidak perlu CORS langsung ke Gateway.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId parameter is required' },
      { status: 400 }
    );
  }

  if (!WA_CONFIG.configured) {
    return NextResponse.json(
      { success: false, error: 'WhatsApp Gateway is not configured', data: [] },
      { status: 503 }
    );
  }

  const gatewayUrl = `${WA_CONFIG.baseUrl}/api/messages?sessionId=${encodeURIComponent(sessionId)}`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (WA_CONFIG.secret) {
      headers['x-gateway-secret'] = WA_CONFIG.secret;
      headers['X-Api-Key'] = WA_CONFIG.secret;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WA_CONFIG.timeoutMs);

    const res = await fetch(gatewayUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[Messages] Gateway returned HTTP ${res.status}: ${errText}`);
      return NextResponse.json(
        { success: false, error: `Gateway error: ${res.status}`, upstreamStatus: res.status, data: [] },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const msg = isTimeout
      ? 'Gateway tidak merespon (timeout)'
      : (err instanceof Error ? err.message : String(err));
    console.warn(`[Messages] Error fetching from gateway: ${msg}`);
    // Return empty list alih-alih error — UI tetap berjalan meski gateway down
    return NextResponse.json(
      { success: true, data: [], _warning: msg },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  }
}
