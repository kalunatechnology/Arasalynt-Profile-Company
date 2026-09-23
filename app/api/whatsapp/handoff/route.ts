import { NextRequest, NextResponse } from 'next/server';
import { requestHumanHandoff } from '@/lib/whatsapp/handoff.client';
import { recordLiveChatMessage } from '@/lib/waha.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/handoff
 *
 * Compatibility layer for the stable legacy WhatsApp gateway.
 * The gateway keeps using /api/sendText; this route preserves the website API
 * expected by MarBot while delegating to the legacy-safe send flow.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, message, name, requestId } = body;

    if (!sessionId || !message) {
      return NextResponse.json(
        { error: 'sessionId and message are required' },
        { status: 400 }
      );
    }

    const result = await requestHumanHandoff({
      sessionId,
      message,
      name,
      requestId,
    });

    if (result.accepted) {
      try {
        recordLiveChatMessage(sessionId, 'user', String(message));
      } catch (storageError) {
        console.warn('[Handoff] Message sent but local history write failed:', storageError);
      }
    }

    return NextResponse.json(result, { status: result.accepted ? 202 : 502 });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Handoff error: ${errorMsg}` },
      { status: 500 }
    );
  }
}
