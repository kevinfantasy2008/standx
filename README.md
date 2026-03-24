# StandX Perps API - JWT 认证指南

## 概述

StandX Perps API 使用基于钱包的 JWT 认证，支持 BSC (EVM) 和 Solana 链。

## 认证流程

```
1. 生成临时 ed25519 密钥对 → 获得 requestId
2. 调用 prepare-signin → 获得 signedData (JWT)
3. 用钱包私钥签名消息 → 获得 signature
4. 调用 login → 获得 access token
5. 使用 token 访问 API
```

## 安装依赖

```bash
npm install ethers
```

## 脚本说明

### 1. 测试脚本 - test-jwt-token.js

自动创建临时钱包并获取 JWT token。

```bash
node test-jwt-token.js <chain> [expiresSeconds]

# 示例
node test-jwt-token.js bsc         # BSC 链，默认 7 天过期
node test-jwt-token.js bsc 3600     # BSC 链，1 小时过期
node test-jwt-token.js solana       # Solana 链
```

输出：
- 临时钱包地址和私钥
- JWT access token
- 结果保存到 `test-wallet-result.json`

### 2. 生产脚本 - get-jwt-token.js

使用已有的钱包私钥获取 JWT token。

```bash
node get-jwt-token.js <wallet_private_key> <chain> [expiresSeconds]

# 示例
node get-jwt-token.js 0xyour_private_key bsc 604800
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/offchain/prepare-signin?chain=<chain>` | POST | 获取签名数据 |
| `/v1/offchain/login?chain=<chain>` | POST | 获取 access token |
| `/v1/offchain/certs` | GET | 获取 StandX 公钥 |

## 使用 Token

在 API 请求头中包含 token：

```bash
curl -H "Authorization: Bearer <token>" \
     https://api.standx.com/v1/perps/positions
```

## 安全注意事项

- **妥善保管私钥**：私钥一旦泄露，攻击者可获取你的 access token
- **设置过期时间**：根据需要设置合理的 token 过期时间（默认 7 天）
- **测试环境**：使用测试脚本时，确保在安全环境中运行
- **环境变量**：生产环境中使用环境变量存储私钥

## 示例：完整调用

```javascript
const { ethers } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');

const CHAIN = 'bsc';
const PRIVATE_KEY = '0xyour_private_key';

// 1. 生成临时密钥对
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const requestId = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

// 2. 获取钱包地址
const wallet = new ethers.Wallet(PRIVATE_KEY);
const address = wallet.address;

// 3. 调用 prepare-signin
const signedData = await fetch(`https://api.standx.com/v1/offchain/prepare-signin?chain=${CHAIN}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ requestId, address }),
}).then(r => r.json()).then(d => d.signedData);

// 4. 解析 JWT 获取消息
const payload = JSON.parse(Buffer.from(signedData.split('.')[1], 'base64url').toString());
const message = payload.message;

// 5. 签名消息
const signature = await wallet.signMessage(message);

// 6. 调用 login 获取 token
const token = await fetch(`https://api.standx.com/v1/offchain/login?chain=${CHAIN}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ signature, signedData }),
}).then(r => r.json()).then(d => d.token);

console.log('Access Token:', token);

// 7. 使用 token 访问 API
const positions = await fetch('https://api.standx.com/v1/perps/positions', {
  headers: { 'Authorization': `Bearer ${token}` },
}).then(r => r.json());
```

## 错误处理

| 错误码 | 说明 |
|--------|------|
| 400 | 请求参数错误，检查 address 和 requestId |
| 401 | 签名验证失败 |
| 403 | 权限不足 |
| 429 | 请求过于频繁 |

## 文件结构

```
.
├── test-jwt-token.js      # 临时钱包测试脚本
├── get-jwt-token.js       # 生产环境使用脚本
├── test-wallet-result.json # 测试结果（包含私钥）
└── README.md              # 本文档
```
