import { NextResponse } from 'next/server';
import { WA_CONFIG } from '@/lib/whatsapp/config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/whatsapp/status
 *
 * BAYPASS=true  -> proxy stable crm wa /api/status
 * BAYPASS=false -> report Meta Cloud API configuration readiness
 */
export async function GET() {
  if (!WA_CONFIG.baypass) {
    if (!WA_CONFIG.cloudConfigured) {
      return NextResponse.json(
        {
          ready: false,
          status: 'config_error',
          provider: 'meta_cloud',
          error: 'Meta WhatsApp Cloud API belum dikonfigurasi lengkap',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ready: true,
      status: 'connected',
      provider: 'meta_cloud',
      mode: 'cloud_api',
      phoneNumberId: WA_CONFIG.cloudPhoneNumberId,
      webhookConfigured: Boolean(WA_CONFIG.cloudVerifyToken),
    });
  }

  if (!WA_CONFIG.baseUrl) {
    return NextResponse.json(
      {
        ready: false,
        status: 'config_error',
        provider: 'crm_wa',
        error: 'WhatsApp Gateway URL is not configured',
      },
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
          provider: 'crm_wa',
          error: data?.error || `Gateway returned HTTP ${res.status}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ...data,
      provider: 'crm_wa',
      ready: data?.status === 'connected',
    });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const msg = isTimeout
      ? `Gateway timeout (${WA_CONFIG.timeoutMs}ms)`
      : (err instanceof Error ? err.message : String(err));

    return NextResponse.json(
      { ready: false, status: 'unreachable', provider: 'crm_wa', error: msg },
      { status: 503 }
    );
  }
}
