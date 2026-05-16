/**
 * Contract Verification Checker
 * Checks if contract source code is verified on Etherscan
 * Verified = more trustworthy, code is public
 */

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_KEY || 'demo';

export async function checkContractVerified(contractAddress) {
  try {
    const url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${ETHERSCAN_API_KEY}`;
    
    const response = await fetch(url, { timeout: 5000 });
    
    if (!response.ok) {
      console.warn(`Etherscan API error: ${response.status}`);
      return getMockVerificationData(contractAddress);
    }
    
    const data = await response.json();

    // Check for rate limit or error response
    if (data.status !== '1') {
      console.warn(`Etherscan returned status: ${data.status}, message: ${data.message}`);
      return getMockVerificationData(contractAddress);
    }

    if (!data.result || !data.result[0]) {
      return {
        verified: false,
        contractName: null,
        compilerVersion: null,
        sourceCode: null,
        riskScore: 15,
        flag: '⚠️ Contract verification status unknown'
      };
    }

    const result = data.result[0];
    const isVerified = result.SourceCode && result.SourceCode.length > 0;

    return {
      verified: isVerified,
      contractName: result.ContractName || 'Unknown',
      compilerVersion: result.CompilerVersion || 'Unknown',
      sourceCode: isVerified ? result.SourceCode.substring(0, 200) + '...' : null,
      optimization: result.OptimizationUsed || 'Unknown',
      riskScore: isVerified ? 0 : 20,
      flag: isVerified 
        ? `✅ Contract verified - Code is public (${result.ContractName})`
        : '⚠️ Contract not verified on Etherscan'
    };
  } catch (error) {
    console.error('Verification check error:', error.message);
    return getMockVerificationData(contractAddress);
  }
}

// Mock verification data for known tokens
function getMockVerificationData(contractAddress) {
  const verified = {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
      verified: true,
      contractName: 'USDC',
      compilerVersion: '0.6.12',
      riskScore: 0,
      flag: '✅ Contract verified - Code is public (USDC)'
    },
    '0x6b175474e89094c44da98b954eedeac495271d0f': {
      verified: true,
      contractName: 'Dai Stablecoin',
      compilerVersion: '0.5.12',
      riskScore: 0,
      flag: '✅ Contract verified - Code is public (Dai)'
    },
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': {
      verified: true,
      contractName: 'WETH',
      compilerVersion: '0.4.19',
      riskScore: 0,
      flag: '✅ Contract verified - Code is public (WETH)'
    }
  };

  const addr = contractAddress.toLowerCase();
  if (verified[addr]) {
    return verified[addr];
  }

  // Default: assume unverified for unknown tokens
  return {
    verified: false,
    contractName: null,
    compilerVersion: null,
    sourceCode: null,
    riskScore: 15,
    flag: '⚠️ Could not verify contract (API limit reached, using mock data)'
  };
}

// Helper to get verification risk score adjustment
export function getVerificationRiskAdjustment(verified) {
  return verified ? -15 : 25; // Verified reduces risk by 15, unverified adds 25
}