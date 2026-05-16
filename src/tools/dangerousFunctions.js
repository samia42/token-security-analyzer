import { fetchProxyAwareSource } from './contractVerified.js';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// Match the function/declaration shape — bare keywords would fire on
// variable names and comments. Comments are stripped before matching anyway.
const PATTERNS = {
  selfdestruct: {
    re: [/\bselfdestruct\s*\(/, /\bsuicide\s*\(/],
    severity: 'CRITICAL', risk: 50, description: 'Contract can self-destruct',
  },
  pausable: {
    re: [/\b(function|modifier)\s+pause\s*\(/, /\bwhenNotPaused\b/, /\b_pause\s*\(\s*\)/],
    severity: 'HIGH', risk: 35, description: 'Contract can be paused',
  },
  emergencyWithdraw: {
    re: [/\bemergencyWithdraw\s*\(/, /\bdrainPool\s*\(/, /\brescueTokens\s*\(/],
    severity: 'HIGH', risk: 40, description: 'Emergency withdrawal function',
  },
  ownerMint: {
    re: [/onlyOwner[\s\S]{0,200}?function\s+\w*mint\w*\s*\(/i],
    severity: 'HIGH', risk: 35, description: 'Owner can mint new tokens',
  },
  blacklist: {
    re: [/\bblacklist\s*\(/i, /\bisBlackListed\s*\(/, /\baddBlackList\s*\(/i, /\bblacklisted\s*\[/i],
    severity: 'MEDIUM', risk: 25, description: 'Blacklist function detected',
  },
  feeManipulation: {
    re: [/\bsetFee\s*\(/, /\bsetTaxFee\s*\(/, /\bsetSellTax\s*\(/i, /\bsetBuyTax\s*\(/i],
    severity: 'MEDIUM', risk: 20, description: 'Owner can change transfer fees / taxes',
  },
};

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

const DISCLAIMER =
  'Pattern-scan only. Cannot detect obfuscated calls, assembly, or hidden ' +
  'delegatecalls. A clean result does NOT mean the contract is safe.';

const empty = (flags) => ({
  error: true,
  verified: false,
  dangerousFunctions: [],
  totalRiskScore: 0,
  confidence: 'pattern-scan-only',
  disclaimer: DISCLAIMER,
  flags,
});

export async function scanDangerousFunctions(address) {
  if (!ADDRESS_RE.test(address)) return empty(['❌ Invalid address format']);

  try {
    const fetched = await fetchProxyAwareSource(address);
    if (!fetched.source) return empty(['❌ Contract code not available (not verified on Etherscan)']);

    const cleaned = stripComments(fetched.source);
    const dangerousFunctions = [];
    let totalRisk = 0;

    for (const [type, p] of Object.entries(PATTERNS)) {
      if (p.re.some((re) => re.test(cleaned))) {
        dangerousFunctions.push({ type, severity: p.severity, risk: p.risk, description: p.description });
        totalRisk += p.risk;
      }
    }

    const flags = dangerousFunctions.length === 0
      ? ['✅ No dangerous patterns detected (pattern-scan only)']
      : dangerousFunctions.map((f) => `🚩 ${f.severity}: ${f.description}`);

    if (fetched.isProxy) {
      flags.unshift(`ℹ️  Scanned proxy + implementation (${fetched.proxyKind}, impl: ${fetched.implementation.slice(0, 10)}…)`);
    }

    return {
      error: false,
      verified: true,
      contractName: fetched.contractName,
      implementationScanned: fetched.isProxy ? fetched.implementation : null,
      dangerousFunctions,
      totalRiskScore: Math.min(totalRisk, 50),
      confidence: 'pattern-scan-only',
      disclaimer: DISCLAIMER,
      flags,
    };
  } catch (error) {
    return empty([`❌ API Error: ${error.message}`]);
  }
}

export function getDangerousFunctionsRiskAdjustment(totalRiskScore) {
  return Math.min(totalRiskScore || 0, 40);
}
