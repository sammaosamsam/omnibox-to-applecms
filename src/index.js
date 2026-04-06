/**
 * OmniBox → AppleCMS V10 转换代理服务
 * 入口文件
 */
'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { logger } = require('./logger');
const sourceManager = require('./monitor/sourceManager');
const appleCmsRoutes = require('./routes/applecms');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3033;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// 静态文件（Web 管理界面）
app.use(express.static(path.join(__dirname, '../public')));

// ============================================================
// AppleCMS V10 标准接口路由
// 访问方式：http://host:3033/api/vod?ac=list&t=1
//           http://host:3000/api/vod?ac=detail&ids=xxx
// 每个 Source 有独立路径：/source/:sourceId/api/vod
// ============================================================
app.use('/api/vod', appleCmsRoutes);           // 默认聚合所有源
app.use('/source/:sourceId/api/vod', appleCmsRoutes);  // 单个源

// ============================================================
// 管理接口
// ============================================================
app.use('/admin', adminRoutes);

// 根路径重定向到管理界面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 启动服务
app.listen(PORT, async () => {
  logger.info(`🚀 OmniBox → AppleCMS 代理服务启动，端口: ${PORT}`);
  logger.info(`📺 AppleCMS 接口: http://localhost:${PORT}/api/vod`);
  logger.info(`🖥️  管理界面: http://localhost:${PORT}`);

  // 初始化源管理器（加载已保存的源并开始监控）
  await sourceManager.init();
});

module.exports = app;
