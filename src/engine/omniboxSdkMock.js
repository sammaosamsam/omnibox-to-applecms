/**
 * OmniBox SDK Mock 实现
 * 
 * 模拟 OmniBox SDK 的核心功能，让 Spiders 类型脚本可以在沙盒中独立运行
 * 
 * OmniBox SDK 主要提供：
 * - req: HTTP 请求封装（支持加密/解密）
 * - utils: 工具函数（加密、编码等）
 * - setHeaders/getHeaders: 请求头管理
 * - home/category/detail/search/play: 调用 OmniBox 后端 API
 */
'use strict';

const crypto = require('crypto');
const axios = require('axios');

// ─── OmniBox API 配置 ──────────────────────────────────────────
const OMNIBOX_API_URL = process.env.OMNIBOX_API_URL || 'http://omnibox:7023/api/spider/omnibox';

// ─── 内置请求头 ────────────────────────────────────────────────
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': '',
};

/**
 * 创建 OmniBox SDK Mock
 */
function createOmniBoxSDK() {
  let _headers = { ...DEFAULT_HEADERS };
  let _referer = '';

  // ─── req: HTTP 请求 ────────────────────────────────────────
  async function req(options) {
    const {
      url,
      method = 'GET',
      data = null,
      headers = {},
      encoding = null,    // 'utf8', 'buffer', null
      decryptKey = null,   // 解密 key
      encryptKey = null,   // 加密 key（一般不需要）
    } = options;

    try {
      const mergedHeaders = {
        ..._headers,
        ...headers,
        Referer: _referer || headers.Referer || url,
      };

      const config = {
        url,
        method,
        headers: mergedHeaders,
        timeout: 30000,
        responseType: encoding === 'buffer' ? 'arraybuffer' : 'json',
      };

      if (data) {
        config.data = data;
        if (method === 'POST') {
          config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/x-www-form-urlencoded';
        }
      }

      const response = await axios(config);
      let result = response.data;

      // 如果指定了解密 key，解密响应
      if (decryptKey && result) {
        result = decryptResponse(result, decryptKey);
      }

      // 如果指定了编码格式
      if (encoding === 'buffer' && response.data) {
        result = Buffer.from(response.data);
      } else if (encoding === 'utf8' && Buffer.isBuffer(result)) {
        result = result.toString('utf8');
      }

      return result;

    } catch (error) {
      if (error.response) {
        // 服务器返回了错误状态码
        throw new Error(`请求失败 [${error.response.status}]: ${url}`);
      } else if (error.request) {
        // 请求已发送但没有收到响应
        throw new Error(`请求超时或无响应: ${url}`);
      } else {
        throw new Error(`请求错误: ${error.message}`);
      }
    }
  }

  // ─── 解密响应 ───────────────────────────────────────────────
  function decryptResponse(data, key) {
    if (!data) return data;

    // 如果是字符串，尝试解密
    if (typeof data === 'string') {
      try {
        // 常见加密方式：AES-256-CBC, RC4, 简单 XOR
        const decrypted = tryDecrypt(data, key);
        if (decrypted) {
          try {
            return JSON.parse(decrypted);
          } catch {
            return decrypted;
          }
        }
      } catch {
        // 解密失败，返回原数据
      }
    }

    return data;
  }

  // ─── 尝试多种解密方式 ───────────────────────────────────────
  function tryDecrypt(data, key) {
    // 方式1：AES-256-CBC (常用于 OmniBox)
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-cbc',
        crypto.createHash('sha256').update(key).digest(),
        Buffer.alloc(16, 0) // IV
      );
      let decrypted = decipher.update(data, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch { /* 不是 AES */ }

    // 方式2：RC4
    try {
      return rc4Decrypt(data, key);
    } catch { /* 不是 RC4 */ }

    // 方式3：简单的 Base64 + XOR
    try {
      const decoded = Buffer.from(data, 'base64').toString('utf8');
      return xorDecrypt(decoded, key);
    } catch { /* 不是 XOR */ }

    return null;
  }

  // ─── RC4 解密 ──────────────────────────────────────────────
  function rc4Decrypt(data, key) {
    const cipher = crypto.createCipheriv(
      'rc4',
      Buffer.from(key.slice(0, 16).padEnd(16, '\0')),
      null
    );
    let decrypted = cipher.update(data, 'base64', 'utf8');
    decrypted += cipher.final('utf8');
    return decrypted;
  }

  // ─── XOR 解密 ──────────────────────────────────────────────
  function xorDecrypt(data, key) {
    let result = '';
    for (let i = 0; i < data.length; i++) {
      result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  }

  // ─── utils: 工具函数 ────────────────────────────────────────
  const utils = {
    // 字符串 MD5
    md5(str) {
      return crypto.createHash('md5').update(str).digest('hex');
    },

    // SHA1
    sha1(str) {
      return crypto.createHash('sha1').update(str).digest('hex');
    },

    // SHA256
    sha256(str) {
      return crypto.createHash('sha256').update(str).digest('hex');
    },

    // AES 加密
    aesEncrypt(data, key) {
      const cipher = crypto.createCipheriv(
        'aes-256-cbc',
        crypto.createHash('sha256').update(key).digest(),
        Buffer.alloc(16, 0)
      );
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
      encrypted += cipher.final('base64');
      return encrypted;
    },

    // AES 解密
    aesDecrypt(data, key) {
      const decipher = crypto.createDecipheriv(
        'aes-256-cbc',
        crypto.createHash('sha256').update(key).digest(),
        Buffer.alloc(16, 0)
      );
      let decrypted = decipher.update(data, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    },

    // Base64 编码
    base64Encode(str) {
      return Buffer.from(str).toString('base64');
    },

    // Base64 解码
    base64Decode(str) {
      return Buffer.from(str, 'base64').toString('utf8');
    },

    // URL 编码
    urlEncode(str) {
      return encodeURIComponent(str);
    },

    // URL 解码
    urlDecode(str) {
      return decodeURIComponent(str);
    },

    // 获取时间戳（秒）
    timestamp() {
      return Math.floor(Date.now() / 1000);
    },

    // 获取时间戳（毫秒）
    timestampMs() {
      return Date.now();
    },

    // 延迟
    async delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    // 随机字符串
    randomString(length = 16) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    },

    // JSON 解析（安全）
    jsonParse(str, defaultValue = null) {
      try {
        return JSON.parse(str);
      } catch {
        return defaultValue;
      }
    },
  };

  // ─── 设置请求头 ───────────────────────────────────────────────
  function setHeaders(headers) {
    _headers = { ..._headers, ...headers };
    if (headers.Referer) {
      _referer = headers.Referer;
    }
  }

  // ─── 获取当前请求头 ─────────────────────────────────────────
  function getHeaders() {
    return { ..._headers };
  }

  // ─── 设置 Referer ───────────────────────────────────────────
  function setReferer(url) {
    _referer = url;
  }

  // ─── 请求上下文（由 spider_runner 设置）─────────────────────
  let _requestContext = null;

  function setRequestContext(ctx) {
    _requestContext = ctx || null;
  }

  function getRequestContext() {
    return _requestContext;
  }

  // ─── 调用 OmniBox 后端 API ──────────────────────────────────
  async function callSpiderAPI(method, params = {}, context = {}) {
    const requestBody = {
      method,
      params,
      context: {
        ..._requestContext,
        ...context,
      },
    };

    try {
      const response = await axios.post(OMNIBOX_API_URL, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          ..._headers,
        },
        timeout: 30000,
      });

      if (response.data && response.data.success !== false) {
        return response.data.data || response.data;
      } else {
        throw new Error(response.data?.error || 'API 调用失败');
      }
    } catch (error) {
      if (error.response) {
        throw new Error(`OmniBox API 错误 [${error.response.status}]: ${error.message}`);
      } else if (error.request) {
        throw new Error(`无法连接 OmniBox API (${OMNIBOX_API_URL}): ${error.message}`);
      } else {
        throw new Error(`API 调用错误: ${error.message}`);
      }
    }
  }

  // ─── 返回 SDK 对象 ───────────────────────────────────────────
  return {
    req,
    utils,
    setHeaders,
    getHeaders,
    setReferer,
    setRequestContext,
    getRequestContext,
    // 兼容别名
    crypto: {
      encrypt: utils.aesEncrypt,
      decrypt: utils.aesDecrypt,
      md5: utils.md5,
      sha1: utils.sha1,
      sha256: utils.sha256,
    },
    // OmniBox API 方法
    home: (params) => callSpiderAPI('home', params),
    category: (params) => callSpiderAPI('category', params),
    detail: (params) => callSpiderAPI('detail', params),
    search: (params) => callSpiderAPI('search', params),
    play: (params) => callSpiderAPI('play', params),
  };
}

module.exports = createOmniBoxSDK;
