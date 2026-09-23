import { NextResponse } from 'next/server';
import { WA_CONFIG } from '@/lib/whatsapp/config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/whatsapp/status
 *
 * Legacy-compatible proxy to the stable gateway /api/status endpoint.
 */
export async function GET() {
  if (!WA_CONFIG.baseUrl) {
    return NextResponse.json(
      { ready: false, status: 'config_error', error: 'WhatsApp Gateway URL is not configured' },
      { status: 503 }
    );
  }

  try {
    const headers: Record<string, string> = {};
    if (WA_CONFIG.secret) {
      headers['x-gateway-secret'] = WA_CONFIG.secret;
      headers['X-Api-Key'] = WA_CONFIG.secret;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WA_CONFIG.timeoutMs);
    const res = await fetch(`${WA_CONFIG.baseUrl}/api/status`, {
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        {
          ready: false,
          status: data?.status || 'gateway_error',
          error: data?.error || `Gateway returned HTTP ${res.status}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ...data,
      ready: data?.status === 'connected',
    });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const msg = isTimeout
      ? `Gateway timeout (${WA_CONFIG.timeoutMs}ms)`
      : (err instanceof Error ? err.message : String(err));

    return NextResponse.json(
      { ready: false, status: 'unreachable', error: msg },
      { status: 503 }
    );
  }
}
