import { getEnterpriseChatbotConfig } from '@/lib/chatbot/enterprise-auth';

export type DurableLiveChatSender = 'user' | 'human_cs';

export interface DurableLiveChatMessage {
  id: string;
  sessionId: string;
  sender: DurableLiveChatSender;
  content: string;
  createdAt: string;
  whatsappMessageId?: string | null;
}

function buildHeaders(sessionId: string): Record<string, string> {
  const config = getEnterpriseChatbotConfig();

  return {
    Authorization: `Bearer ${config.tenantApiKey}`,
    'Content-Type': 'application/json',
    'X-External-User-Id': sessionId,
    'X-Tenant-External-Id': config.externalTenantId,
  };
}

/**
 * Persist website/WhatsApp live-chat messages in Chatbot_Arsalynk PostgreSQL.
 * Uses the same enterprise TenantCredential as ArsAI instead of the legacy
 * CallerCredential contract.
 */
export async function persistDurableLiveChatMessage(input: {
  sessionId: string;
  sender: DurableLiveChatSender;
  content: string;
  whatsappMessageId?: string;
}): Promise<DurableLiveChatMessage> {
  const config = getEnterpriseChatbotConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 10000));

  try {
    const response = await fetch(`${config.baseUrl}/api/v1/conversations/live-chat/messages`, {
      method: 'POST',
      headers: buildHeaders(input.sessionId),
      body: JSON.stringify(input),
      cache: 'no-store',
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !payload?.data) {
      const reason = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
      throw new Error(`Durable live-chat write failed: ${reason}`);
    }

    return {
      ...payload.data,
      createdAt: new Date(payload.data.createdAt).toISOString(),
    } as DurableLiveChatMessage;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchDurableLiveChatMessages(
  sessionId: string,
): Promise<DurableLiveChatMessage[]> {
  const config = getEnterpriseChatbotConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 10000));

  try {
    const response = await fetch(
      `${config.baseUrl}/api/v1/conversations/live-chat/messages?sessionId=${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
        headers: buildHeaders(sessionId),
        cache: 'no-store',
        signal: controller.signal,
      },
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !Array.isArray(payload?.data)) {
      const reason = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
      throw new Error(`Durable live-chat read failed: ${reason}`);
    }

    return payload.data.map((item: DurableLiveChatMessage) => ({
      ...item,
      createdAt: new Date(item.createdAt).toISOString(),
    }));
  } finally {
    clearTimeout(timeout);
  }
}
