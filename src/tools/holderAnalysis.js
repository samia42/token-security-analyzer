/**
 * Real holder distribution analysis via Ethplorer.
 *
 * Ethplorer exposes a free public key "freekey" that returns total holder count
 * and the top holders for any ERC-20 (rate-limited but no signup needed).
 *
 * Returns the same shape the rest of the analyzer expects:
 *   { riskScore, metrics: { totalHolders, topHolder, top10Percentage, giniCoefficient }, flags, source }
 */

const ETHPLORER_BASE = 'https://api.ethplorer.io';
const ETHPLORER_KEY = process.env.ETHPLORER_KEY || 'freekey';

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchTokenInfo(tokenAddress) {
  const url = `${ETHPLORER_BASE}/getTokenInfo/${tokenAddress}?apiKey=${ETHPLORER_KEY}`;
  const res = await fetchWithTimeout(url, 6000);
  if (!res.ok) throw new Error(`Ethplorer getTokenInfo HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Ethplorer: ${data.error.message || JSON.stringify(data.error)}`);
  return data;
}

async function fetchTopHolders(tokenAddress, limit = 10) {
  const url = `${ETHPLORER_BASE}/getTopTokenHolders/${tokenAddress}?apiKey=${ETHPLORER_KEY}&limit=${limit}`;
  const res = await fetchWithTimeout(url, 6000);
  if (!res.ok) throw new Error(`Ethplorer getTopTokenHolders HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Ethplorer: ${data.error.message || JSON.stringify(data.error)}`);
  return data.holders || [];
}

function giniFromShares(shares) {
  // shares = array of percentages (top-N), so this is an approximate Gini
  // over the visible holders. Not the true network-wide Gini, but a useful
  // concentration proxy when only top-10 is available.
  const n = shares.length;
  if (n < 2) return 0;
  const sorted = [...shares].sort((a, b) => a - b);
  let cumulative = 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    cumulative += sorted[i];
    weighted += (i + 1) * sorted[i];
  }
  if (cumulative === 0) return 0;
  return (2 * weighted) / (n * cumulative) - (n + 1) / n;
}

export async function analyzeHolders(tokenAddress) {
  const info = await fetchTokenInfo(tokenAddress);
  const topHolders = await fetchTopHolders(tokenAddress, 10);

  const totalHolders = Number(info.holdersCount) || 0;
  const shares = topHolders.map(h => Number(h.share) || 0);
  const topHolderPct = shares[0] || 0;
  const top10Pct = shares.reduce((a, b) => a + b, 0);
  const gini = giniFromShares(shares);

  let riskScore = 0;
  const flags = [];

  if (topHolderPct > 30) {
    riskScore += 40;
    flags.push(`🚩 Single holder owns ${topHolderPct.toFixed(2)}% (>30% = DANGER)`);
  } else if (topHolderPct > 20) {
    riskScore += 25;
    flags.push(`🚩 Large single holder: ${topHolderPct.toFixed(2)}%`);
  }

  if (top10Pct > 60) {
    riskScore += 30;
    flags.push(`🚩 Top 10 own ${top10Pct.toFixed(2)}% (>60% = DANGEROUS)`);
  } else if (top10Pct > 50) {
    riskScore += 15;
    flags.push(`⚠️ Top 10 concentration: ${top10Pct.toFixed(2)}%`);
  }

  if (totalHolders > 0 && totalHolders < 100) {
    riskScore += 35;
    flags.push(`🚩 Only ${totalHolders} holders (extremely low distribution)`);
  } else if (totalHolders > 0 && totalHolders < 1000) {
    riskScore += 20;
    flags.push(`🚩 Low holder count: ${totalHolders}`);
  }

  if (gini > 0.85) {
    riskScore += 15;
    flags.push(`🚩 Very high inequality (Gini: ${gini.toFixed(3)})`);
  } else if (gini > 0.8) {
    riskScore += 10;
    flags.push(`⚠️ High inequality (Gini: ${gini.toFixed(3)})`);
  }

  if (top10Pct > 0 && top10Pct < 30) {
    riskScore = Math.max(0, riskScore - 20);
    flags.push(`✅ Excellent distribution (top 10 own ${top10Pct.toFixed(2)}%)`);
  }

  if (totalHolders > 500000) {
    riskScore = Math.max(0, riskScore - 15);
    flags.push(`✅ Very high holder count (${totalHolders.toLocaleString()} holders)`);
  } else if (totalHolders > 100000) {
    riskScore = Math.max(0, riskScore - 10);
    flags.push(`✅ Good holder distribution (${totalHolders.toLocaleString()} holders)`);
  }

  riskScore = Math.min(100, Math.max(0, riskScore));

  return {
    riskScore,
    metrics: {
      totalHolders,
      topHolder: { percentage: parseFloat(topHolderPct.toFixed(2)) },
      top10Percentage: parseFloat(top10Pct.toFixed(2)),
      giniCoefficient: parseFloat(gini.toFixed(3)),
    },
    flags,
    source: 'ethplorer',
  };
}
