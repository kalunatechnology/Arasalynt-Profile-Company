import { WA_CONFIG } from './config';

export interface HandoffPayload {
  sessionId: string;
  message: string;
  name?: string;
  requestId?: string;
}

export interface HandoffResponse {
  accepted: boolean;
  requestId: string;
  conversationCode: string;
  status: string;
  isDuplicate?: boolean;
  error?: string;
}

/**
 * Request human handoff to Hostinger WhatsApp Backend.
 * Uses stable Request ID & Idempotency Key to prevent double-sends.
 */
export async function requestHumanHandoff(payload: HandoffPayload): Promise<HandoffResponse> {
  const requestId = payload.requestId || `handoff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const idempotencyKey = `waout_${requestId}`;
  const timestamp = Date.now().toString();

  if (!WA_CONFIG.configured) {
    return {
      accepted: false,
      requestId,
      conversationCode: '',
      status: 'CONFIG_ERROR',
      error: 'WhatsApp Gateway belum dikonfigurasi dengan aman.',
    };
  }

  const url = `${WA_CONFIG.baseUrl}/api/whatsapp/handoff`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WA_CONFIG.timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        'X-Idempotency-Key': idempotencyKey,
        'X-Timestamp': timestamp,
        'x-gateway-secret': WA_CONFIG.secret,
        'X-Api-Key': WA_CONFIG.secret,
      },
      body: JSON.stringify({
        requestId,
        sessionId: payload.sessionId,
        message: payload.message,
        name: payload.name,
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);

    if (res.status === 202 || res.ok) {
      return {
        accepted: true,
        requestId,
        conversationCode: data?.conversationCode || 'QUEUED',
        status: data?.status || 'QUEUED',
        isDuplicate: Boolean(data?.isDuplicate),
      };
    }

    return {
      accepted: false,
      requestId,
      conversationCode: '',
      status: 'FAILED',
      error: data?.error || `Gateway returned HTTP ${res.status}`,
    };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const msg = isTimeout
      ? `Gateway timeout (${WA_CONFIG.timeoutMs}ms)`
      : (err instanceof Error ? err.message : String(err));

    console.warn('[HandoffClient] Error sending handoff to gateway:', msg);

    return {
      accepted: false,
      requestId,
      conversationCode: '',
      status: 'RETRY_WAIT',
      error: msg,
    };
  } finally {
    clearTimeout(timeout);
  }
}
