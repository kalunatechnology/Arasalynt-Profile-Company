import { DEFAULT_CALLER_CONFIG } from '@/lib/chatbot.service';

export type DurableLiveChatSender = 'user' | 'human_cs';

export interface DurableLiveChatMessage {
  id: string;
  sessionId: string;
  sender: DurableLiveChatSender;
  content: string;
  createdAt: string;
  whatsappMessageId?: string | null;
}

function getChatbotBaseUrl(): string {
  return (
    process.env.CHATBOT_API_URL ||
    process.env.NEXT_PUBLIC_CHATBOT_API_URL ||
    'https://chatbot-arsalynk.vercel.app'
  ).replace(/\/$/, '');
}

function getChatbotToken(): string {
  return (
    process.env.CHATBOT_CALLER_TOKEN ||
    process.env.NEXT_PUBLIC_CHATBOT_CALLER_TOKEN ||
    DEFAULT_CALLER_CONFIG.callerToken ||
    ''
  ).trim();
}

function buildHeaders(sessionId: string): Record<string, string> {
  const token = getChatbotToken();
  if (!token) {
    throw new Error('CHATBOT_CALLER_TOKEN/NEXT_PUBLIC_CHATBOT_CALLER_TOKEN is not configured');
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-External-User-Id': sessionId,
  };
}

/**
 * Persist website/WhatsApp live-chat messages in Chatbot_Arsalynk PostgreSQL.
 * This is the canonical production store because Vercel /tmp SQLite is local
 * to one serverless instance and cannot safely bridge webhook -> polling.
 */
export async function persistDurableLiveChatMessage(input: {
  sessionId: string;
  sender: DurableLiveChatSender;
  content: string;
  whatsappMessageId?: string;
}): Promise<DurableLiveChatMessage> {
  const baseUrl = getChatbotBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${baseUrl}/api/v1/conversations/live-chat/messages`, {
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
  const baseUrl = getChatbotBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `${baseUrl}/api/v1/conversations/live-chat/messages?sessionId=${encodeURIComponent(sessionId)}`,
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
