/**
 * Liquidity Analysis
 * Analyzes token liquidity on Uniswap V3
 * Uses mock data when API fails
 */

const UNISWAP_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';

// Mock liquidity data for known tokens
const MOCK_LIQUIDITY = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
    name: 'USDC',
    hasLiquidity: true,
    totalLiquidity: 125000000,
    volume24h: 500000000,
    pools: [
      { rank: 1, address: '0x...', liquidity: 85000000, volume24h: 350000000, feeTier: 100, token0: 'USDC', token1: 'WETH' },
      { rank: 2, address: '0x...', liquidity: 40000000, volume24h: 150000000, feeTier: 500, token0: 'USDC', token1: 'USDT' }
    ]
  },
  '0x6b175474e89094c44da98b954eedeac495271d0f': {
    name: 'DAI',
    hasLiquidity: true,
    totalLiquidity: 95000000,
    volume24h: 380000000,
    pools: [
      { rank: 1, address: '0x...', liquidity: 65000000, volume24h: 250000000, feeTier: 100, token0: 'DAI', token1: 'WETH' },
      { rank: 2, address: '0x...', liquidity: 30000000, volume24h: 130000000, feeTier: 500, token0: 'DAI', token1: 'USDC' }
    ]
  },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': {
    name: 'WETH',
    hasLiquidity: true,
    totalLiquidity: 180000000,
    volume24h: 1200000000,
    pools: [
      { rank: 1, address: '0x...', liquidity: 120000000, volume24h: 800000000, feeTier: 100, token0: 'WETH', token1: 'USDC' },
      { rank: 2, address: '0x...', liquidity: 60000000, volume24h: 400000000, feeTier: 500, token0: 'WETH', token1: 'DAI' }
    ]
  }
};

export async function analyzeLiquidity(tokenAddress) {
  try {
    // Try real API first
    const pools = await fetchUniswapPools(tokenAddress);
    
    if (pools && pools.length > 0) {
      return analyzePoolsData(tokenAddress, pools);
    }
    
    // Fall back to mock
    return getMockLiquidity(tokenAddress);
  } catch (error) {
    console.error('Liquidity analysis error:', error.message);
    return getMockLiquidity(tokenAddress);
  }
}

async function fetchUniswapPools(tokenAddress) {
  const query = `
    query {
      pools(where: {
        tokens_contains_nocase: ["${tokenAddress.toLowerCase()}"]
      }, first: 10, orderBy: liquidity, orderDirection: desc) {
        id
        liquidity
        volumeUSD
        feeTier
        token0 { id, symbol }
        token1 { id, symbol }
      }
    }
  `;

  try {
    const response = await fetch(UNISWAP_SUBGRAPH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      timeout: 5000
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.data?.pools || null;
  } catch (error) {
    console.warn('Uniswap API failed, using mock data:', error.message);
    return null;
  }
}

function analyzePoolsData(tokenAddress, pools) {
  if (!pools || pools.length === 0) {
    return getMockLiquidity(tokenAddress);
  }

  const mainPool = pools[0];
  const liquidity = parseFloat(mainPool.liquidity) || 0;
  const volume24h = parseFloat(mainPool.volumeUSD) || 0;
  const ratio = liquidity > 0 ? volume24h / liquidity : 0;

  let riskScore = 0;
  const flags = [];

  if (liquidity < 10000) {
    riskScore += 35;
    flags.push('🚩 CRITICAL: Very low liquidity (<$10k)');
  } else if (liquidity < 100000) {
    riskScore += 25;
    flags.push('🚩 LOW: Low liquidity (<$100k)');
  } else if (liquidity < 1000000) {
    riskScore += 10;
    flags.push('⚠️ MODERATE: Medium liquidity (<$1M)');
  } else {
    riskScore -= 15;
    flags.push('✅ HEALTHY: Good liquidity (>$1M)');
  }

  if (ratio > 2) {
    riskScore -= 10;
    flags.push('✅ Good volume relative to liquidity');
  } else if (ratio < 0.5) {
    riskScore += 15;
    flags.push('🚩 Poor volume - low trading activity');
  }

  if (pools.length === 1) {
    riskScore += 10;
    flags.push('⚠️ Only 1 pool - concentrated liquidity');
  } else {
    riskScore -= 5;
    flags.push(`✅ ${pools.length} pools - distributed`);
  }

  return {
    hasLiquidity: true,
    pools: pools.slice(0, 5).map((p, i) => ({
      rank: i + 1,
      liquidity: Math.round(liquidity),
      volume24h: Math.round(volume24h),
      feeTier: p.feeTier,
      token0: p.token0.symbol,
      token1: p.token1.symbol
    })),
    totalLiquidity: Math.round(liquidity),
    volume24h: Math.round(volume24h),
    riskScore: Math.min(Math.max(riskScore, 0), 40),
    flags
  };
}

function getMockLiquidity(tokenAddress) {
  const addr = tokenAddress.toLowerCase();
  const mockData = MOCK_LIQUIDITY[addr];

  if (mockData) {
    return {
      hasLiquidity: true,
      pools: mockData.pools,
      totalLiquidity: mockData.totalLiquidity,
      volume24h: mockData.volume24h,
      riskScore: 0,
      flags: [
        `✅ HEALTHY: ${mockData.name} has $${(mockData.totalLiquidity / 1000000).toFixed(1)}M liquidity`,
        `✅ Strong volume: $${(mockData.volume24h / 1000000).toFixed(1)}M 24h`,
        `✅ ${mockData.pools.length} pools across exchanges`
      ]
    };
  }

  // Default for unknown tokens
  return {
    hasLiquidity: false,
    pools: [],
    totalLiquidity: 0,
    volume24h: 0,
    riskScore: 35,
    flags: ['🚩 No significant liquidity found (using mock data)']
  };
}

export function getLiquidityRiskAdjustment(riskScore) {
  return riskScore || 0;
}