/**
 * SpiderRunner Mock
 * 模拟 OmniBox 的 spider_runner 模块
 * 
 * spider_runner 是脚本运行框架，不是工具模块
 * 它读取 stdin 的 JSON 请求，调用对应的方法，输出结果到 stdout
 * 
 * 在我们的 ScriptEngine 中，已经独立处理了脚本的执行
 * 所以这里只需要一个空实现，让脚本能够正常 require
 */

// 创建一个兼容的 runner 实例
function createSpiderRunner() {
  // 在我们的环境中，不需要真正实现 stdin/stdout 通信
  // ScriptEngine 直接调用 handlers 的方法
  return function run(handlers) {
    console.log('[spider_runner] Mock runner initialized');
    // 返回 runners 对象，供脚本使用
    return {
      start: () => {},
      stop: () => {}
    };
  };
}

module.exports = { createSpiderRunner };
