import { NextRequest, NextResponse } from 'next/server';
import { getLiveChatMessages } from '@/lib/waha.service';
import { fetchDurableLiveChatMessages } from '@/lib/whatsapp/live-chat-store';

export const dynamic = 'force-dynamic';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

/**
 * GET /api/whatsapp/messages?sessionId=guest_xxx
 *
 * Production reads from the shared PostgreSQL-backed Chatbot store. Local
 * SQLite remains an emergency fallback only, so webhook and polling do not
 * depend on landing on the same Vercel serverless instance.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = String(searchParams.get('sessionId') || '').trim();

  if (!/^guest_[a-zA-Z0-9_-]+$/.test(sessionId)) {
    return NextResponse.json(
      { error: 'valid sessionId parameter is required', data: [] },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const data = await fetchDurableLiveChatMessages(sessionId);
    return NextResponse.json(
      { success: true, data, store: 'durable' },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (durableError: unknown) {
    const durableMessage = durableError instanceof Error
      ? durableError.message
      : String(durableError);

    console.error(
      `[Messages] Durable live-chat read failed for ${sessionId}; using local emergency fallback: ${durableMessage}`
    );

    try {
      const data = getLiveChatMessages(sessionId);
      return NextResponse.json(
        {
          success: true,
          data,
          store: 'local_fallback',
          _warning: durableMessage,
        },
        { headers: NO_CACHE_HEADERS }
      );
    } catch (localError: unknown) {
      const localMessage = localError instanceof Error
        ? localError.message
        : String(localError);

      console.error(`[Messages] Local fallback also failed: ${localMessage}`);
      return NextResponse.json(
        {
          success: false,
          data: [],
          error: 'Live chat storage is temporarily unavailable',
        },
        { status: 503, headers: NO_CACHE_HEADERS }
      );
    }
  }
}
