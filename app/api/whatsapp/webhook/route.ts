import { NextRequest, NextResponse } from 'next/server';
import { WA_CONFIG } from '@/lib/whatsapp/config';
import { recordLiveChatMessage } from '@/lib/waha.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/webhook
 *
 * Legacy-compatible webhook. The stable gateway forwards WhatsApp replies here.
 * Replies carrying a website sessionId are stored back into the website live-chat
 * history so MarBot can poll them from /api/whatsapp/messages.
 */
const WEBHOOK_SECRET =
  process.env.GATEWAY_WEBHOOK_SECRET || WA_CONFIG.secret;

export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).slice(2, 8);

  try {
    if (WEBHOOK_SECRET) {
      const incoming =
        req.headers.get('x-gateway-secret') ||
        req.headers.get('x-api-key') ||
        req.headers.get('authorization')?.replace('Bearer ', '');

      if (incoming !== WEBHOOK_SECRET) {
        console.warn('[Webhook] Unauthorized. reqId=' + requestId);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const payload = await req.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ status: 'ignored', reason: 'Invalid JSON' });
    }

    const event = payload?.event || 'message';
    if (event !== 'message') {
      return NextResponse.json({ status: 'acknowledged', event });
    }

    const msgPayload = payload?.payload || payload;
    const sessionId = String(msgPayload?.sessionId || '').trim();
    const msgId = String(msgPayload?.id || '').trim();
    const body = String(msgPayload?.body || '').trim();

    if (!sessionId) {
      return NextResponse.json({ status: 'ignored', reason: 'No website sessionId' });
    }

    if (!body) {
      return NextResponse.json({ status: 'ignored', reason: 'Empty message body' });
    }

    try {
      const saved = recordLiveChatMessage(
        sessionId,
        'human_cs',
        body,
        msgId || undefined,
      );

      console.log(
        `[Webhook][reqId:${requestId}] Stored CS reply. session=${sessionId} msgId=${msgId || '-'}`
      );

      return NextResponse.json({
        status: 'ok',
        sessionId,
        msgId,
        messageId: saved.id,
      });
    } catch (storageError: unknown) {
      const storageMsg =
        storageError instanceof Error ? storageError.message : String(storageError);

      if (storageMsg.includes('UNIQUE constraint failed')) {
        return NextResponse.json({
          status: 'duplicate',
          sessionId,
          msgId,
        });
      }

      throw storageError;
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Webhook][reqId:' + requestId + '] Error: ' + msg);
    return NextResponse.json({ error: 'Webhook error: ' + msg }, { status: 500 });
  }
}
