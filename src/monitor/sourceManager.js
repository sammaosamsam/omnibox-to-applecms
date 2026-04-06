/**
 * Source 管理器
 * 负责：加载 / 保存 / 监控多个 OmniBox 脚本源
 * 每个 Source 包含：id, name, url(GitHub raw / http url), enabled, cronExpr, lastFetch, status, script(缓存内容)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
const { logger } = require('../logger');
const ScriptEngine = require('../engine/scriptEngine');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '../../data/sources.json');

class SourceManager {
  constructor() {
    this.sources = new Map();   // id -> sourceConfig
    this.engines = new Map();   // id -> ScriptEngine instance
    this.cronJobs = new Map();  // id -> cron job
  }

  // ─── 初始化 ────────────────────────────────────────────────
  async init() {
    this._ensureDataFile();
    const saved = this._load();
    for (const source of saved) {
      this.sources.set(source.id, source);
      if (source.enabled) {
        await this._startMonitor(source);
      }
    }
    logger.info(`📦 已加载 ${this.sources.size} 个 OmniBox 源`);
  }

  // ─── 增删改查 ─────────────────────────────────────────────
  listSources() {
    return Array.from(this.sources.values()).map(s => ({
      ...s,
      script: undefined,  // 不在列表中暴露完整脚本
      hasScript: !!s.script,
    }));
  }

  getSource(id) {
    return this.sources.get(id) || null;
  }

  async addSource(config) {
    const id = config.id || this._genId();
    const source = {
      id,
      name: config.name || id,
      url: config.url,                         // GitHub raw URL 或普通 URL
      enabled: config.enabled !== false,
      cronExpr: config.cronExpr || '0 */2 * * *',  // 默认每2小时检查
      script: null,
      lastFetch: null,
      lastError: null,
      status: 'pending',  // pending | ok | error
      createdAt: new Date().toISOString(),
    };

    this.sources.set(id, source);
    this._save();

    if (source.enabled) {
      await this._startMonitor(source);
    }

    return source;
  }

  async updateSource(id, patch) {
    const source = this.sources.get(id);
    if (!source) throw new Error(`Source ${id} 不存在`);

    const updated = { ...source, ...patch };
    this.sources.set(id, updated);
    this._save();

    // 重启监控
    this._stopMonitor(id);
    if (updated.enabled) {
      await this._startMonitor(updated);
    }

    return updated;
  }

  deleteSource(id) {
    this._stopMonitor(id);
    this.sources.delete(id);
    this.engines.delete(id);
    this._save();
  }

  // ─── 手动刷新 ─────────────────────────────────────────────
  async refreshSource(id) {
    const source = this.sources.get(id);
    if (!source) throw new Error(`Source ${id} 不存在`);
    await this._fetchAndCompile(source);
  }

  // ─── 获取 ScriptEngine（供路由层调用）─────────────────────
  getEngine(id) {
    return this.engines.get(id) || null;
  }

  getAllEngines() {
    return Array.from(this.engines.entries())
      .filter(([id]) => {
        const s = this.sources.get(id);
        return s && s.enabled && s.status === 'ok';
      })
      .map(([id, engine]) => ({ id, engine, source: this.sources.get(id) }));
  }

  // ─── 内部：启动监控 ───────────────────────────────────────
  async _startMonitor(source) {
    // 立即抓取一次
    await this._fetchAndCompile(source);

    // 定时任务
    if (cron.validate(source.cronExpr)) {
      const job = cron.schedule(source.cronExpr, async () => {
        logger.info(`⏰ 定时刷新 [${source.name}]`);
        await this._fetchAndCompile(this.sources.get(source.id));
      });
      this.cronJobs.set(source.id, job);
    } else {
      logger.warn(`⚠️  Source [${source.name}] cron 表达式无效: ${source.cronExpr}`);
    }
  }

  _stopMonitor(id) {
    const job = this.cronJobs.get(id);
    if (job) {
      job.stop();
      this.cronJobs.delete(id);
    }
  }

  // ─── 内部：拉取脚本并编译 ─────────────────────────────────
  async _fetchAndCompile(source) {
    try {
      logger.info(`🔄 拉取脚本 [${source.name}]: ${source.url}`);

      const rawUrl = this._toRawUrl(source.url);
      const resp = await axios.get(rawUrl, {
        timeout: 15000,
        headers: { 'User-Agent': 'OmniBox-Spider-Proxy/1.0' },
      });

      const scriptCode = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);

      // 编译脚本（在沙盒 VM 中执行，提取 class exports）
      const engine = new ScriptEngine(source.id, source.name, scriptCode);
      await engine.init();

      this.engines.set(source.id, engine);

      // 更新状态
      const updated = {
        ...this.sources.get(source.id),
        script: scriptCode,
        lastFetch: new Date().toISOString(),
        status: 'ok',
        lastError: null,
      };
      this.sources.set(source.id, updated);
      this._save();

      logger.info(`✅ 脚本编译成功 [${source.name}]，分类数: ${engine.getClasses().length}`);
    } catch (err) {
      logger.error(`❌ 脚本拉取/编译失败 [${source.name}]: ${err.message}`);

      const updated = {
        ...this.sources.get(source.id),
        lastError: err.message,
        status: 'error',
        lastFetch: new Date().toISOString(),
      };
      this.sources.set(source.id, updated);
      this._save();
    }
  }

  // ─── 辅助：GitHub blob → raw URL ─────────────────────────
  _toRawUrl(url) {
    // https://github.com/{user}/{repo}/blob/{branch}/{path}
    // → https://raw.githubusercontent.com/{user}/{repo}/{branch}/{path}
    const githubBlobRe = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/;
    const m = url.match(githubBlobRe);
    if (m) {
      return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
    }
    return url;
  }

  _genId() {
    return 'src_' + Math.random().toString(36).slice(2, 10);
  }

  _ensureDataFile() {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
    }
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
      return [];
    }
  }

  _save() {
    const data = Array.from(this.sources.values()).map(s => ({
      ...s,
      script: s.script ? s.script.slice(0, 200) + '...[cached]' : null,  // 不持久化完整脚本
    }));
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  }
}

module.exports = new SourceManager();
