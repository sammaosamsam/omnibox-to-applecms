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
const { createSpiderRunner } = require('./spiderRunnerMock');

// 给脚本内部用的 fake require
function buildFakeRequire(scriptName) {
  // 每个脚本实例有自己的 SDK 实例
  const sdkInstances = new Map();
  const runnerInstances = new Map();

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
    if (mod === 'spider_runner') {
      // 返回一个新的 SpiderRunner 实例（每个脚本独立）
      if (!runnerInstances.has(scriptName)) {
        runnerInstances.set(scriptName, createSpiderRunner());
      }
      return runnerInstances.get(scriptName);
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
        if (r && r.list) {
          for (const item of r.list) {
            // 如果没有播放源，尝试调用 play 方法获取
            if (!item.vod_play_sources && !item.vod_play_url) {
              try {
                const playResult = await this._call('play', [{ videoId: id, index: 0 }]);
                if (playResult) {
                  // OmniBox play 可能返回的格式：直接是播放源，或 { list: [...] }
                  if (playResult.vod_play_sources) {
                    item.vod_play_sources = playResult.vod_play_sources;
                  } else if (playResult.vod_play_url) {
                    item.vod_play_url = playResult.vod_play_url;
                    item.vod_play_from = playResult.vod_play_from || '默认线路';
                  } else if (playResult.list && playResult.list.length > 0) {
                    // 可能是嵌套的 list
                    const first = playResult.list[0];
                    if (first.vod_play_sources) item.vod_play_sources = first.vod_play_sources;
                    else if (first.vod_play_url) {
                      item.vod_play_url = first.vod_play_url;
                      item.vod_play_from = first.vod_play_from || '默认线路';
                    }
                  }
                }
              } catch (playErr) {
                logger.warn(`[${this.name}] play(${id}) 失败: ${playErr.message}`);
              }
            }
            results.push(item);
          }
        }
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
      // ─── 添加浏览器 API polyfill ───────────────────────────────
      URLSearchParams: class URLSearchParams {
        constructor(init = '') {
          this._params = new Map();
          if (typeof init === 'string') {
            const searchParams = new URLSearchParams(init);
            searchParams.forEach((value, key) => this._params.set(key, value));
          } else if (init && typeof init === 'object') {
            Object.entries(init).forEach(([key, value]) => this._params.set(key, value));
          }
        }
        append(name, value) { this._params.append(name, value); }
        delete(name) { this._params.delete(name); }
        get(name) { return this._params.get(name); }
        getAll(name) { return this._params.getAll(name); }
        has(name) { return this._params.has(name); }
        set(name, value) { this._params.set(name, value); }
        forEach(fn) { this._params.forEach(fn); }
        toString() {
          const entries = [];
          this._params.forEach((value, key) => entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`));
          return entries.join('&');
        }
      },
      // URL polyfill（简化版）
      URL: class URL {
        constructor(url, base) {
          if (base) url = new URL(base) + url;
          const parsed = new URL(url);
          this.href = parsed.href;
          this.origin = parsed.origin;
          this.protocol = parsed.protocol;
          this.host = parsed.host;
          this.hostname = parsed.hostname;
          this.port = parsed.port;
          this.pathname = parsed.pathname;
          this.search = parsed.search;
          this.hash = parsed.hash;
          this.searchParams = new URLSearchParams(parsed.search);
        }
      },
      btoa: (str) => Buffer.from(str).toString('base64'),
      atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
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
