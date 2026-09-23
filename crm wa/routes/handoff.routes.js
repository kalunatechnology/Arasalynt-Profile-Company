'use strict';

const express = require('express');
const router = express.Router();
const { processHandoffRequest } = require('../services/handoff.service');

router.post('/api/whatsapp/handoff', async (req, res) => {
  const requestId = req.headers['x-request-id'] || req.body.requestId;
  const { sessionId, message, name } = req.body;

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Pesan (message) wajib diisi.' });
  }

  try {
    const result = await processHandoffRequest({
      requestId,
      sessionId,
      message: String(message).trim(),
      name,
    });

    // 202 Accepted: The request has been accepted for processing
    return res.status(202).json(result);
  } catch (err) {
    console.error('[HandoffRoute] Error processing handoff:', err.message);
    return res.status(500).json({
      accepted: false,
      error: `Gagal memproses handoff: ${err.message}`,
    });
  }
});

module.exports = router;
