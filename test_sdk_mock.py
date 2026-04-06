"""
测试 OmniBox SDK Mock 是否正常工作
"""
import subprocess
import json

# 简单的 Node.js 测试脚本
test_code = '''
const createOmniBoxSDK = require('./src/engine/omniboxSdkMock');

const sdk = createOmniBoxSDK();

console.log('=== OmniBox SDK Mock 测试 ===');
console.log('1. SDK 方法:', Object.keys(sdk).join(', '));
console.log('2. utils.md5("test"):', sdk.utils.md5('test'));
console.log('3. utils.base64Encode("hello"):', sdk.utils.base64Encode('hello'));
console.log('4. utils.timestamp():', sdk.utils.timestamp());
console.log('5. utils.randomString(16):', sdk.utils.randomString(16));

// 测试加密解密
const data = { name: 'test', value: 123 };
const key = 'secret-key';
const encrypted = sdk.utils.aesEncrypt(data, key);
console.log('6. 加密测试:', encrypted.slice(0, 30) + '...');

const decrypted = sdk.utils.aesDecrypt(encrypted, key);
console.log('7. 解密测试:', JSON.stringify(decrypted));

// 测试请求头
sdk.setHeaders({ 'X-Custom': 'value' });
console.log('8. 请求头测试:', JSON.stringify(sdk.getHeaders()).slice(0, 50) + '...');

console.log('=== 测试完成 ===');
'''

with open('test_node.js', 'w', encoding='utf-8') as f:
    f.write(test_code)

print("测试代码已写入 test_node.js")
