/**
 * StandX Perps API - 测试用临时钱包获取 JWT
 */

const crypto = require('crypto');
const { ethers } = require('ethers');

const CHAIN = process.argv[2] || 'bsc';
const expiresSeconds = parseInt(process.argv[3] || '604800', 10);

if (!['bsc', 'solana'].includes(CHAIN)) {
  console.error('Supported chains: bsc, solana');
  process.exit(1);
}

const isSolana = CHAIN === 'solana';

// Generate temporary ed25519 key pair
function generateTemporaryKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey,
    publicKey: publicKey,
    requestId: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

// Step 1: Call prepare-signin
async function prepareSignin(requestId, address) {
  const res = await fetch(`https://api.standx.com/v1/offchain/prepare-signin?chain=${CHAIN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, address }),
  });
  if (!res.ok) throw new Error(`Prepare signin failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.signedData;
}

// Decode JWT payload (without verification)
function decodeJwtPayload(jwt) {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

// Step 4: Sign message with wallet
async function signMessage(message, walletPrivateKey) {
  if (isSolana) {
    throw new Error('Solana signing not implemented');
  } else {
    const wallet = new ethers.Wallet(walletPrivateKey);
    return wallet.signMessage(message);
  }
}

// Step 5: Login to get token
async function login(signature, signedData) {
  const res = await fetch(`https://api.standx.com/v1/offchain/login?chain=${CHAIN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature, signedData }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.token;
}

// Main
async function main() {
  console.log('=== StandX Test Wallet JWT ===');
  console.log(`Chain: ${CHAIN}, Expires: ${expiresSeconds}s`);
  console.log();

  // 1. Generate temporary key pair
  console.log('1. Generating temporary ed25519 key pair...');
  const tempKeyPair = generateTemporaryKeyPair();
  console.log(`   requestId: ${tempKeyPair.requestId.substring(0, 20)}...`);

  // 2. Create temporary wallet for signing
  let testWallet;
  let walletAddress;

  if (isSolana) {
    throw new Error('Solana not implemented');
  } else {
    // Create random wallet
    testWallet = ethers.Wallet.createRandom();
    walletAddress = testWallet.address;
  }

  console.log(`2. Created temporary EVM wallet:`);
  console.log(`   Address: ${walletAddress}`);
  console.log(`   Private Key: ${testWallet.privateKey.substring(0, 20)}...`);
  console.log();
  console.log('   ⚠️  保存上述私钥！测试后会用到。');
  console.log();

  // 3. Call prepare-signin
  console.log('3. Calling prepare-signin...');
  const signedData = await prepareSignin(tempKeyPair.requestId, walletAddress);
  const payload = decodeJwtPayload(signedData);
  console.log(`   Got signedData, message: ${payload?.message?.substring(0, 30)}...`);

  // 4. Sign message
  console.log('4. Signing message with temporary wallet...');
  const messageToSign = payload?.message;
  if (!messageToSign) throw new Error('No message in signedData');
  const signature = await signMessage(messageToSign, testWallet.privateKey);
  console.log(`   Signature: ${signature.substring(0, 40)}...`);

  // 5. Login
  console.log('5. Calling login...');
  const token = await login(signature, signedData);
  console.log();
  console.log('=== Access Token ===');
  console.log(token);
  console.log();

  // Save to file for later use
  const result = {
    chain: CHAIN,
    walletAddress,
    walletPrivateKey: testWallet.privateKey,
    expiresSeconds,
    accessToken: token,
    timestamp: new Date().toISOString(),
  };

  const fs = await import('fs');
  fs.writeFileSync('./test-wallet-result.json', JSON.stringify(result, null, 2));
  console.log('结果已保存到 test-wallet-result.json');

  return result;
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
