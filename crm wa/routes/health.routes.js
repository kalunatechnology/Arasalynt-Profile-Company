'use strict';

const express = require('express');
const router = express.Router();
const healthService = require('../services/health.service');

router.get('/health', async (req, res) => {
  const status = await healthService.getHealthStatus();
  return res.json(status);
});

router.get('/ready', async (req, res) => {
  const status = await healthService.getReadinessStatus();
  const httpCode = status.ready ? 200 : 503;
  return res.status(httpCode).json(status);
});

module.exports = router;
