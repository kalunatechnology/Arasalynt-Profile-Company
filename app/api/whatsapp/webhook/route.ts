import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { WA_CONFIG } from '@/lib/whatsapp/config';
import { recordLiveChatMessage } from '@/lib/waha.service';

export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET =
  process.env.GATEWAY_WEBHOOK_SECRET || WA_CONFIG.secret;

function extractWebsiteSessionId(text: string): string {
  const match = String(text || '').match(
    /\[#(guest_[a-zA-Z0-9_-]+)\]|#(guest_[a-zA-Z0-9_-]+)/i
  );
  return match?.[1] || match?.[2] || '';
}

function verifyMetaSignature(rawBody: string, signature: string | null): boolean {
  const appSecret = WA_CONFIG.cloudAppSecret;

  // During initial webhook setup APP_SECRET may still be unset. Once it is set,
  // every Meta POST must carry a valid x-hub-signature-256.
  if (!appSecret) return true;
  if (!signature || !signature.startsWith('sha256=')) return false;

  const received = signature.slice('sha256='.length).trim();
  const expected = createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  try {
    const receivedBuffer = Buffer.from(received, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return (
      receivedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(receivedBuffer, expectedBuffer)
    );
  } catch {
    return false;
  }
}

/**
 * Meta webhook verification handshake.
 * Callback URL:
 *   https://www.arsalynk.com/api/whatsapp/webhook
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (
    mode === 'subscribe' &&
    WA_CONFIG.cloudVerifyToken &&
    token === WA_CONFIG.cloudVerifyToken &&
    challenge
  ) {
    console.info('[MetaWebhook] Verification challenge accepted.');
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.warn('[MetaWebhook] Verification challenge rejected.');
  return NextResponse.json(
    { error: 'Meta webhook verification failed' },
    { status: 403 }
  );
}

async function handleMetaWebhook(
  payload: any,
  requestId: string
): Promise<NextResponse> {
  let received = 0;
  let stored = 0;
  let ignored = 0;

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      // WhatsApp inbound messages and delivery statuses are delivered through
      // the "messages" webhook field. Other subscribed fields must not become
      // website live-chat rows.
      if (change?.field && change.field !== 'messages') {
        ignored++;
        continue;
      }

      const value = change?.value;
      if (!value) continue;

      const webhookPhoneNumberId = String(
        value?.metadata?.phone_number_id || ''
      ).trim();

      if (
        webhookPhoneNumberId &&
        WA_CONFIG.cloudPhoneNumberId &&
        webhookPhoneNumberId !== WA_CONFIG.cloudPhoneNumberId
      ) {
        console.warn(
          `[MetaWebhook][reqId:${requestId}] Ignored event for unexpected phone_number_id=${webhookPhoneNumberId}.`
        );
        ignored++;
        continue;
      }

      // Delivery/read/sent callbacks are acknowledged but do not become chat rows.
      if (Array.isArray(value.statuses) && !Array.isArray(value.messages)) {
        ignored += value.statuses.length;
        continue;
      }

      for (const message of value.messages || []) {
        received++;

        const msgId = String(message?.id || '').trim();
        const body = String(message?.text?.body || '').trim();

        if (message?.type !== 'text' || !body) {
          console.info(
            `[MetaWebhook][reqId:${requestId}] Ignored non-text/empty message msgId=${msgId || '-'}.`
          );
          ignored++;
          continue;
        }

        // Same routing contract as crm wa: CS keeps the [#guest_xxx] tag on
        // WhatsApp, while recordLiveChatMessage strips it from the website UI.
        const sessionId = extractWebsiteSessionId(body);
        if (!sessionId) {
          console.warn(
            `[MetaWebhook][reqId:${requestId}] Pesan ${msgId || '-'} diabaikan: tidak ada tag guest session.`
          );
          ignored++;
          continue;
        }

        try {
          const saved = recordLiveChatMessage(
            sessionId,
            'human_cs',
            body,
            msgId || undefined,
          );
          stored++;

          console.info(
            `[MetaWebhook][reqId:${requestId}] Stored CS reply session=${sessionId} msgId=${msgId || '-'} localMessageId=${saved.id}`
          );
        } catch (storageError: unknown) {
          const storageMsg =
            storageError instanceof Error
              ? storageError.message
              : String(storageError);

          if (storageMsg.includes('UNIQUE constraint failed')) {
            console.info(
              `[MetaWebhook][reqId:${requestId}] Duplicate Meta message ignored msgId=${msgId || '-'}.`
            );
            ignored++;
            continue;
          }
          throw storageError;
        }
      }
    }
  }

  console.info(
    `[MetaWebhook][reqId:${requestId}] Completed received=${received} stored=${stored} ignored=${ignored}`
  );

  return NextResponse.json({
    status: 'ok',
    provider: 'meta_cloud',
    received,
    stored,
    ignored,
  });
}

async function handleLegacyGatewayWebhook(
  payload: any,
  requestId: string
): Promise<NextResponse> {
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
      provider: 'crm_wa',
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
}

/**
 * POST /api/whatsapp/webhook
 *
 * Provider is exclusive:
 * - BAYPASS=false -> accept Meta WhatsApp Cloud API only
 * - BAYPASS=true  -> accept crm wa gateway only
 */
export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).slice(2, 8);

  try {
    const rawBody = await req.text();
    if (!rawBody) {
      return NextResponse.json({ status: 'ignored', reason: 'Empty body' });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ status: 'ignored', reason: 'Invalid JSON' });
    }

    const isMetaWebhook = payload?.object === 'whatsapp_business_account';

    if (!WA_CONFIG.baypass) {
      if (!isMetaWebhook) {
        return NextResponse.json({
          status: 'ignored',
          provider: 'meta_cloud',
          reason: 'crm wa webhook disabled while BAYPASS=false',
        });
      }

      const signature = req.headers.get('x-hub-signature-256');
      if (!verifyMetaSignature(rawBody, signature)) {
        console.warn('[MetaWebhook] Invalid x-hub-signature-256. reqId=' + requestId);
        return NextResponse.json({ error: 'Invalid Meta signature' }, { status: 401 });
      }

      console.info(
        `[MetaWebhook][reqId:${requestId}] Valid Meta webhook received.`
      );
      return handleMetaWebhook(payload, requestId);
    }

    if (isMetaWebhook) {
      return NextResponse.json({
        status: 'ignored',
        provider: 'crm_wa',
        reason: 'Meta webhook disabled while BAYPASS=true',
      });
    }

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

    return handleLegacyGatewayWebhook(payload, requestId);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Webhook][reqId:' + requestId + '] Error: ' + msg);
    return NextResponse.json({ error: 'Webhook error: ' + msg }, { status: 500 });
  }
}
