'use client';

import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { ChatMessage, QuickActionItem } from '@/types/chatbot';
import {
  MARBOT_QUICK_ACTIONS,
  streamChatCompletion,
} from '@/lib/chatbot.service';
import { MarBotIcon } from './MarBotTrigger';
import { MarkdownRenderer } from './MarkdownRenderer';
import styles from './MarBotDrawer.module.css';

interface MarBotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

type ChatMode = 'ai' | 'human_cs';

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function StopIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function WhatsAppIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.888 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function formatCurrentTime(): string {
  const date = new Date();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}.${minutes}`;
}

// Escalation keywords & phrases to transfer chat from AI to WhatsApp Customer Service.
// Only triggers when the user explicitly requests to speak with CS, customer service, a real person, or human.
const ESCALATION_PHRASES = [
  'customer service',
  'cust service',
  'berbicara dengan cs',
  'bicara dengan cs',
  'berbicra dengan cs', // common typo
  'bicra dengan cs',
  'berbicara sama cs',
  'bicara sama cs',
  'ngomong sama cs',
  'ngomong dengan cs',
  'ngobrol sama cs',
  'ngobrol dengan cs',
  'hubungi cs',
  'kontak cs',
  'sambungkan ke cs',
  'sambungkan dengan cs',
  'chat dengan cs',
  'chat sama cs',
  'chat cs',
  'bicara cs',
  'berbicara cs',
  'berbicara dengan orang',
  'bicara dengan orang',
  'berbicra dengan orang',
  'bicara sama orang',
  'berbicara sama orang',
  'ngomong sama orang',
  'ngomong dengan orang',
  'ngobrol sama orang',
  'ngobrol dengan orang',
  'chat dengan orang',
  'chat sama orang',
  'orang asli',
  'orang beneran',
  'staf orang',
  'berbicara dengan manusia',
  'bicara dengan manusia',
  'berbicra dengan manusia',
  'bicara sama manusia',
  'berbicara sama manusia',
  'ngomong sama manusia',
  'ngomong dengan manusia',
  'ngobrol sama manusia',
  'ngobrol dengan manusia',
  'operator manusia',
  'cs manusia',
  'agen manusia',
  'agent manusia',
  'human agent',
  'talk to human',
  'speak with human',
  'chat with human',
  'real human',
];

const ESCALATION_REGEXES = [
  // "berbicara / bicara / berbicra / ngomong / ngobrol / hubungi / kontak / sambungkan / chat" + optional "dengan/sama/ke" + "cs"
  /\b(?:berbicara|bicara|berbicra|bicra|ngomong|ngobrol|hubungi|kontak|sambungkan|chat)\s+(?:dengan\s+|sama\s+|ke\s+)?cs\b/i,
  // "customer service" / "cust service"
  /\b(?:customer\s+service|cust(?:\.|\s+)?service)\b/i,
  // "berbicara / bicara / berbicra / ngomong / ngobrol / chat" + optional "dengan/sama/ke" + "orang"
  /\b(?:berbicara|bicara|berbicra|bicra|ngomong|ngobrol|chat)\s+(?:dengan\s+|sama\s+|ke\s+)?orang\b/i,
  // "berbicara / bicara / berbicra / ngomong / ngobrol / chat / butuh / mau / sambungkan" + optional "dengan/sama/ke" + "manusia"
  /\b(?:berbicara|bicara|berbicra|bicra|ngomong|ngobrol|chat|butuh|mau|sambungkan)\s+(?:dengan\s+|sama\s+|ke\s+)?manusia\b/i,
  // "operator manusia" / "cs manusia" / "staf manusia" / "agen manusia"
  /\b(?:operator|cs|staf|staff|agen|agent)\s+manusia\b/i,
  // Standalone single word intent: user sends just "cs", "manusia", or "human"
  /^(?:cs|manusia|human)$/i,
  // English: talk/speak/chat with human/person/agent
  /\b(?:talk\s+to|speak\s+with|chat\s+with)\s+(?:a\s+)?(?:human|person|agent)\b/i,
];

function isEscalationKeyword(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!lower) return false;

  // 1. Direct phrase matching
  if (ESCALATION_PHRASES.some((phrase) => lower.includes(phrase))) {
    return true;
  }

  // 2. Regex pattern matching
  return ESCALATION_REGEXES.some((regex) => regex.test(lower));
}

function createNewSessionId(): string {
  return `guest_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
}

