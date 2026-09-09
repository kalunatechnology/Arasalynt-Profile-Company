import { NextRequest, NextResponse } from 'next/server';
import { recordLiveChatMessage } from '@/lib/waha.service';
import { getDb } from '@/lib/db/db';

export const dynamic = 'force-dynamic';

/**
 * Webhook endpoint for WhatsApp Gateway (Baileys / WAHA)
 * Triggered when Customer Service replies from their WhatsApp device.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    const senderFrom = payload?.payload?.from || payload?.from || '';

    // Ignore LID (Linked ID) duplicates from WhatsApp Multi-Device
    if (typeof senderFrom === 'string' && senderFrom.endsWith('@lid')) {
      return NextResponse.json({ status: 'ignored', reason: 'LID duplicate ignored' });
    }

    const messageBody =
      payload?.payload?.body ||
      payload?.body ||
      payload?.message?.text ||
      payload?.text ||
      '';

    if (!messageBody || typeof messageBody !== 'string') {
      return NextResponse.json({ status: 'ignored', reason: 'Empty body' });
    }

    const db = getDb();

    // Pattern 1: Explicit session tag like [#guest_xyz123] Balasan pesan
    const tagMatch = messageBody.match(/^\[#([a-zA-Z0-9_-]+)\]\s*([\s\S]*)/);

    let targetSessionId = '';
    let replyText = messageBody.trim();

    if (tagMatch) {
      const parsedTag = tagMatch[1];
      const parsedText = tagMatch[2].trim();

      // Check if this specific session exists in SQLite
      const existingSession = db
        .prepare('SELECT id FROM live_chat_sessions WHERE id = ?')
        .get(parsedTag) as { id: string } | undefined;

      if (existingSession) {
        targetSessionId = existingSession.id;
        replyText = parsedText;
      } else {
        // Tag was mistyped or was dummy/example, strip tag and fallback to latest active session
        replyText = parsedText || messageBody.trim();
      }
    }

    // Fallback: If no targetSessionId matched, pick the newest active session
    if (!targetSessionId) {
      const latestSession = db
        .prepare(
          `SELECT id FROM live_chat_sessions
           ORDER BY updated_at DESC
           LIMIT 1`
        )
        .get() as { id: string } | undefined;

      if (latestSession) {
        targetSessionId = latestSession.id;
      }
    }

    if (!targetSessionId || !replyText) {
      return NextResponse.json({
        status: 'ignored',
        reason: 'No active session found or empty reply',
      });
    }

    // Deduplication check: Ignore identical message sent within last 5 seconds
    const existingRecent = db
      .prepare(
        `SELECT id FROM live_chat_messages
         WHERE session_id = ? AND sender = 'human_cs' AND content = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(targetSessionId, replyText) as { id: string } | undefined;

    // Check if the last message was identical to prevent instant double post
    const lastMessage = db
      .prepare(
        `SELECT content, created_at FROM live_chat_messages
         WHERE session_id = ? AND sender = 'human_cs'
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(targetSessionId) as { content: string; created_at: string } | undefined;

    if (lastMessage && lastMessage.content === replyText) {
      const timeDiff = Date.now() - new Date(lastMessage.created_at).getTime();
      if (timeDiff < 5000) {
        return NextResponse.json({ status: 'ignored', reason: 'Duplicate message within 5s' });
      }
    }

    // Record human_cs reply in SQLite
    const saved = recordLiveChatMessage(targetSessionId, 'human_cs', replyText);
    console.log(`[WhatsApp Webhook] Recorded CS reply for session ${targetSessionId}: "${replyText}"`);

    return NextResponse.json({
      success: true,
      data: saved,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[WhatsApp Webhook] Error processing webhook:', errorMsg);
    return NextResponse.json(
      { error: `Webhook error: ${errorMsg}` },
      { status: 500 }
    );
  }
}
