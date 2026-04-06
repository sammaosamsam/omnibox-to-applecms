/**
 * ScriptEngine
 * 在受限的 Node.js VM 沙盒中执行 OmniBox 脚本
 * 提取出 home / category / detail / search / play 等方法
 *
 * OmniBox 脚本通常是这样的结构：
 *   - 导出一个 class，包含 home/category/detail/play/search 方法
 *   - 或者直接 module.exports = { home, category, detail, play, search }
 */
'use strict';

const vm = require('vm');
const axios = require('axios');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { logger } = require('../logger');
const createOmniBoxSDK = require('./omniboxSdkMock');

// 给脚本内部用的 fake require
function buildFakeRequire(scriptName) {
  // 每个脚本实例有自己的 SDK 实例
  const sdkInstances = new Map();

  return function fakeRequire(mod) {
    if (mod === 'axios') return axios;
    if (mod === 'crypto') return crypto;
    if (mod === 'https') return https;
    if (mod === 'http') return http;
    if (mod === 'node-fetch') return require('node-fetch');
    if (mod === 'omnibox_sdk') {
      // 返回一个新的 SDK 实例（每个脚本独立）
      if (!sdkInstances.has(scriptName)) {
        sdkInstances.set(scriptName, createOmniBoxSDK());
      }
      return sdkInstances.get(scriptName);
    }
    throw new Error(`模块 ${mod} 不在白名单内`);
  };
}

class ScriptEngine {
  constructor(id, name, code) {
    this.id = id;
    this.name = name;
    this.code = code;
    this._api = null;      // 脚本导出的 api 对象
    this._classes = [];    // 分类列表
  }

  async init() {
    this._api = await this._runScript(this.code);
    // 预加载分类（部分脚本在 home() 中才暴露分类）
    try {
      const homeResult = await this._call('home', []);
      if (homeResult && homeResult.class) {
        this._classes = homeResult.class;
      }
    } catch (e) {
      logger.warn(`[${this.name}] 预加载分类失败: ${e.message}`);
    }
  }

  getClasses() {
    return this._classes;
  }

  // ─── 调用脚本方法 ─────────────────────────────────────────
  async callHome() {
    return this._call('home', []);
  }

  async callCategory({ typeId, page, filters }) {
    return this._call('category', [{ categoryId: String(typeId), page: page || 1, filters: filters || {} }]);
  }

  async callDetail({ ids }) {
    // OmniBox detail 接收单个 videoId 或数组
    const idList = String(ids).split(',').map(s => s.trim()).filter(Boolean);
    const results = [];
    for (const id of idList) {
      try {
        const r = await this._call('detail', [{ videoId: id }]);
        if (r && r.list) results.push(...r.list);
      } catch (e) {
        logger.warn(`[${this.name}] detail(${id}) 失败: ${e.message}`);
      }
    }
    return { list: results };
  }

  async callSearch({ keyword, page }) {
    return this._call('search', [{ keyword, page: page || 1 }]);
  }

  // ─── 内部：执行脚本 ───────────────────────────────────────
  async _runScript(code) {
    const sandbox = {
      require: buildFakeRequire(this.name),
      module: { exports: {} },
      exports: {},
      console: {
        log: (...args) => logger.debug(`[VM:${this.name}]`, ...args),
        warn: (...args) => logger.warn(`[VM:${this.name}]`, ...args),
        error: (...args) => logger.error(`[VM:${this.name}]`, ...args),
      },
      process: { env: {} },
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      Buffer,
      global: {},
    };

    try {
      const script = new vm.Script(code, { filename: `${this.name}.js` });
      const ctx = vm.createContext(sandbox);
      script.runInContext(ctx, { timeout: 10000 });
    } catch (e) {
      throw new Error(`脚本执行失败: ${e.message}`);
    }

    const exp = sandbox.module.exports || sandbox.exports;

    // 支持 class 导出 或 直接对象导出
    let api;
    if (typeof exp === 'function') {
      // class 导出，实例化
      try { api = new exp(); } catch { api = exp; }
    } else if (exp && typeof exp === 'object' && Object.keys(exp).length > 0) {
      api = exp;
    } else {
      // 有些脚本用全局变量导出
      throw new Error('无法从脚本中提取 API 对象，请检查脚本格式');
    }

    return api;
  }

  async _call(method, args) {
    if (!this._api) throw new Error('脚本未初始化');
    const fn = this._api[method];
    if (typeof fn !== 'function') {
      throw new Error(`脚本不支持方法: ${method}`);
    }
    return fn.apply(this._api, args);
  }
}

module.exports = ScriptEngine;
