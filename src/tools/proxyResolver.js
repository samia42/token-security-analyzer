import { ethGetStorageAt, ethCall, decodeAddress } from './etherscanRpc.js';

// keccak256("eip1967.proxy.implementation") - 1
const EIP_1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
// keccak256("eip1967.proxy.beacon") - 1
const EIP_1967_BEACON_SLOT = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
// keccak256("org.zeppelinos.proxy.implementation") — used by USDC's FiatTokenProxy
const ZOS_LEGACY_SLOT = '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3';

const IMPLEMENTATION_FN = '0x5c60da1b'; // implementation()

const cache = new Map();
const TTL_MS = 30_000;

async function readSlot(address, slot) {
  try {
    return decodeAddress(await ethGetStorageAt(address, slot));
  } catch {
    return null;
  }
}

async function resolve(address) {
  const [eip1967, beacon, zos, getter] = await Promise.all([
    readSlot(address, EIP_1967_IMPL_SLOT),
    readSlot(address, EIP_1967_BEACON_SLOT),
    readSlot(address, ZOS_LEGACY_SLOT),
    ethCall(address, IMPLEMENTATION_FN).then(decodeAddress).catch(() => null),
  ]);

  if (eip1967) return { isProxy: true, implementation: eip1967, kind: 'eip1967' };

  if (beacon) {
    const implFromBeacon = await ethCall(beacon, IMPLEMENTATION_FN)
      .then(decodeAddress)
      .catch(() => null);
    if (implFromBeacon) return { isProxy: true, implementation: implFromBeacon, kind: 'eip1967-beacon', beacon };
  }

  if (zos) return { isProxy: true, implementation: zos, kind: 'zeppelinos-legacy' };
  if (getter) return { isProxy: true, implementation: getter, kind: 'implementation-getter' };

  return { isProxy: false };
}

export async function resolveImplementation(address) {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await resolve(address);
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}
