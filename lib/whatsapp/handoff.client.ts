import { forwardGuestInquiryToWhatsApp } from '@/lib/waha.service';

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
 * Compatibility handoff for the stable legacy Hostinger gateway.
 *
 * The gateway runtime intentionally stays on the proven /api/sendText contract.
 * This client reuses forwardGuestInquiryToWhatsApp(), which formats the session
 * marker and sends it through /api/sendText without changing gateway startup.
 */
export async function requestHumanHandoff(payload: HandoffPayload): Promise<HandoffResponse> {
  const requestId =
    payload.requestId ||
    `handoff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const sent = await forwardGuestInquiryToWhatsApp(
      payload.sessionId,
      payload.message,
      payload.name,
    );

    if (sent) {
      return {
        accepted: true,
        requestId,
        conversationCode: payload.sessionId,
        status: 'SENT',
      };
    }

    return {
      accepted: false,
      requestId,
      conversationCode: '',
      status: 'FAILED',
      error: 'WhatsApp Gateway menolak atau gagal mengirim handoff.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[HandoffClient] Legacy gateway handoff failed:', msg);

    return {
      accepted: false,
      requestId,
      conversationCode: '',
      status: 'FAILED',
      error: msg,
    };
  }
}
