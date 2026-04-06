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

// spider_runner.run() 接收脚本导出对象，然后在 stdin 有数据时调用对应方法
// 我们的实现不需要这个行为，因为 ScriptEngine 已经处理了方法调用
function run(handlers) {
  // 在我们的环境中，不需要真正实现 stdin/stdout 通信
  // ScriptEngine 直接调用 handlers 的方法
  console.log('[spider_runner] Mock runner initialized');
}

module.exports = { run };
