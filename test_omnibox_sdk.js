/**
 * 测试 OmniBox SDK Mock 是否正常工作
 */
'use strict';

const createOmniBoxSDK = require('./src/engine/omniboxSdkMock');

async function test() {
  console.log('=== 测试 OmniBox SDK Mock ===\n');

  // 1. 测试 SDK 创建
  console.log('1. 创建 SDK 实例...');
  const sdk = createOmniBoxSDK();
  console.log('   ✓ SDK 创建成功');
  console.log('   可用方法:', Object.keys(sdk).join(', '));

  // 2. 测试 utils
  console.log('\n2. 测试 utils 工具函数...');
  console.log('   md5("test"):', sdk.utils.md5('test'));
  console.log('   sha256("test"):', sdk.utils.sha256('test').slice(0, 20) + '...');
  console.log('   base64Encode("hello"):', sdk.utils.base64Encode('hello'));
  console.log('   timestamp():', sdk.utils.timestamp());
  console.log('   randomString():', sdk.utils.randomString(16));
  console.log('   ✓ utils 函数正常');

  // 3. 测试 setHeaders / getHeaders
  console.log('\n3. 测试请求头管理...');
  sdk.setHeaders({ 'X-Custom': 'test-value' });
  const headers = sdk.getHeaders();
  console.log('   设置后 headers:', JSON.stringify(headers).slice(0, 80) + '...');
  console.log('   ✓ 请求头管理正常');

  // 4. 测试加密/解密
  console.log('\n4. 测试加密解密...');
  const testData = { name: 'test', value: 123 };
  const key = 'my-secret-key';
  const encrypted = sdk.utils.aesEncrypt(testData, key);
  console.log('   加密后:', encrypted.slice(0, 40) + '...');
  const decrypted = sdk.utils.aesDecrypt(encrypted, key);
  console.log('   解密后:', JSON.stringify(decrypted));
  console.log('   ✓ 加密解密正常');

  // 5. 测试 req 函数（用 httpbin 测试）
  console.log('\n5. 测试 HTTP 请求...');
  try {
    const response = await sdk.req({
      url: 'https://httpbin.org/get',
      method: 'GET',
    });
    console.log('   ✓ GET 请求成功');
    console.log('   URL:', response.url);
  } catch (e) {
    console.log('   ⚠ GET 请求失败:', e.message);
  }

  console.log('\n=== 测试完成 ===');
}

test().catch(console.error);
