'use strict';

const db = require('../config/database');
const { generateRandomShortCode } = require('../services/shortcode.service');

async function findById(id) {
  return await db.getOne('SELECT * FROM wa_conversations WHERE id = ?', [id]);
}

async function findByShortCode(shortCode) {
  if (!shortCode) return null;
  return await db.getOne('SELECT * FROM wa_conversations WHERE UPPER(short_code) = UPPER(?)', [shortCode]);
}

async function findBySessionId(sessionId) {
  if (!sessionId) return null;
  return await db.getOne('SELECT * FROM wa_conversations WHERE session_id = ? ORDER BY created_at DESC LIMIT 1', [sessionId]);
}

async function createConversation({ sessionId, guestName, initialRoute = 'GENERAL', priority = 'NORMAL' }) {
  const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Generate unique short code
  let shortCode = generateRandomShortCode();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await findByShortCode(shortCode);
    if (!existing) break;
    shortCode = generateRandomShortCode();
    attempts++;
  }

  await db.query(
    `INSERT INTO wa_conversations (id, short_code, session_id, guest_name, status, logical_route, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'WAITING_HUMAN', ?, ?, ?, ?)`,
    [id, shortCode, sessionId || null, guestName || null, initialRoute, priority, now, now]
  );

  return { id, shortCode, sessionId, guestName, status: 'WAITING_HUMAN', logicalRoute: initialRoute, priority, createdAt: now };
}

async function updateConversationRoute(id, { logicalRoute, priority, aiSummary }) {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await db.query(
    `UPDATE wa_conversations SET logical_route = ?, priority = ?, ai_summary = ?, updated_at = ? WHERE id = ?`,
    [logicalRoute, priority || 'NORMAL', aiSummary || null, now, id]
  );
}

async function updateStatus(id, status) {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await db.query(
    `UPDATE wa_conversations SET status = ?, updated_at = ? WHERE id = ?`,
    [status, now, id]
  );
}

module.exports = {
  findById,
  findByShortCode,
  findBySessionId,
  createConversation,
  updateConversationRoute,
  updateStatus,
};
