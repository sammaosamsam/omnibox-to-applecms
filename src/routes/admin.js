/**
 * 管理 API 路由
 * 提供 REST API 供 Web 管理界面调用
 */
'use strict';

const express = require('express');
const router = express.Router();
const sourceManager = require('../monitor/sourceManager');
const { logger } = require('../logger');

// 可选：简单的 API Key 认证
const API_KEY = process.env.ADMIN_API_KEY;
function authMiddleware(req, res, next) {
  if (!API_KEY) return next();  // 未配置则跳过
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (key !== API_KEY) return res.status(401).json({ error: '未授权' });
  next();
}

router.use(authMiddleware);

// ── GET /admin/sources → 获取所有源 ──────────────────────────
router.get('/sources', (req, res) => {
  res.json({ code: 0, data: sourceManager.listSources() });
});

// ── GET /admin/sources/:id → 获取单个源 ──────────────────────
router.get('/sources/:id', (req, res) => {
  const source = sourceManager.getSource(req.params.id);
  if (!source) return res.status(404).json({ code: 1, msg: '未找到' });
  res.json({ code: 0, data: { ...source, script: undefined } });
});

// ── POST /admin/sources → 新增源 ─────────────────────────────
router.post('/sources', async (req, res) => {
  try {
    const { name, url, enabled, cronExpr } = req.body;
    if (!url) return res.status(400).json({ code: 1, msg: 'url 不能为空' });

    const source = await sourceManager.addSource({ name, url, enabled, cronExpr });
    res.json({ code: 0, msg: '添加成功', data: source });
  } catch (err) {
    logger.error(`添加源失败: ${err.message}`);
    res.status(500).json({ code: 1, msg: err.message });
  }
});

// ── PUT /admin/sources/:id → 更新源 ──────────────────────────
router.put('/sources/:id', async (req, res) => {
  try {
    const source = await sourceManager.updateSource(req.params.id, req.body);
    res.json({ code: 0, msg: '更新成功', data: source });
  } catch (err) {
    res.status(500).json({ code: 1, msg: err.message });
  }
});

// ── DELETE /admin/sources/:id → 删除源 ───────────────────────
router.delete('/sources/:id', (req, res) => {
  sourceManager.deleteSource(req.params.id);
  res.json({ code: 0, msg: '删除成功' });
});

// ── POST /admin/sources/:id/refresh → 手动刷新脚本 ───────────
router.post('/sources/:id/refresh', async (req, res) => {
  try {
    await sourceManager.refreshSource(req.params.id);
    res.json({ code: 0, msg: '刷新成功' });
  } catch (err) {
    res.status(500).json({ code: 1, msg: err.message });
  }
});

// ── GET /admin/status → 服务状态 ─────────────────────────────
router.get('/status', (req, res) => {
  const sources = sourceManager.listSources();
  const total = sources.length;
  const ok = sources.filter(s => s.status === 'ok').length;
  const error = sources.filter(s => s.status === 'error').length;
  const pending = sources.filter(s => s.status === 'pending').length;

  res.json({
    code: 0,
    data: {
      total,
      ok,
      error,
      pending,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
  });
});

module.exports = router;
