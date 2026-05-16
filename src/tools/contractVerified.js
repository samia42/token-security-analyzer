import { resolveImplementation } from './proxyResolver.js';
import { fetchEtherscanSource } from './etherscanRpc.js';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const sourceCache = new Map();
const SOURCE_TTL_MS = 30_000;

async function fetchSource(address) {
  const key = address.toLowerCase();
  const hit = sourceCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const result = await fetchEtherscanSource(address);
  const value = {
    verified: !!(result.SourceCode && result.SourceCode.length > 0),
    contractName: result.ContractName || null,
    compilerVersion: result.CompilerVersion || null,
    sourceCode: result.SourceCode || '',
  };
  sourceCache.set(key, { value, expiresAt: Date.now() + SOURCE_TTL_MS });
  return value;
}

export async function checkContractVerified(address) {
  if (!ADDRESS_RE.test(address)) {
    return { error: true, verified: false, flag: '❌ Invalid address format' };
  }

  try {
    const proxy = await resolveImplementation(address);
    const src = await fetchSource(address);

    if (!proxy.isProxy) {
      return {
        error: false,
        verified: src.verified,
        contractName: src.contractName,
        compilerVersion: src.compilerVersion,
        isProxy: false,
        flag: src.verified
          ? `✅ Contract verified - Code is public (${src.contractName})`
          : '⚠️ Contract not verified on Etherscan',
      };
    }

    let implSrc;
    try {
      implSrc = await fetchSource(proxy.implementation);
    } catch (e) {
      implSrc = { verified: false, contractName: null, compilerVersion: null, sourceCode: '', error: e.message };
    }

    const bothVerified = src.verified && implSrc.verified;
    return {
      error: false,
      verified: bothVerified,
      contractName: src.contractName,
      compilerVersion: src.compilerVersion,
      isProxy: true,
      proxyKind: proxy.kind,
      implementation: {
        address: proxy.implementation,
        verified: implSrc.verified,
        contractName: implSrc.contractName,
        compilerVersion: implSrc.compilerVersion,
      },
      flag: bothVerified
        ? `✅ Proxy verified — delegates to ${implSrc.contractName} at ${proxy.implementation.slice(0, 10)}…`
        : `⚠️ Proxy detected but implementation ${implSrc.verified ? 'verified' : 'NOT verified'} (kind: ${proxy.kind})`,
    };
  } catch (error) {
    return {
      error: true,
      verified: false,
      contractName: null,
      compilerVersion: null,
      flag: `❌ Etherscan error: ${error.message}`,
    };
  }
}

export function getVerificationRiskAdjustment(verified) {
  return verified ? -15 : 25;
}

// Used by dangerousFunctions to scan both proxy + implementation source.
export async function fetchProxyAwareSource(address) {
  if (!ADDRESS_RE.test(address)) return { source: '', isProxy: false };

  const proxy = await resolveImplementation(address);
  const proxySrc = await fetchSource(address).catch(() => null);

  if (!proxy.isProxy) {
    return {
      source: proxySrc?.sourceCode || '',
      isProxy: false,
      contractName: proxySrc?.contractName,
    };
  }

  const implSrc = await fetchSource(proxy.implementation).catch(() => null);
  return {
    source: [proxySrc?.sourceCode, implSrc?.sourceCode].filter(Boolean).join('\n\n'),
    isProxy: true,
    proxyKind: proxy.kind,
    implementation: proxy.implementation,
    contractName: proxySrc?.contractName,
    implementationName: implSrc?.contractName,
  };
}
