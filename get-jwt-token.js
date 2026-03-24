/**
 * StandX Perps API - Wallet JWT Authentication
 *
 * Usage:
 *   node get-jwt-token.js <wallet_private_key> [chain] [expiresSeconds]
 *
 * Examples:
 *   node get-jwt-token.js 0xyour_private_key bsc 604800
 *   node get-jwt-token.js 0xyour_private_key bsc     # defaults to 7 days
 *   node get-jwt-token.js solana_private_key solana   # Solana chain
 */

const crypto = require('crypto');
const fetch = require('node-fetch');

// For EVM (BSC): ethers.js
// For Solana: @solana/web3.js + @solana/sign-stroke-util
// This example uses ethers.js for EVM chains

const CHAIN = process.argv[3] || 'bsc';
const PRIVATE_KEY = process.argv[2];

if (!PRIVATE_KEY) {
  console.error('Usage: node get-jwt-token.js <wallet_private_key> [chain] [expiresSeconds]');
  process.exit(1);
}

// Determine chain type
const isSolana = CHAIN === 'solana';
const isEVM = CHAIN === 'bsc' || CHAIN === 'evm';

if (!isSolana && !isEVM) {
  console.error('Supported chains: bsc, solana');
  process.exit(1);
}

// Use dynamic imports for optional dependencies
async function getEthersV6() {
  const { ethers } = await import('ethers');
  return ethers;
}

// Generate temporary ed25519 key pair (requestId = base58-encoded public key)
function generateTemporaryKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.toString('base64'),
    publicKey: publicKey.toString('base64'),
    requestId: publicKey.toString('base64'), // base64-encoded for request
  };
}

// Fetch StandX public key for JWT verification
async function getStandxPublicKey() {
  const res = await fetch('https://api.standx.com/v1/offchain/certs');
  if (!res.ok) throw new Error(`Failed to fetch certs: ${res.status}`);
  const data = await res.json();
  return data.publicKey;
}

// Step 1: Call prepare-signin to get signedData (JWT)
async function prepareSignin(requestId) {
  const res = await fetch(`https://api.standx.com/v1/offchain/prepare-signin?chain=${CHAIN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId }),
  });
  if (!res.ok) throw new Error(`Prepare signin failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.signedData;
}

// Decode JWT payload (without verification, just for debugging)
function decodeJwtPayload(jwt) {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(payload);
}

// Step 4: Sign the message with wallet private key
async function signMessage(message, walletPrivateKey) {
  if (isSolana) {
    // Solana: sign with ed25519
    // const { Keypair, Signer } = await import('@solana/web3.js');
    // const keypair = Keypair.fromSecretKey(Buffer.from(walletPrivateKey, 'base64'));
    // return Signer.sign(message, keypair);
    throw new Error('Solana signing not implemented in this example');
  } else {
    // EVM: sign with ethers.js v6
    const { ethers } = await getEthersV6();
    const wallet = new ethers.Wallet(walletPrivateKey);
    return wallet.signMessage(message);
  }
}

// Step 5: Call login to get access token
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

// Main flow
async function main() {
  const expiresSeconds = parseInt(process.argv[4] || '604800', 10); // default 7 days

  console.log('=== StandX JWT Authentication ===');
  console.log(`Chain: ${CHAIN}`);
  console.log(`Expires: ${expiresSeconds} seconds`);
  console.log();

  // 1. Generate temporary ed25519 key pair
  console.log('1. Generating temporary ed25519 key pair...');
  const tempKeyPair = generateTemporaryKeyPair();
  console.log(`   requestId (base64): ${tempKeyPair.requestId.substring(0, 20)}...`);

  // 2. Get signature data from StandX
  console.log('2. Calling prepare-signin...');
  const signedData = await prepareSignin(tempKeyPair.requestId);
  const payload = decodeJwtPayload(signedData);
  console.log(`   Received signedData (JWT), message: ${payload?.message?.substring(0, 30)}...`);

  // 3. Parse the JWT to get the message to sign
  const messageToSign = payload?.message;
  if (!messageToSign) {
    throw new Error('No message found in signedData');
  }

  // 4. Sign the message with wallet private key
  console.log('3. Signing message with wallet...');
  const signature = await signMessage(messageToSign, PRIVATE_KEY);
  console.log(`   Signature: ${signature.substring(0, 40)}...`);

  // 5. Get access token
  console.log('4. Calling login to get access token...');
  const token = await login(signature, signedData);
  console.log(`   Token: ${token.substring(0, 40)}...`);
  console.log();
  console.log('=== Access Token ===');
  console.log(token);
  console.log();
  console.log('Use with: Authorization: Bearer <token>');

  return token;
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
