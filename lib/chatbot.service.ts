import {
  ChatMessage,
  Conversation,
  ConversationDetail,
  KnowledgeDocument,
  SearchKnowledgeResultItem,
  QuickActionItem,
} from '@/types/chatbot';

export const DEFAULT_CALLER_CONFIG = {
  callerName: process.env.NEXT_PUBLIC_CHATBOT_CALLER_NAME || 'PT Sinergi Muda Arsa',
  callerId: process.env.NEXT_PUBLIC_CHATBOT_CALLER_ID || 'cmtij4gk90003uo1l6ydj6pbf',
  callerToken: process.env.NEXT_PUBLIC_CHATBOT_CALLER_TOKEN || 'cb_live_0080c942f880b04ad7f3fba231432c1de43aefb24b201bd7',
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

export interface StreamChatOptions {
  message: string;
  conversationId?: string | null;
  externalUserId?: string;
  callerToken?: string;
  signal?: AbortSignal;
  onChunk: (delta: string) => void;
  onDone?: (meta: { model?: string; latencyMs?: number; totalTokens?: number; conversationId?: string; sources?: string[] }) => void;
  onError?: (error: Error) => void;
}

/**
 * Stream AI Chat Completions using Server-Sent Events (SSE)
 */
export async function streamChatCompletion({
  message,
  conversationId,
  externalUserId = DEFAULT_CALLER_CONFIG.callerId,
  callerToken = DEFAULT_CALLER_CONFIG.callerToken,
  signal,
  onChunk,
  onDone,
  onError,
}: StreamChatOptions): Promise<void> {
  const url = `${getBaseUrl()}/api/v1/chat/completions`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${callerToken}`,
    };

    if (externalUserId) {
      headers['X-External-User-Id'] = externalUserId;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message,
        conversationId: conversationId || undefined,
        callerId: DEFAULT_CALLER_CONFIG.callerId,
      }),
      signal,
    });

    if (!response.ok) {
      let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson?.error?.message) {
          errorMessage = errorJson.error.message;
        } else if (errorJson?.message) {
          errorMessage = errorJson.message;
        }
      } catch {
        // ignore json parse error
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
        if (!trimmed || trimmed.startsWith(':')) continue; // skip keep-alive comments

        if (trimmed.startsWith('data:')) {
          const rawData = trimmed.replace(/^data:\s*/, '').trim();

          if (rawData === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(rawData);
            if (parsed.event === 'chunk' && parsed.data?.delta) {
              onChunk(parsed.data.delta);
            } else if (parsed.event === 'done') {
              onDone?.(parsed.data || {});
            } else if (parsed.event === 'error') {
              throw new Error(parsed.data?.message || 'Chatbot streaming error');
            }
          } catch {
            // If raw text is not JSON, check if it's direct delta
            if (rawData && rawData !== '[DONE]') {
              onChunk(rawData);
            }
          }
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      // User aborted stream
      return;
    }
    const errorObj = err instanceof Error ? err : new Error(String(err));
    onError?.(errorObj);
    throw errorObj;
  }
}

/**
 * Fetch all conversations for current caller/user
 */
export async function getConversations(
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<Conversation[]> {
  const url = `${getBaseUrl()}/api/v1/conversations`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load conversations: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data || [];
}

/**
 * Create a new conversation record
 */
export async function createConversation(
  title?: string,
  externalUserId?: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<Conversation> {
  const url = `${getBaseUrl()}/api/v1/conversations`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${callerToken}`,
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

/**
 * Get detailed conversation history with messages
 */
export async function getConversationDetail(
  conversationId: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<ConversationDetail> {
  const url = `${getBaseUrl()}/api/v1/conversations/${conversationId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load conversation details: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data;
}

/**
 * Delete a conversation
 */
export async function deleteConversation(
  conversationId: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<boolean> {
  const url = `${getBaseUrl()}/api/v1/conversations/${conversationId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to delete conversation: ${res.statusText}`);
  }

  const json = await res.json();
  return Boolean(json.data?.deleted ?? true);
}

/**
 * List all knowledge base documents
 */
export async function getKnowledgeDocuments(
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<KnowledgeDocument[]> {
  const url = `${getBaseUrl()}/api/v1/knowledge`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load knowledge documents: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data || [];
}

/**
 * Ingest direct text into knowledge base
 */
export async function addTextKnowledge(
  title: string,
  content: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<KnowledgeDocument> {
  const url = `${getBaseUrl()}/api/v1/knowledge/text`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
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

/**
 * Upload document file to knowledge base
 */
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
      'Authorization': `Bearer ${callerToken}`,
    },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Failed to upload document: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data;
}

/**
 * Search / RAG simulator
 */
export async function searchKnowledge(
  query: string,
  topK: number = 5,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<SearchKnowledgeResultItem[]> {
  const url = `${getBaseUrl()}/api/v1/knowledge/search`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
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
