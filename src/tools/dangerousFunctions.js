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

const DANGEROUS_PATTERNS = {
  selfdestruct: { patterns: ['selfdestruct', 'suicide'], severity: 'CRITICAL', risk: 50, description: 'Contract can self-destruct' },
  pausable: { patterns: ['paused', 'pause\\s*\\('], severity: 'HIGH', risk: 35, description: 'Contract can be paused' },
  emergencyWithdraw: { patterns: ['emergencyWithdraw', 'drainPool'], severity: 'HIGH', risk: 40, description: 'Emergency withdrawal function' },
  ownerOnly: { patterns: ['onlyOwner.*transfer', 'onlyOwner.*burn'], severity: 'MEDIUM', risk: 25, description: 'Owner can modify contract' },
  blacklist: { patterns: ['blacklist', 'isBlackListed'], severity: 'MEDIUM', risk: 25, description: 'Blacklist function detected' }
};

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

    // Scan for dangerous patterns
    const dangerousFunctions = [];
    let totalRisk = 0;

    for (const [key, pattern] of Object.entries(DANGEROUS_PATTERNS)) {
      for (const regex of pattern.patterns) {
        const found = new RegExp(regex, 'gi').test(sourceCode);
        if (found) {
          dangerousFunctions.push({
            type: key,
            severity: pattern.severity,
            risk: pattern.risk,
            description: pattern.description
          });
          totalRisk += pattern.risk;
        }
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