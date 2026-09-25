import {
  ChatMessage,
  Conversation,
  ConversationDetail,
  KnowledgeDocument,
  SearchKnowledgeResultItem,
  QuickActionItem,
} from '@/types/chatbot';

/**
 * Legacy caller metadata is retained only for old helper APIs. The public web
 * chat no longer embeds a caller bearer token in the browser bundle.
 */
export const DEFAULT_CALLER_CONFIG = {
  callerName: process.env.NEXT_PUBLIC_CHATBOT_CALLER_NAME || 'PT Sinergi Muda Arsa',
  callerId: process.env.NEXT_PUBLIC_CHATBOT_CALLER_ID || 'cmtij4gk90003uo1l6ydj6pbf',
  callerToken: '',
};

export const ARSAI_QUICK_ACTIONS: QuickActionItem[] = [
  {
    id: 'about-company',
    label: '🏢 Profil & Visi Misi Arsalynk',
    prompt: 'Bisa jelaskan secara ringkas mengenai profil perusahaan PT Sinergi Muda Arsa (Arsalynk), visi misi, dan keunggulannya?',
  },
  {
    id: 'solutions-services',
    label: '⚙️ Solusi Teknologi & Layanan IT',
    prompt: 'Apa saja pilar solusi teknologi dan layanan IT enterprise yang ditawarkan oleh Arsalynk?',
  },
  {
    id: 'case-studies-portfolio',
    label: '💼 Portofolio & Studi Kasus Proyek',
    prompt: 'Tolong berikan contoh studi kasus dan portofolio proyek teknologi yang pernah dikerjakan oleh Arsalynk.',
  },
  {
    id: 'consultation-contact',
    label: '💬 Hubungi Tim CS (WhatsApp)',
    prompt: 'Saya ingin berkonsultasi langsung dengan Tim Customer Service Arsalynk via WhatsApp.',
  },
];

// Alias for backwards compatibility
export const MARBOT_QUICK_ACTIONS = ARSAI_QUICK_ACTIONS;

const getBaseUrl = (): string => {
  return (process.env.NEXT_PUBLIC_CHATBOT_API_URL || 'https://chatbot-arsalynk.vercel.app').replace(/\/$/, '');
};

const BROWSER_EXTERNAL_USER_KEY = 'arsai_enterprise_external_user_id';
let inMemoryExternalUserId = '';

