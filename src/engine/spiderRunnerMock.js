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
  // 返回一个 runner 对象，脚本会调用 .run(handlers)
  const runner = {
    run: function(handlers) {
      console.log('[spider_runner] Mock runner initialized with handlers:', Object.keys(handlers));
      return this;
    },
    start: function() {
      console.log('[spider_runner] Mock runner started');
    },
    stop: function() {
      console.log('[spider_runner] Mock runner stopped');
    }
  };
  return runner;
}

module.exports = { createSpiderRunner };