const INITIAL_MESSAGE: ChatMessage = {
  id: 'initial-greeting',
  role: 'assistant',
  content:
    'Halo! Saya ArsAI, asisten cerdas Arsalynk (PT Sinergi Muda Arsa). Saya dapat membantu Anda mengetahui profil perusahaan, solusi teknologi enterprise, atau menghubungkan Anda langsung dengan Tim CS. Ada yang bisa saya bantu?',
  timestamp: formatCurrentTime(),
};

// Memoized Message Item
const MessageBubble = memo(function MessageBubble({
  msg,
}: {
  msg: ChatMessage;
}) {
  const isAssistant = msg.role === 'assistant';
  const isHumanCS = msg.role === 'human_cs';

  return (
    <div
      key={`group-${msg.id}`}
      className={`${styles.messageGroup} ${
        msg.role === 'user'
          ? styles.userMessageGroup
          : styles.assistantMessageGroup
      }`}
    >
      <div className={styles.messageMeta}>
        {isAssistant && (
          <div className={styles.miniAvatar}>
            <MarBotIcon className={styles.miniAvatarIcon} />
          </div>
        )}
        {isHumanCS && (
          <div className={styles.csMiniAvatar}>
            <WhatsAppIcon className={styles.miniAvatarIcon} />
          </div>
        )}
        <span className={isHumanCS ? styles.csSenderName : styles.senderName}>
          {isHumanCS ? 'Customer Service' : isAssistant ? 'ArsAI' : 'Anda'}
        </span>
        {isHumanCS && <span className={styles.csVerified}>WhatsApp</span>}
        <span className={styles.messageTimestamp}>· {msg.timestamp}</span>
      </div>

      <div
        className={`${styles.bubble} ${
          isHumanCS
            ? styles.csBubble
            : isAssistant
              ? styles.assistantBubble
              : styles.userBubble
        }`}
      >
        <MarkdownRenderer content={msg.content} />

        {msg.sources && msg.sources.length > 0 && (
          <div className={styles.sourcesContainer}>
            <span className={styles.sourcesLabel}>Sumber:</span>
            {msg.sources.map((src, i) => (
              <span key={`src-${i}`} className={styles.sourceBadge}>
                {src}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default function MarBotDrawer({ isOpen, onClose }: MarBotDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('ai');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [isMounted, setIsMounted] = useState(false);

  const sessionStartTimeRef = useRef<number>(Date.now());
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Buffer state for high-performance streaming updates
  const streamBufferRef = useRef<string>('');
  const rafIdRef = useRef<number | null>(null);

  // Initialize unique session ID for this conversation
  useEffect(() => {
    setIsMounted(true);
    const newId = createNewSessionId();
    setSessionId(newId);
    sessionStartTimeRef.current = Date.now();
  }, []);

  // Smooth scroll handler
  const scrollChatToBottom = useCallback(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (isOpen && isMounted) {
      scrollChatToBottom();
    }
  }, [isOpen, isMounted, messages.length, scrollChatToBottom]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && isMounted) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMounted]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 2-Way WhatsApp Polling: Active ONLY when chatMode === 'human_cs'
  useEffect(() => {
    if (!isOpen || !sessionId || chatMode !== 'human_cs') return;

    let isPolling = true;

    const pollLiveMessages = async () => {
      try {
        const res = await fetch(`/api/whatsapp/messages?sessionId=${sessionId}`);
        if (!res.ok || !isPolling) return;
        const data = await res.json();
        if (data?.data && Array.isArray(data.data)) {
          // Only take messages received after the start of this active CS session
          const csRecords = data.data.filter(
            (m: { sender: string; createdAt: string }) =>
              m.sender === 'human_cs' &&
              new Date(m.createdAt).getTime() >= sessionStartTimeRef.current - 2000
          );

          setMessages((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newCsMessages: ChatMessage[] = [];

            for (const csMsg of csRecords) {
              const msgId = `cs-${csMsg.id}`;
              if (!existingIds.has(msgId)) {
                newCsMessages.push({
                  id: msgId,
                  role: 'human_cs',
                  content: csMsg.message || csMsg.content,
                  timestamp: formatCurrentTime(),
                });
              }
            }

            if (newCsMessages.length > 0) {
              return [...prev, ...newCsMessages];
            }
            return prev;
          });
        }
      } catch {
        // non-blocking
      }
    };

    pollLiveMessages();
    const interval = setInterval(pollLiveMessages, 3000);

    return () => {
      isPolling = false;
      clearInterval(interval);
    };
  }, [isOpen, sessionId, chatMode]);

  const handleStopGeneration = () => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.isStreaming ? { ...msg, isStreaming: false } : msg
        )
      );
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = (textToSend ?? inputValue).trim();
    if (!messageContent || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: formatCurrentTime(),
    };

    // Auto-Switching Check: If user asks for CS / pricing / quotation in AI mode
    if (chatMode === 'ai' && isEscalationKeyword(messageContent)) {
      setChatMode('human_cs');
      setInputValue('');
      sessionStartTimeRef.current = Date.now();

      const autoHandoverMessage: ChatMessage = {
        id: `bot-handover-${Date.now()}`,
        role: 'assistant',
        content: `Pertanyaan Anda telah diteruskan ke **Customer Service Arsalynk (Live WhatsApp)**. Anda kini terhubung langsung dengan representatif kami dan dapat melanjutkan obrolan di sini.`,
        timestamp: formatCurrentTime(),
      };

      setMessages((prev) => [...prev, userMessage, autoHandoverMessage]);

      try {
        await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            message: messageContent,
          }),
        });
      } catch (err) {
        console.warn('[WhatsApp Auto-Forward Error]', err);
      }
      return;
    }

    // When already in Human CS mode: Send message directly to WhatsApp CS
    if (chatMode === 'human_cs') {
      setMessages((prev) => [...prev, userMessage]);
      setInputValue('');

      try {
        await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            message: messageContent,
          }),
        });
      } catch (err) {
        console.warn('[WhatsApp CS Send Error]', err);
      }
      return;
    }

    // Default: Regular AI Stream Completion
    const assistantPlaceholderId = `bot-${Date.now()}`;
    const assistantPlaceholder: ChatMessage = {
      id: assistantPlaceholderId,
      role: 'assistant',
      content: '',
      timestamp: formatCurrentTime(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    if (!textToSend) {
      setInputValue('');
    }
    setIsLoading(true);

    streamBufferRef.current = '';
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const scheduleBufferFlush = () => {
      if (rafIdRef.current) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const currentText = streamBufferRef.current;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantPlaceholderId
              ? { ...msg, content: currentText }
              : msg
          )
        );
        scrollChatToBottom();
      });
    };

    try {
      await streamChatCompletion({
        message: messageContent,
        conversationId: conversationId || undefined,
        signal: abortController.signal,
        onChunk: (delta: string) => {
          streamBufferRef.current += delta;
          scheduleBufferFlush();
        },
        onDone: (meta) => {
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          const finalText = streamBufferRef.current;
          if (meta.conversationId) {
            setConversationId(meta.conversationId);
          }
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantPlaceholderId
                ? {
                    ...msg,
                    content: finalText || msg.content,
                    isStreaming: false,
                    sources: meta.sources || msg.sources,
                  }
                : msg
            )
          );
          setIsLoading(false);
          abortControllerRef.current = null;
          scrollChatToBottom();
        },
        onError: (err) => {
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          console.error('[ArsAI Stream Error]', err);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantPlaceholderId
                ? {
                    ...msg,
                    content:
                      streamBufferRef.current ||
                      msg.content ||
                      'Mohon maaf, saat ini terjadi kendala koneksi ke server AI. Anda dapat mencoba sesaat lagi atau langsung menghubungi tim kami via WhatsApp.',
                    isStreaming: false,
                    isError: !msg.content && !streamBufferRef.current,
                  }
                : msg
            )
          );
          setIsLoading(false);
          abortControllerRef.current = null;
          scrollChatToBottom();
        },
      });
    } catch {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleQuickActionClick = (item: QuickActionItem) => {
    handleSendMessage(item.prompt);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSwitchToAI = () => {
    setChatMode('ai');
    // Generate fresh session ID for future clean sessions
    const freshSessionId = createNewSessionId();
    setSessionId(freshSessionId);
    sessionStartTimeRef.current = Date.now();

    const returnMsg: ChatMessage = {
      id: `system-return-${Date.now()}`,
      role: 'assistant',
      content: 'Mode percakapan telah dikembalikan ke **ArsAI**.',
      timestamp: formatCurrentTime(),
    };
    setMessages((prev) => [...prev, returnMsg]);
  };

  if (!isMounted || !isOpen) return null;

  return (
    <>
      <div
        key="arsai-overlay"
        className={styles.overlay}
        onClick={onClose}
        aria-hidden="true"
      />
      <section
        key="arsai-drawer-section"
        className={styles.drawer}
        role="dialog"
        aria-label="ArsAI Chat Assistant"
        aria-modal="true"
      >
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.botInfo}>
            <div
              key={`header-icon-${chatMode}`}
              className={
                chatMode === 'human_cs'
                  ? styles.headerAvatarCS
                  : styles.headerAvatar
              }
            >
              {chatMode === 'human_cs' ? (
                <WhatsAppIcon className={styles.headerAvatarIcon} />
              ) : (
                <MarBotIcon className={styles.headerAvatarIcon} />
              )}
            </div>
            <div className={styles.botText}>
              <span className={styles.botName}>
                {chatMode === 'human_cs' ? 'Customer Service' : 'ArsAI'}
              </span>
              <span className={styles.botStatus}>
                <span className={styles.statusDot} />
                {chatMode === 'human_cs'
                  ? 'Live WhatsApp'
                  : 'Online & CS Ready'}
              </span>
            </div>
          </div>

          <div className={styles.headerActions}>
            {chatMode === 'human_cs' && (
              <button
                type="button"
                className={styles.switchModeBtn}
                onClick={handleSwitchToAI}
                title="Kembali ke mode ArsAI"
              >
                ← Mode ArsAI
              </button>
            )}
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Tutup jendela chat"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        {/* Chat Body */}
        <div ref={chatBodyRef} className={styles.chatBody}>
          {messages.map((msg) => {
            if (msg.role === 'assistant' && !msg.content && isLoading) {
              return null;
            }

            return <MessageBubble key={msg.id} msg={msg} />;
          })}

          {isLoading && !messages[messages.length - 1]?.content && (
            <div
              key="typing-indicator"
              className={`${styles.messageGroup} ${styles.assistantMessageGroup}`}
            >
              <div className={styles.messageMeta}>
                <div className={styles.miniAvatar}>
                  <MarBotIcon className={styles.miniAvatarIcon} />
                </div>
                <span className={styles.senderName}>ArsAI</span>
                <span className={styles.messageTimestamp}>· sedang mengetik</span>
              </div>
              <div className={styles.typingContainer}>
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {messages.length <= 1 && chatMode === 'ai' && (
            <div key="quick-actions-section" className={styles.quickActionsSection}>
              <span className={styles.quickActionsTitle}>Quick Actions</span>
              {MARBOT_QUICK_ACTIONS.map((action) => (
                <button
                  key={`qa-${action.id}`}
                  type="button"
                  className={styles.quickActionButton}
                  onClick={() => handleQuickActionClick(action)}
                >
                  <span>{action.label}</span>
                  <span className={styles.quickActionArrow}>➔</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className={styles.footer}>
          <div className={styles.inputContainer}>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={
                chatMode === 'human_cs'
                  ? 'Ketik pesan untuk Customer Service...'
                  : 'Ask ArsAI anything..'
              }
              className={styles.inputField}
              disabled={isLoading}
              aria-label="Ketik pesan"
            />
            {isLoading ? (
              <button
                type="button"
                onClick={handleStopGeneration}
                className={styles.sendButton}
                aria-label="Hentikan jawaban"
                title="Hentikan"
              >
                <StopIcon className={styles.sendIcon} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim()}
                className={styles.sendButton}
                aria-label="Kirim pesan"
              >
                <SendArrowIcon className={styles.sendIcon} />
              </button>
            )}
          </div>
          <p className={styles.disclaimer}>
            {chatMode === 'human_cs'
              ? 'Terkoneksi langsung ke WhatsApp CS (+62 822-5285-6710).'
              : 'ArsAI didukung AI & Live WhatsApp CS.'}
          </p>
        </footer>
      </section>
    </>
  );
}

export const ArsAIDrawer = MarBotDrawer;
