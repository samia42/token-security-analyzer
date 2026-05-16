// Throttled Etherscan v2 client.
// All callers share one queue so we don't blow the 5 req/sec ceiling.

const ETHERSCAN_BASE = 'https://api.etherscan.io/v2/api';
const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY || 'demo';
const CHAIN_ID = 1;

// Etherscan enforces tighter than the documented 5/sec — 350ms gives headroom.
const MIN_GAP_MS = 350;

let lastCallAt = 0;

async function throttle() {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function etherscanProxyRaw(params) {
  await throttle();
  const qs = new URLSearchParams({
    module: 'proxy',
    chainid: String(CHAIN_ID),
    apikey: ETHERSCAN_KEY,
    ...params,
  });
  const res = await fetchWithTimeout(`${ETHERSCAN_BASE}?${qs}`, 8000);
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Etherscan: ${data.error.message || JSON.stringify(data.error)}`);
  // Rate-limit on proxy endpoints comes back as {status:"0", message:"NOTOK", result:"..."}
  if (data.status === '0' && data.message) {
    const detail = typeof data.result === 'string' ? ` (${data.result})` : '';
    const err = new Error(`Etherscan: ${data.message}${detail}`);
    err.isRateLimit = data.message === 'NOTOK';
    throw err;
  }
  return data.result;
}

async function withRetry(fn) {
  try {
    return await fn();
  } catch (e) {
    if (!e.isRateLimit) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return fn();
  }
}

export async function ethCall(to, data) {
  return withRetry(() => etherscanProxyRaw({ action: 'eth_call', to, data, tag: 'latest' }));
}

export async function ethGetStorageAt(address, position) {
  return withRetry(() => etherscanProxyRaw({ action: 'eth_getStorageAt', address, position, tag: 'latest' }));
}

export async function ethGetCode(address) {
  return withRetry(() => etherscanProxyRaw({ action: 'eth_getCode', address, tag: 'latest' }));
}

async function fetchEtherscanSourceRaw(address) {
  await throttle();
  const qs = new URLSearchParams({
    module: 'contract',
    action: 'getsourcecode',
    address,
    chainid: String(CHAIN_ID),
    apikey: ETHERSCAN_KEY,
  });
  const res = await fetchWithTimeout(`${ETHERSCAN_BASE}?${qs}`, 8000);
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== '1') {
    const err = new Error(`Etherscan: ${data.message || 'unknown error'}`);
    err.isRateLimit = data.message === 'NOTOK';
    throw err;
  }
  if (!data.result || !data.result[0]) throw new Error('Etherscan: empty result');
  return data.result[0];
}

export async function fetchEtherscanSource(address) {
  return withRetry(() => fetchEtherscanSourceRaw(address));
}

export function padAddress(addr) {
  return '000000000000000000000000' + addr.replace(/^0x/, '').toLowerCase();
}

export function padUint(value, byteLen = 32) {
  return BigInt(value).toString(16).padStart(byteLen * 2, '0');
}

export function decodeAddress(hex) {
  if (!hex || hex === '0x' || /^0x0+$/.test(hex)) return null;
  return '0x' + hex.slice(-40);
}

export function decodeUint(hex) {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}
