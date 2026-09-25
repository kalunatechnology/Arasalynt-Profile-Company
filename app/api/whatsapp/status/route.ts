import { NextResponse } from 'next/server';
import { WA_CONFIG } from '@/lib/whatsapp/config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/whatsapp/status
 *
 * BAYPASS=true  -> proxy stable crm wa /api/status
 * BAYPASS=false -> validate Meta Cloud outbound connectivity and report
 *                  inbound webhook readiness separately.
 */
export async function GET() {
  if (!WA_CONFIG.baypass) {
    if (!WA_CONFIG.cloudConfigured || !WA_CONFIG.cloudPhoneInfoUrl) {
      return NextResponse.json(
        {
          ready: false,
          status: 'config_error',
          provider: 'meta_cloud',
          outboundReady: false,
          inboundReady: WA_CONFIG.cloudWebhookConfigured,
          webhookConfigError: WA_CONFIG.cloudWebhookConfigError || null,
          error:
            'Meta Cloud belum lengkap. Pastikan PHONE_NUMBER_ID, ACCESS_TOKEN, dan WHATSAPP_CLOUD_CS_PHONE terisi.',
        },
        { status: 503 }
      );
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WA_CONFIG.timeoutMs);

      const res = await fetch(WA_CONFIG.cloudPhoneInfoUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${WA_CONFIG.cloudAccessToken}`,
        },
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const metaError =
          data?.error?.message ||
          data?.error?.error_user_msg ||
          `Meta Graph API HTTP ${res.status}`;

        return NextResponse.json(
          {
            ready: false,
            status: 'meta_api_error',
            provider: 'meta_cloud',
            outboundReady: false,
            inboundReady: WA_CONFIG.cloudWebhookConfigured,
            webhookConfigError: WA_CONFIG.cloudWebhookConfigError || null,
            error: metaError,
          },
          { status: 502 }
        );
      }

      const inboundReady = WA_CONFIG.cloudWebhookConfigured;

      return NextResponse.json({
        ready: inboundReady,
        status: inboundReady ? 'connected' : 'webhook_config_error',
        provider: 'meta_cloud',
        mode: 'direct_text',
        outboundReady: true,
        inboundReady,
        phoneNumberId: data?.id || WA_CONFIG.cloudPhoneNumberId,
        displayPhoneNumber: data?.display_phone_number || null,
        verifiedName: data?.verified_name || null,
        destinationPhone: WA_CONFIG.cloudCsPhone,
        webhookConfigured: inboundReady,
        webhookVerifyTokenConfigured: Boolean(WA_CONFIG.cloudVerifyToken),
        webhookSignatureSecretConfigured: WA_CONFIG.cloudAppSecrets.length > 0,
        webhookSignatureSecretSources: WA_CONFIG.cloudAppSecretSources,
        webhookConfigError: WA_CONFIG.cloudWebhookConfigError || null,
      });
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const msg = isTimeout
        ? `Meta Graph API timeout (${WA_CONFIG.timeoutMs}ms)`
        : err instanceof Error
          ? err.message
          : String(err);

      return NextResponse.json(
        {
          ready: false,
          status: 'unreachable',
          provider: 'meta_cloud',
          outboundReady: false,
          inboundReady: WA_CONFIG.cloudWebhookConfigured,
          webhookConfigError: WA_CONFIG.cloudWebhookConfigError || null,
          error: msg,
        },
        { status: 503 }
      );
    }
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
      : err instanceof Error
        ? err.message
        : String(err);

    return NextResponse.json(
      { ready: false, status: 'unreachable', provider: 'crm_wa', error: msg },
      { status: 503 }
    );
  }
}
