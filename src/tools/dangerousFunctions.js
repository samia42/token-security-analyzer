/**
 * Dangerous Functions Scanner
 * Detects malicious patterns in contract code
 * Falls back to mock if API fails
 */

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_KEY || 'demo';

const DANGEROUS_PATTERNS = {
  selfdestruct: { patterns: ['selfdestruct', 'suicide'], severity: 'CRITICAL', risk: 50, description: 'Contract can self-destruct' },
  pausable: { patterns: ['paused', 'pause\\s*\\('], severity: 'HIGH', risk: 35, description: 'Contract can be paused' },
  emergencyWithdraw: { patterns: ['emergencyWithdraw', 'drainPool'], severity: 'HIGH', risk: 40, description: 'Emergency withdrawal function' },
  ownerOnly: { patterns: ['onlyOwner.*transfer', 'onlyOwner.*burn'], severity: 'MEDIUM', risk: 25, description: 'Owner can modify contract' },
  blacklist: { patterns: ['blacklist', 'isBlackListed'], severity: 'MEDIUM', risk: 25, description: 'Blacklist function detected' }
};

// Mock data for known safe tokens
const MOCK_TOKENS = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { name: 'USDC', dangerous: [], risk: 0 },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { name: 'DAI', dangerous: [], risk: 0 },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { name: 'WETH', dangerous: [], risk: 0 }
};

export async function scanDangerousFunctions(contractAddress) {
  try {
    const url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${ETHERSCAN_API_KEY}`;
    
    const response = await fetch(url, { timeout: 5000 });
    
    if (!response.ok) {
      console.warn(`Etherscan API error: ${response.status}`);
      return getMockDangerousFunctions(contractAddress);
    }
    
    const data = await response.json();

    if (data.status !== '1' || !data.result || !data.result[0]) {
      console.warn(`Etherscan status: ${data.status}`);
      return getMockDangerousFunctions(contractAddress);
    }

    const result = data.result[0];
    const sourceCode = result.SourceCode || '';

    if (!sourceCode || sourceCode.length === 0) {
      return getMockDangerousFunctions(contractAddress);
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
    console.error('Dangerous functions scan error:', error.message);
    return getMockDangerousFunctions(contractAddress);
  }
}

function getMockDangerousFunctions(contractAddress) {
  const addr = contractAddress.toLowerCase();
  const mockData = MOCK_TOKENS[addr];

  if (mockData) {
    return {
      verified: true,
      contractName: mockData.name,
      dangerousFunctions: [],
      totalRiskScore: 0,
      flags: ['✅ No dangerous functions detected (mock data)']
    };
  }

  // Default for unknown tokens
  return {
    verified: false,
    contractName: null,
    dangerousFunctions: [],
    totalRiskScore: 0,
    flags: ['⚠️ Could not scan (API limit - using mock data)']
  };
}

export function getDangerousFunctionsRiskAdjustment(totalRiskScore) {
  return Math.min(totalRiskScore || 0, 40);
}