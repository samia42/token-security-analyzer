/**
 * Dangerous Functions Scanner
 * Detects malicious patterns in contract code
 * Red flags: selfdestruct, pause, backdoors, etc.
 */

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_KEY || 'demo';
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// Each pattern matches the *call site* or *declaration site* shape of a
// dangerous Solidity feature, not just the keyword. This avoids false
// positives from comments, variable names, or string literals that happen
// to contain "paused" or "blacklist".
//
// We also strip /* */ and // comments before matching (see stripComments).
const DANGEROUS_PATTERNS = {
  selfdestruct: {
    patterns: [/\bselfdestruct\s*\(/, /\bsuicide\s*\(/],
    severity: 'CRITICAL', risk: 50, description: 'Contract can self-destruct'
  },
  pausable: {
    // Pausable modifier / function, or whenNotPaused gate
    patterns: [/\b(function|modifier)\s+pause\s*\(/, /\bwhenNotPaused\b/, /\b_pause\s*\(\s*\)/],
    severity: 'HIGH', risk: 35, description: 'Contract can be paused'
  },
  emergencyWithdraw: {
    patterns: [/\bemergencyWithdraw\s*\(/, /\bdrainPool\s*\(/, /\brescueTokens\s*\(/],
    severity: 'HIGH', risk: 40, description: 'Emergency withdrawal function'
  },
  ownerMint: {
    // onlyOwner-gated mint or arbitrary balance writes
    patterns: [/onlyOwner[\s\S]{0,200}?function\s+\w*mint\w*\s*\(/i],
    severity: 'HIGH', risk: 35, description: 'Owner can mint new tokens'
  },
  blacklist: {
    patterns: [/\bblacklist\s*\(/i, /\bisBlackListed\s*\(/, /\baddBlackList\s*\(/i, /\bblacklisted\s*\[/i],
    severity: 'MEDIUM', risk: 25, description: 'Blacklist function detected'
  },
  feeManipulation: {
    patterns: [/\bsetFee\s*\(/, /\bsetTaxFee\s*\(/, /\bsetSellTax\s*\(/i, /\bsetBuyTax\s*\(/i],
    severity: 'MEDIUM', risk: 20, description: 'Owner can change transfer fees / taxes'
  },
};

// Strip Solidity comments so patterns don't match doc strings or commented-out
// code. Handles // ... and /* ... */ but not nested block comments (Solidity
// doesn't allow them anyway).
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

export async function scanDangerousFunctions(contractAddress) {
  if (!ADDRESS_RE.test(contractAddress)) {
    return {
      error: true,
      verified: false,
      dangerousFunctions: [],
      totalRiskScore: 0,
      flags: ['❌ Invalid address format'],
    };
  }
  try {
    const url = `https://api.etherscan.io/v2/api?module=contract&action=getsourcecode&address=${encodeURIComponent(contractAddress)}&chainid=1&apikey=${encodeURIComponent(ETHERSCAN_API_KEY)}`;

    const response = await fetchWithTimeout(url, 5000);
    
    if (!response.ok) {
      return {
        error: true,
        verified: false,
        dangerousFunctions: [],
        totalRiskScore: 0,
        flags: [`❌ API Error: Could not fetch contract code (${response.status})`]
      };
    }
    
    const data = await response.json();

    if (data.status !== '1' || !data.result || !data.result[0]) {
      return {
        error: true,
        verified: false,
        dangerousFunctions: [],
        totalRiskScore: 0,
        flags: [`❌ API Error: ${data.message || 'Could not fetch contract'}`]
      };
    }

    const result = data.result[0];
    const sourceCode = result.SourceCode || '';

    if (!sourceCode || sourceCode.length === 0) {
      return {
        error: true,
        verified: false,
        dangerousFunctions: [],
        totalRiskScore: 0,
        flags: [`❌ Contract code not available (not verified on Etherscan)`]
      };
    }

    // Scan for dangerous patterns. Strip comments first so a `// pause()` in
    // a doc comment doesn't trigger the pausable flag.
    const cleanedSource = stripComments(sourceCode);
    const dangerousFunctions = [];
    let totalRisk = 0;

    for (const [key, pattern] of Object.entries(DANGEROUS_PATTERNS)) {
      // Stop at the first matching pattern for a given category — we don't
      // want to count the same risk twice if multiple variants match.
      const matched = pattern.patterns.some((regex) => regex.test(cleanedSource));
      if (matched) {
        dangerousFunctions.push({
          type: key,
          severity: pattern.severity,
          risk: pattern.risk,
          description: pattern.description,
        });
        totalRisk += pattern.risk;
      }
    }

    const flags = dangerousFunctions.length === 0
      ? ['✅ No dangerous functions detected']
      : dangerousFunctions.map(f => `🚩 ${f.severity}: ${f.description}`);

    return {
      verified: true,
      contractName: result.ContractName,
      dangerousFunctions,
      totalRiskScore: Math.min(totalRisk, 50),
      flags
    };
  } catch (error) {
    return {
      error: true,
      verified: false,
      dangerousFunctions: [],
      totalRiskScore: 0,
      flags: [`❌ API Error: ${error.message}`]
    };
  }
}

export function getDangerousFunctionsRiskAdjustment(totalRiskScore) {
  return Math.min(totalRiskScore || 0, 40);
}