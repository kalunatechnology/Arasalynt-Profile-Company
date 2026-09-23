import { forwardGuestInquiryToWhatsApp } from '@/lib/waha.service';
import { WA_CONFIG } from '@/lib/whatsapp/config';

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
  provider?: 'crm_wa' | 'meta_cloud';
  isDuplicate?: boolean;
  error?: string;
}

/**
 * Provider-aware human handoff.
 *
 * BAYPASS=true  -> stable crm wa /api/sendText
 * BAYPASS=false -> Meta WhatsApp Cloud API direct text
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
        provider: WA_CONFIG.provider,
      };
    }

    return {
      accepted: false,
      requestId,
      conversationCode: '',
      status: 'FAILED',
      provider: WA_CONFIG.provider,
      error:
        WA_CONFIG.provider === 'meta_cloud'
          ? 'Meta WhatsApp Cloud API tidak menerima pesan.'
          : 'WhatsApp Gateway menolak atau gagal mengirim handoff.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[HandoffClient][${WA_CONFIG.provider}] handoff failed:`, msg);

    return {
      accepted: false,
      requestId,
      conversationCode: '',
      status: 'FAILED',
      provider: WA_CONFIG.provider,
      error: msg,
    };
  }
}
