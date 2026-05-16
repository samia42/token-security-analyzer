
const PUBLIC_RPC = process.env.ETH_RPC_URL || 'https://ethereum.publicnode.com';
const ETHERSCAN_BASE = 'https://api.etherscan.io/v2/api';
const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY || 'demo';
const CHAIN_ID = 1;

const MIN_ETHERSCAN_GAP_MS = 350;
let lastEtherscanAt = 0;

async function throttleEtherscan() {
  const wait = lastEtherscanAt + MIN_ETHERSCAN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastEtherscanAt = Date.now();
}

async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

let rpcId = 0;
async function rpc(method, params) {
  const res = await fetchWithTimeout(PUBLIC_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  }, 8000);
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`RPC: ${data.error.message || JSON.stringify(data.error)}`);
  return data.result;
}

export async function ethCall(to, data) {
  return rpc('eth_call', [{ to, data }, 'latest']);
}

export async function ethGetStorageAt(address, position) {
  return rpc('eth_getStorageAt', [address, position, 'latest']);
}

export async function ethGetCode(address) {
  return rpc('eth_getCode', [address, 'latest']);
}

async function fetchEtherscanSourceRaw(address) {
  await throttleEtherscan();
  const qs = new URLSearchParams({
    module: 'contract',
    action: 'getsourcecode',
    address,
    chainid: String(CHAIN_ID),
    apikey: ETHERSCAN_KEY,
  });
  const res = await fetchWithTimeout(`${ETHERSCAN_BASE}?${qs}`, undefined, 8000);
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
  try {
    return await fetchEtherscanSourceRaw(address);
  } catch (e) {
    if (!e.isRateLimit) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return fetchEtherscanSourceRaw(address);
  }
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
