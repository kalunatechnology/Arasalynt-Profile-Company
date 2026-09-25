import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { WA_CONFIG } from '@/lib/whatsapp/config';
import { recordLiveChatMessage } from '@/lib/waha.service';
import { persistDurableLiveChatMessage } from '@/lib/whatsapp/live-chat-store';

export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET =
  process.env.GATEWAY_WEBHOOK_SECRET || WA_CONFIG.secret;

type MetaSignatureCheck = {
  valid: boolean;
  reason: 'ok' | 'app_secret_not_configured' | 'signature_missing_or_malformed' | 'signature_mismatch';
  source?: string;
};

function extractWebsiteSessionId(text: string): string {
  const match = String(text || '').match(
    /\[#(guest_[a-zA-Z0-9_-]+)\]|#(guest_[a-zA-Z0-9_-]+)/i
  );
  return match?.[1] || match?.[2] || '';
}

function verifyMetaSignature(rawBody: string, signature: string | null): MetaSignatureCheck {
  const candidates = WA_CONFIG.cloudAppSecrets;

  if (candidates.length === 0) {
    return { valid: false, reason: 'app_secret_not_configured' };
  }

  if (!signature || !signature.toLowerCase().startsWith('sha256=')) {
    return { valid: false, reason: 'signature_missing_or_malformed' };
  }

  const receivedHex = signature.slice('sha256='.length).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(receivedHex)) {
    return { valid: false, reason: 'signature_missing_or_malformed' };
  }

  const receivedBuffer = Buffer.from(receivedHex, 'hex');

  for (const candidate of candidates) {
    const expectedHex = createHmac('sha256', candidate.value)
      .update(rawBody, 'utf8')
      .digest('hex');
    const expectedBuffer = Buffer.from(expectedHex, 'hex');

    if (
      receivedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      return { valid: true, reason: 'ok', source: candidate.source };
    }
  }

  return { valid: false, reason: 'signature_mismatch' };
}

async function storeInboundReply(
  sessionId: string,
  body: string,
  msgId: string,
  requestId: string,
) {
  try {
    const saved = await persistDurableLiveChatMessage({
      sessionId,
      sender: 'human_cs',
      content: body,
      whatsappMessageId: msgId || undefined,
    });

    console.info(
      `[Webhook][reqId:${requestId}] Durable CS reply stored session=${sessionId} msgId=${msgId || '-'} messageId=${saved.id}`
    );
    return saved;
  } catch (durableError: unknown) {
    const durableMessage = durableError instanceof Error ? durableError.message : String(durableError);
    console.error(
      `[Webhook][reqId:${requestId}] Durable store failed; using local emergency fallback: ${durableMessage}`
    );

    // Emergency fallback only. Vercel /tmp is not the canonical production store,
    // but keeping it prevents a transient Chatbot API outage from dropping a reply.
    return recordLiveChatMessage(
      sessionId,
      'human_cs',
      body,
      msgId || undefined,
    );
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

        const sessionId = extractWebsiteSessionId(body);
        if (!sessionId) {
          console.warn(
            `[MetaWebhook][reqId:${requestId}] Pesan ${msgId || '-'} diabaikan: tidak ada tag guest session.`
          );
          ignored++;
          continue;
        }

        try {
          await storeInboundReply(sessionId, body, msgId, requestId);
          stored++;
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
    const saved = await storeInboundReply(sessionId, body, msgId, requestId);

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
      const signatureCheck = verifyMetaSignature(rawBody, signature);

      if (!signatureCheck.valid) {
        console.warn(
          `[MetaWebhook][reqId:${requestId}] Signature rejected reason=${signatureCheck.reason} configuredSecretCount=${WA_CONFIG.cloudAppSecrets.length}`
        );
        return NextResponse.json(
          {
            error: 'Invalid Meta signature',
            code: signatureCheck.reason,
            hint:
              signatureCheck.reason === 'signature_mismatch'
                ? 'WHATSAPP_CLOUD_APP_SECRET must be the Meta App Secret for the app that owns this webhook subscription.'
                : undefined,
          },
          { status: 401 }
        );
      }

      console.info(
        `[MetaWebhook][reqId:${requestId}] Valid Meta webhook received secretSource=${signatureCheck.source || 'configured'}.`
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
