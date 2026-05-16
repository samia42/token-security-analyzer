/**
 * Complete Token Security Analyzer
 * Combines: Holder distribution + Contract verification + Dangerous functions + Liquidity
 */

import { checkContractVerified, getVerificationRiskAdjustment } from './contractVerified.js';
import { scanDangerousFunctions, getDangerousFunctionsRiskAdjustment } from './dangerousFunctions.js';
import { analyzeLiquidity, getLiquidityRiskAdjustment } from './liquidityAnalysis.js';
import { analyzeHolders } from './holderAnalysis.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function analyzeTokenSecurity(tokenAddress) {
  try {
    // log to stderr — stdout is reserved for the MCP protocol when run as an MCP server
    console.error(`\n🔍 Analyzing token: ${tokenAddress}`);

    // Holder analysis (Ethplorer) and liquidity (DeFiLlama) are unrelated to
    // Etherscan, so they can run in parallel.
    const [holderResult, liquidity] = await Promise.all([
      analyzeHolders(tokenAddress).catch((err) => ({ error: err.message })),
      analyzeLiquidity(tokenAddress),
    ]);

    // Etherscan free tier is 5 req/sec. We make two Etherscan calls per
    // analysis (contract verified + dangerous functions). Running them
    // sequentially with a small gap keeps us inside the budget even when
    // multiple analyses fire back-to-back.
    const verification = await checkContractVerified(tokenAddress);
    await sleep(250);
    const dangerousFuncs = await scanDangerousFunctions(tokenAddress);

    // Surface a clear failure mode if Ethplorer rejected the request — better
    // than silently substituting fake numbers.
    const holderAnalysis = holderResult.error
      ? {
          riskScore: 0,
          metrics: { totalHolders: null, topHolder: { percentage: null }, top10Percentage: null, giniCoefficient: null },
          flags: [`⚠️ Holder data unavailable: ${holderResult.error}`],
          source: 'unavailable',
        }
      : holderResult;

    // Combine all risk scores
    let finalRiskScore = holderAnalysis.riskScore;
    
    finalRiskScore += getVerificationRiskAdjustment(verification.verified);
    finalRiskScore += getDangerousFunctionsRiskAdjustment(dangerousFuncs.totalRiskScore || 0);
    finalRiskScore += getLiquidityRiskAdjustment(liquidity.riskScore || 0);

    finalRiskScore = Math.min(100, Math.max(0, finalRiskScore));

    // Compile all flags
    const allFlags = [
      ...holderAnalysis.flags,
      verification.flag,
      ...(dangerousFuncs.flags || []),
      ...(liquidity.flags || [])
    ];

    // Final recommendation
    let riskLevel = 'SAFE';
    let recommendation = 'Token appears relatively safe.';

    if (finalRiskScore >= 80) {
      riskLevel = 'CRITICAL';
      recommendation = '⛔ AVOID - Multiple red flags. High rug pull risk.';
    } else if (finalRiskScore >= 60) {
      riskLevel = 'HIGH';
      recommendation = '⚠️ HIGH RISK - Several concerning factors detected.';
    } else if (finalRiskScore >= 40) {
      riskLevel = 'MODERATE';
      recommendation = '⚠️ MODERATE RISK - Some concerns present. Trade with caution.';
    } else if (finalRiskScore >= 20) {
      riskLevel = 'LOW';
      recommendation = '✅ LOW RISK - Most metrics look good.';
    } else {
      riskLevel = 'VERY_LOW';
      recommendation = '✅ VERY LOW RISK - Excellent security profile.';
    }

    return {
      tokenAddress,
      riskScore: Math.round(finalRiskScore),
      riskLevel,
      recommendation,
      analysis: {
        holders: {
          score: holderAnalysis.riskScore,
          metrics: holderAnalysis.metrics,
          flags: holderAnalysis.flags.filter(f => f.includes('Excellent') || f.includes('High') || f.includes('very') || f.includes('Only'))
        },
        contractVerified: {
          verified: verification.verified,
          contractName: verification.contractName,
          compilerVersion: verification.compilerVersion,
          isProxy: verification.isProxy || false,
          proxyKind: verification.proxyKind || null,
          implementation: verification.implementation || null,
          flag: verification.flag,
          riskAdjustment: getVerificationRiskAdjustment(verification.verified)
        },
        dangerousFunctions: {
          totalFound: dangerousFuncs.dangerousFunctions?.length || 0,
          functions: dangerousFuncs.dangerousFunctions || [],
          flags: dangerousFuncs.flags || [],
          confidence: dangerousFuncs.confidence || 'pattern-scan-only',
          disclaimer: dangerousFuncs.disclaimer,
          implementationScanned: dangerousFuncs.implementationScanned || null,
          riskAdjustment: getDangerousFunctionsRiskAdjustment(dangerousFuncs.totalRiskScore || 0)
        },
        liquidity: {
          hasLiquidity: liquidity.hasLiquidity,
          totalLiquidity: liquidity.totalLiquidity,
          volume24h: liquidity.volume24h,
          pools: liquidity.pools || [],
          flags: liquidity.flags || [],
          riskAdjustment: getLiquidityRiskAdjustment(liquidity.riskScore || 0)
        }
      },
      allFlags,
      riskBreakdown: {
        holderConcentration: holderAnalysis.riskScore,
        contractVerification: getVerificationRiskAdjustment(verification.verified),
        dangerousFunctions: getDangerousFunctionsRiskAdjustment(dangerousFuncs.totalRiskScore || 0),
        liquidity: getLiquidityRiskAdjustment(liquidity.riskScore || 0),
        total: Math.round(finalRiskScore)
      },
      analysisTimestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Analysis error:', error.message);
    return {
      error: `Analysis failed: ${error.message}`,
      tokenAddress,
      riskScore: null
    };
  }
}

