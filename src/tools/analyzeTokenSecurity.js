import { checkContractVerified, getVerificationRiskAdjustment } from './contractVerified.js';
import { scanDangerousFunctions, getDangerousFunctionsRiskAdjustment } from './dangerousFunctions.js';
import { analyzeLiquidity, getLiquidityRiskAdjustment } from './liquidityAnalysis.js';
import { analyzeHolders } from './holderAnalysis.js';

export async function analyzeTokenSecurity(tokenAddress) {
  try {
    // stderr only — stdout is reserved for MCP JSON-RPC framing
    console.error(`\n🔍 Analyzing token: ${tokenAddress}`);

    // Ethplorer runs in parallel with the Etherscan-backed work below
    // (which shares a single throttled queue and must stay sequential).
    const holderPromise = analyzeHolders(tokenAddress).catch((err) => ({ error: err.message }));

    const verification = await checkContractVerified(tokenAddress);
    const dangerousFuncs = await scanDangerousFunctions(tokenAddress);
    const liquidity = await analyzeLiquidity(tokenAddress);
    const holderResult = await holderPromise;

    const holderAnalysis = holderResult.error
      ? {
          riskScore: 0,
          metrics: { totalHolders: null, topHolder: { percentage: null }, top10Percentage: null, giniCoefficient: null },
          flags: [`⚠️ Holder data unavailable: ${holderResult.error}`],
          source: 'unavailable',
        }
      : holderResult;

    let finalRiskScore = holderAnalysis.riskScore;
    finalRiskScore += getVerificationRiskAdjustment(verification.verified);
    finalRiskScore += getDangerousFunctionsRiskAdjustment(dangerousFuncs.totalRiskScore || 0);
    finalRiskScore += getLiquidityRiskAdjustment(liquidity.riskScore || 0);
    finalRiskScore = Math.min(100, Math.max(0, finalRiskScore));

    const allFlags = [
      ...holderAnalysis.flags,
      verification.flag,
      ...(dangerousFuncs.flags || []),
      ...(liquidity.flags || [])
    ];

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
          ethPriceUsd: liquidity.ethPriceUsd,
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

