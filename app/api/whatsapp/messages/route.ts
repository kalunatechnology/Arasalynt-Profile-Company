import { NextRequest, NextResponse } from 'next/server';
import { getLiveChatMessages } from '@/lib/waha.service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/whatsapp/messages?sessionId=guest_xxx
 *
 * Legacy-compatible website message reader. This intentionally reads the
 * website live-chat store instead of requiring /api/messages on the gateway.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId parameter is required', data: [] },
      { status: 400 }
    );
  }

  try {
    const data = getLiveChatMessages(sessionId);
    return NextResponse.json(
      { success: true, data },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Messages] Failed to read legacy live-chat history: ${msg}`);
    return NextResponse.json(
      { success: true, data: [], _warning: msg },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  }
}
