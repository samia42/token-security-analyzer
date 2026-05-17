#!/usr/bin/env node

/**
 * Token Security Analyzer CLI
 * Usage: node cli.js --token 0x... --format json
 */

import 'dotenv/config.js';
import { analyzeTokenSecurity } from './src/tools/analyzeTokenSecurity.js';
import { wrapFetchWithPayment, createSigner, decodeXPaymentResponse } from 'x402-fetch';

async function main() {
  const args = process.argv.slice(2);

  let tokenAddress = null;
  let format = 'pretty';
  let paid = false;
  let server = process.env.X402_SERVER_URL || 'http://localhost:3000';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token' && args[i + 1]) {
      tokenAddress = args[i + 1];
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      format = args[i + 1];
      i++;
    } else if (args[i] === '--server' && args[i + 1]) {
      server = args[i + 1];
      i++;
    } else if (args[i] === '--paid') {
      paid = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!tokenAddress) {
    console.error('❌ Token address required');
    console.error('Usage: node cli.js --token 0x...');
    console.error('Try: node cli.js --help');
    process.exit(1);
  }

  if (!tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
    console.error('❌ Invalid token address format');
    process.exit(1);
  }

  try {
    let analysis;
    let paymentReceipt = null;

    if (paid) {
      const key = process.env.PRIVATE_KEY;
      const network = process.env.X402_NETWORK || 'base-sepolia';
      if (!key) {
        console.error('❌ --paid requires PRIVATE_KEY env var (a base-sepolia wallet funded with test USDC)');
        console.error('   Faucet: https://faucet.circle.com/  (select Base Sepolia, USDC)');
        process.exit(1);
      }
      console.error(`💸 Paying via x402 on ${network} → ${server}\n`);
      const signer = await createSigner(network, key);
      const fetchWithPay = wrapFetchWithPayment(fetch, signer);
      const r = await fetchWithPay(`${server}/tools/analyze_token_security?token_address=${tokenAddress}`);
      const body = await r.json();
      if (!r.ok) {
        console.error(`❌ Server returned ${r.status}: ${JSON.stringify(body)}`);
        process.exit(1);
      }
      analysis = body.data;
      const xpr = r.headers.get('x-payment-response');
      if (xpr) paymentReceipt = decodeXPaymentResponse(xpr);
    } else {
      console.error('⏳ Analyzing token (local mode — no payment)...\n');
      analysis = await analyzeTokenSecurity(tokenAddress);
    }

    if (format === 'json') {
      console.log(JSON.stringify({ success: true, data: analysis, paymentReceipt }, null, 2));
    } else {
      printPretty(analysis);
      if (paymentReceipt) {
        console.log('\n💸 PAYMENT RECEIPT');
        console.log('────────────────────────────────────────────');
        console.log(JSON.stringify(paymentReceipt, null, 2));
      }
    }
  } catch (error) {
    console.error(`❌ Analysis failed: ${error.message}`);
    process.exit(1);
  }
}

function printPretty(analysis) {
  console.log('════════════════════════════════════════════');
  console.log(`🔍 TOKEN SECURITY ANALYSIS`);
  console.log('════════════════════════════════════════════\n');

  console.log(`📍 Token: ${analysis.tokenAddress}`);
  console.log(`⏱️  Timestamp: ${new Date(analysis.analysisTimestamp).toLocaleString()}\n`);

  // Risk Score
  console.log(`📊 RISK SCORE: ${analysis.riskScore}/100 [${analysis.riskLevel}]`);
  console.log(`   ${analysis.recommendation}\n`);

  // Risk Breakdown
  console.log('📈 RISK BREAKDOWN:');
  console.log(`   • Holder Concentration: ${analysis.riskBreakdown.holderConcentration}`);
  console.log(`   • Contract Verification: ${analysis.riskBreakdown.contractVerification}`);
  console.log(`   • Dangerous Functions: ${analysis.riskBreakdown.dangerousFunctions}`);
  console.log(`   • Liquidity: ${analysis.riskBreakdown.liquidity}\n`);

  // Holder Analysis
  console.log('👥 HOLDER DISTRIBUTION:');
  console.log(`   • Total Holders: ${analysis.analysis.holders.metrics.totalHolders.toLocaleString()}`);
  console.log(`   • Top Holder: ${analysis.analysis.holders.metrics.topHolder.percentage}%`);
  console.log(`   • Top 10: ${analysis.analysis.holders.metrics.top10Percentage}%`);
  console.log(`   • Gini Coefficient: ${analysis.analysis.holders.metrics.giniCoefficient}\n`);

  // Contract
  console.log('✅ CONTRACT VERIFICATION:');
  console.log(`   ${analysis.analysis.contractVerified.flag}`);
  if (analysis.analysis.contractVerified.contractName) {
    console.log(`   • Name: ${analysis.analysis.contractVerified.contractName}`);
    console.log(`   • Compiler: ${analysis.analysis.contractVerified.compilerVersion}`);
  }
  console.log();

  // Dangerous Functions
  console.log('⚠️  DANGEROUS FUNCTIONS:');
  console.log(`   • Found: ${analysis.analysis.dangerousFunctions.totalFound}`);
  if (analysis.analysis.dangerousFunctions.flags.length > 0) {
    analysis.analysis.dangerousFunctions.flags.forEach(f => console.log(`   ${f}`));
  }
  console.log();

  // Liquidity
  console.log('💧 LIQUIDITY ANALYSIS:');
  if (analysis.analysis.liquidity.hasLiquidity) {
    console.log(`   • Total Liquidity: $${(analysis.analysis.liquidity.totalLiquidity / 1000000).toFixed(1)}M`);
    console.log(`   • 24h Volume: $${(analysis.analysis.liquidity.volume24h / 1000000).toFixed(1)}M`);
    console.log(`   • Pools: ${analysis.analysis.liquidity.pools.length}`);
  } else {
    console.log('   ⚠️  No significant liquidity found');
  }
  console.log();

  // All Flags
  console.log('🚩 ALL FLAGS:');
  analysis.allFlags.forEach(f => console.log(`   ${f}`));
  console.log();

  console.log('════════════════════════════════════════════\n');
}

function printHelp() {
  console.log(`
Token Security Analyzer - CLI

USAGE:
  node cli.js --token <address> [--format json|pretty] [--paid] [--server <url>]

OPTIONS:
  --token <address>    Token contract address (0x...)
  --format <format>    Output format: json or pretty (default: pretty)
  --paid               Pay via x402 (USDC on base-sepolia) against a running server
  --server <url>       Server URL for --paid mode (default: http://localhost:3000)
  --help               Show this help

ENV (for --paid):
  PRIVATE_KEY          0x… private key of a base-sepolia wallet with test USDC
  X402_NETWORK         network (default: base-sepolia)

EXAMPLES:
  node cli.js --token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
  node cli.js --token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --paid
  node cli.js --token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --format json

KNOWN TOKENS:
  USDC: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
  DAI:  0x6B175474E89094C44Da98b954EedeAC495271d0F
  WETH: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
  `);
}

main();