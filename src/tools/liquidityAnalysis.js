// On-chain Uniswap V3 liquidity check via Etherscan eth_call.
// Probes every (pair × fee tier) combination, reads pair-side reserves,
// converts to USD. Pool TVL ≈ 2× pair-side reserve (V3 concentrated liquidity
// means this overstates active depth but matches what DEX trackers show).

import { ethCall, padAddress, padUint, decodeAddress, decodeUint } from './etherscanRpc.js';

// Note: the canonical mainnet factory ends in 1F984, not 113FA as some docs claim.
const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

const GET_POOL = '0x1698ee82';    // getPool(address,address,uint24)
const BALANCE_OF = '0x70a08231';  // balanceOf(address)

const PAIRS = [
  { addr: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', decimals: 18, usdPerUnit: null },
  { addr: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6,  usdPerUnit: 1.0 },
  { addr: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6,  usdPerUnit: 1.0 },
  { addr: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI',  decimals: 18, usdPerUnit: 1.0 },
];

const FEES = [
  { fee: 100,   label: '0.01%' },
  { fee: 500,   label: '0.05%' },
  { fee: 3000,  label: '0.30%' },
  { fee: 10000, label: '1.00%' },
];

async function getEthPriceUsd() {
  const KEY = process.env.ETHERSCAN_KEY || 'demo';
  try {
    const res = await fetch(`https://api.etherscan.io/v2/api?module=stats&action=ethprice&chainid=1&apikey=${KEY}`);
    const data = await res.json();
    const price = parseFloat(data?.result?.ethusd);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function getPool(tokenA, tokenB, fee) {
  const data = GET_POOL + padAddress(tokenA) + padAddress(tokenB) + padUint(fee);
  return decodeAddress(await ethCall(UNISWAP_V3_FACTORY, data));
}

async function balanceOf(token, holder) {
  const data = BALANCE_OF + padAddress(holder);
  return decodeUint(await ethCall(token, data));
}

export async function analyzeLiquidity(address) {
  try {
    const ethPrice = await getEthPriceUsd();
    const pairs = PAIRS.map((p) => (p.symbol === 'WETH' ? { ...p, usdPerUnit: ethPrice } : p));
    const tokenLower = address.toLowerCase();
    const pools = [];

    for (const pair of pairs) {
      if (pair.addr.toLowerCase() === tokenLower) continue;
      for (const tier of FEES) {
        let pool;
        try { pool = await getPool(address, pair.addr, tier.fee); } catch { continue; }
        if (!pool) continue;

        let reserveRaw;
        try { reserveRaw = await balanceOf(pair.addr, pool); } catch { continue; }
        const reserve = Number(reserveRaw) / 10 ** pair.decimals;
        const valueUsd = pair.usdPerUnit ? reserve * pair.usdPerUnit : null;
        const tvlUsd = valueUsd != null ? valueUsd * 2 : null;

        pools.push({
          address: pool,
          token0: 'TOKEN',
          token1: pair.symbol,
          fee: tier.fee,
          feeLabel: tier.label,
          pairReserve: parseFloat(reserve.toFixed(6)),
          pairValueUsd: valueUsd != null ? Math.round(valueUsd) : null,
          estimatedTvlUsd: tvlUsd != null ? Math.round(tvlUsd) : null,
        });
      }
    }

    if (pools.length === 0) {
      return {
        error: false,
        hasLiquidity: false,
        pools: [],
        totalLiquidity: 0,
        ethPriceUsd: ethPrice,
        riskScore: 30,
        flags: ['🚩 No Uniswap V3 pools found against WETH/USDC/USDT/DAI'],
      };
    }

    const total = pools.reduce((sum, p) => sum + (p.estimatedTvlUsd || 0), 0);
    let riskScore = 0;
    const flags = [];

    if (total === 0) {
      riskScore += 30;
      flags.push('⚠️ Pools exist but reserves are zero / unprice-able');
    } else if (total < 10_000) {
      riskScore += 35;
      flags.push(`🚩 CRITICAL: Very low liquidity ($${total.toLocaleString()})`);
    } else if (total < 100_000) {
      riskScore += 25;
      flags.push(`🚩 LOW: Liquidity under $100k ($${total.toLocaleString()})`);
    } else if (total < 1_000_000) {
      riskScore += 10;
      flags.push(`⚠️ MODERATE: Liquidity under $1M ($${total.toLocaleString()})`);
    } else {
      riskScore -= 15;
      flags.push(`✅ HEALTHY: $${(total / 1_000_000).toFixed(1)}M across ${pools.length} pool(s)`);
    }

    if (pools.length === 1) {
      riskScore += 10;
      flags.push('⚠️ Only 1 pool — concentrated liquidity');
    } else {
      flags.push(`✅ ${pools.length} pools (distributed)`);
    }

    return {
      error: false,
      hasLiquidity: total > 0,
      pools: pools.map((p, i) => ({ rank: i + 1, ...p })),
      totalLiquidity: total,
      volume24h: null,
      ethPriceUsd: ethPrice,
      riskScore: Math.min(Math.max(riskScore, 0), 40),
      flags,
    };
  } catch (error) {
    return {
      error: true,
      hasLiquidity: false,
      pools: [],
      totalLiquidity: 0,
      riskScore: 0,
      flags: [`❌ Liquidity check failed: ${error.message}`],
    };
  }
}

export function getLiquidityRiskAdjustment(riskScore) {
  return riskScore || 0;
}
