import { NextRequest, NextResponse } from 'next/server';
import { requestHumanHandoff } from '@/lib/whatsapp/handoff.client';
import { recordLiveChatMessage } from '@/lib/waha.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/handoff
 *
 * Provider-aware compatibility layer used by MarBot.
 * - BAYPASS=true  -> crm wa / Baileys
 * - BAYPASS=false -> Meta WhatsApp Cloud API direct text
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

      console.info(
        `[Handoff] accepted provider=${result.provider || '-'} requestId=${result.requestId} session=${sessionId}`
      );

      return NextResponse.json(result, { status: 202 });
    }

    // The 502 here means the selected WhatsApp provider rejected/failed the
    // outbound request; it does NOT mean the Vercel function crashed.
    console.error(
      `[Handoff] upstream failure provider=${result.provider || '-'} requestId=${result.requestId} status=${result.status} error=${result.error || 'unknown'}`
    );

    return NextResponse.json(
      {
        ...result,
        upstreamFailure: true,
      },
      { status: 502 }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Handoff] route exception:', errorMsg);
    return NextResponse.json(
      { error: `Handoff error: ${errorMsg}` },
      { status: 500 }
    );
  }
}