function createGuestExternalUserId(): string {
  return `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveExternalUserId(provided?: string): string {
  const explicit = String(provided || '').trim();
  if (explicit) return explicit;

  if (typeof window === 'undefined') {
    if (!inMemoryExternalUserId) inMemoryExternalUserId = createGuestExternalUserId();
    return inMemoryExternalUserId;
  }

  try {
    const stored = window.sessionStorage.getItem(BROWSER_EXTERNAL_USER_KEY);
    if (stored) return stored;

    const generated = createGuestExternalUserId();
    window.sessionStorage.setItem(BROWSER_EXTERNAL_USER_KEY, generated);
    return generated;
  } catch {
    if (!inMemoryExternalUserId) inMemoryExternalUserId = createGuestExternalUserId();
    return inMemoryExternalUserId;
  }
}

export interface StreamChatOptions {
  message: string;
  conversationId?: string | null;
  externalUserId?: string;
  /** @deprecated Enterprise chat auth is now server-side. */
  callerToken?: string;
  signal?: AbortSignal;
  onChunk: (delta: string) => void;
  onDone?: (meta: { model?: string; latencyMs?: number; totalTokens?: number; conversationId?: string; sources?: string[] }) => void;
  onError?: (error: Error) => void;
}

/**
 * Stream AI Chat Completions through the same-origin server proxy.
 * Tenant API key + signed Runtime Context V2 never reach the browser.
 */
export async function streamChatCompletion({
  message,
  conversationId,
  externalUserId,
  signal,
  onChunk,
  onDone,
  onError,
}: StreamChatOptions): Promise<void> {
  const resolvedExternalUserId = resolveExternalUserId(externalUserId);

  try {
    const response = await fetch('/api/chatbot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        conversationId: conversationId || undefined,
        externalUserId: resolvedExternalUserId,
      }),
      cache: 'no-store',
      signal,
    });

    if (!response.ok) {
      let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson?.error?.message) {
          errorMessage = errorJson.error.message;
        } else if (typeof errorJson?.error === 'string') {
          errorMessage = errorJson.error;
        } else if (errorJson?.message) {
          errorMessage = errorJson.message;
        }
      } catch {
        // ignore JSON parse error
      }
      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error('Response body is null, SSE stream unavailable');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (!trimmed.startsWith('data:')) continue;

        const rawData = trimmed.replace(/^data:\s*/, '').trim();
        if (!rawData || rawData === '[DONE]') continue;

        let parsed: any = null;
        try {
          parsed = JSON.parse(rawData);
        } catch {
          onChunk(rawData);
          continue;
        }

        if (parsed.event === 'chunk' && parsed.data?.delta) {
          onChunk(parsed.data.delta);
        } else if (parsed.event === 'done') {
          onDone?.(parsed.data || {});
        } else if (parsed.event === 'error') {
          throw new Error(parsed.data?.message || 'Chatbot streaming error');
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return;
    }
    const errorObj = err instanceof Error ? err : new Error(String(err));
    onError?.(errorObj);
    throw errorObj;
  }
}

/**
 * The helpers below are legacy direct-client APIs retained for compatibility.
 * They require an explicit caller token and are not used by the public ArsAI flow.
 */
function requireLegacyCallerToken(token: string): string {
  const normalized = String(token || '').trim();
  if (!normalized) {
    throw new Error('Legacy caller token is required explicitly; public token fallback has been removed.');
  }
  return normalized;
}

export async function getConversations(
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<Conversation[]> {
  const url = `${getBaseUrl()}/api/v1/conversations`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${requireLegacyCallerToken(callerToken)}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load conversations: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data || [];
}

export async function createConversation(
  title?: string,
  externalUserId?: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<Conversation> {
  const url = `${getBaseUrl()}/api/v1/conversations`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${requireLegacyCallerToken(callerToken)}`,
    'Content-Type': 'application/json',
  };
  if (externalUserId) {
    headers['X-External-User-Id'] = externalUserId;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(title ? { title } : {}),
  });

  if (!res.ok) {
    throw new Error(`Failed to create conversation: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data;
}

export async function getConversationDetail(
  conversationId: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<ConversationDetail> {
  const url = `${getBaseUrl()}/api/v1/conversations/${conversationId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${requireLegacyCallerToken(callerToken)}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load conversation details: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data;
}

export async function deleteConversation(
  conversationId: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<boolean> {
  const url = `${getBaseUrl()}/api/v1/conversations/${conversationId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${requireLegacyCallerToken(callerToken)}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to delete conversation: ${res.statusText}`);
  }

  const json = await res.json();
  return Boolean(json.data?.deleted ?? true);
}

export async function getKnowledgeDocuments(
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<KnowledgeDocument[]> {
  const url = `${getBaseUrl()}/api/v1/knowledge`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${requireLegacyCallerToken(callerToken)}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load knowledge documents: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data || [];
}

export async function addTextKnowledge(
  title: string,
  content: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<KnowledgeDocument> {
  const url = `${getBaseUrl()}/api/v1/knowledge/text`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${requireLegacyCallerToken(callerToken)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, content }),
  });

  if (!res.ok) {
    throw new Error(`Failed to ingest text knowledge: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data;
}

export async function uploadKnowledgeDocument(
  file: File,
  title?: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<KnowledgeDocument> {
  const url = `${getBaseUrl()}/api/v1/knowledge`;
  const formData = new FormData();
  formData.append('file', file);
  if (title) formData.append('title', title);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${requireLegacyCallerToken(callerToken)}`,
    },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Failed to upload document: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data;
}

export async function searchKnowledge(
  query: string,
  topK: number = 5,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<SearchKnowledgeResultItem[]> {
  const url = `${getBaseUrl()}/api/v1/knowledge/search`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${requireLegacyCallerToken(callerToken)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, topK }),
  });

  if (!res.ok) {
    throw new Error(`Failed to search knowledge: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data?.results || [];
}
