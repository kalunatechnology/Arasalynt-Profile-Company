import { NextRequest, NextResponse } from 'next/server';
import { buildSignedRuntimeContext } from '@/lib/chatbot/enterprise-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function POST(req: NextRequest) {
  let controller: AbortController | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const body = await req.json().catch(() => null);
    const message = String(body?.message || '').trim();
    const conversationId = body?.conversationId
      ? String(body.conversationId).trim()
      : undefined;
    const externalUserId = String(body?.externalUserId || '').trim();

    if (!message || message.length > 4000) {
      return NextResponse.json(
        { success: false, error: 'message is required and must be <= 4000 characters' },
        { status: 400, headers: NO_CACHE_HEADERS },
      );
    }

    if (!externalUserId || externalUserId.length > 160) {
      return NextResponse.json(
        { success: false, error: 'externalUserId is required and must be <= 160 characters' },
        { status: 400, headers: NO_CACHE_HEADERS },
      );
    }

    const { context, signature, config } = buildSignedRuntimeContext(externalUserId);

    controller = new AbortController();
    const abortFromClient = () => controller?.abort();
    req.signal.addEventListener('abort', abortFromClient, { once: true });
    timeout = setTimeout(() => controller?.abort(), config.timeoutMs);

    const upstream = await fetch(`${config.baseUrl}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.tenantApiKey}`,
        'Content-Type': 'application/json',
        'X-Context-Signature': signature,
        'X-External-User-Id': externalUserId,
      },
      body: JSON.stringify({
        message,
        conversationId: conversationId || undefined,
        context,
      }),
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const payload = await upstream.json().catch(() => null);
      const reason =
        payload?.error?.message ||
        payload?.message ||
        `Chatbot upstream returned HTTP ${upstream.status}`;

      console.error(
        `[ChatbotTenantProxy] upstream rejected tenant=${config.externalTenantId} status=${upstream.status} reason=${reason}`,
      );

      return NextResponse.json(
        {
          success: false,
          error: reason,
          upstreamStatus: upstream.status,
        },
        { status: upstream.status, headers: NO_CACHE_HEADERS },
      );
    }

    if (!upstream.body) {
      return NextResponse.json(
        { success: false, error: 'Chatbot upstream returned an empty stream' },
        { status: 502, headers: NO_CACHE_HEADERS },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isAbort = error instanceof Error && error.name === 'AbortError';

    console.error(`[ChatbotTenantProxy] ${isAbort ? 'request aborted/timeout' : 'request failed'}: ${message}`);

    return NextResponse.json(
      {
        success: false,
        error: isAbort ? 'Chatbot request timed out or was cancelled' : message,
      },
      { status: isAbort ? 504 : 503, headers: NO_CACHE_HEADERS },
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
