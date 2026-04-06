/**
 * SpiderRunner Mock
 * 模拟 OmniBox 的 spider_runner 模块
 */

class SpiderRunner {
  constructor() {
    this.results = [];
  }

  // 运行爬虫任务
  async run(url, options = {}) {
    const result = {
      url,
      options,
      timestamp: Date.now(),
      status: 'completed',
      data: null
    };

    try {
      // 尝试使用 axios 获取数据
      const axios = require('axios');
      const response = await axios.get(url, {
        timeout: options.timeout || 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...options.headers
        }
      });
      result.data = response.data;
    } catch (e) {
      result.status = 'error';
      result.error = e.message;
    }

    this.results.push(result);
    return result;
  }

  // 批量运行
  async runBatch(urls, options = {}) {
    const results = [];
    for (const url of urls) {
      results.push(await this.run(url, options));
    }
    return results;
  }

  // 获取历史结果
  getResults() {
    return this.results;
  }
}

// 导出单例或类
module.exports = {
  SpiderRunner,
  createRunner: () => new SpiderRunner()
};
