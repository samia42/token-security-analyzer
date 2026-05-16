/**
 * Complete Demo - Shows full flow: request → 402 → pay → success
 */

import { analyzeTokenSecurity } from './src/tools/analyzeTokenSecurity.js';
import { calculateCost } from './src/middleware/pricingEngine.js';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

async function runDemo() {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 TOKEN SECURITY ANALYZER - COMPLETE DEMO');
  console.log('='.repeat(70) + '\n');

  console.log('📋 DEMO FLOW:');
  console.log('   1. Agent requests token analysis');
  console.log('   2. Server returns 402 Payment Required');
  console.log('   3. Agent makes payment');
  console.log('   4. Agent calls again with payment proof');
  console.log('   5. Server returns analysis\n');

  const tokens = [
    { name: 'USDC (Stable)', address: USDC },
    { name: 'DAI (Stable)', address: DAI },
    { name: 'WETH (Wrapped Ether)', address: WETH }
  ];

  for (const token of tokens) {
    console.log('\n' + '-'.repeat(70));
    console.log(`📊 Analyzing: ${token.name}`);
    console.log(`   Address: ${token.address}`);
    console.log('-'.repeat(70) + '\n');

    // Step 1: Client requests analysis (no payment)
    console.log('📡 STEP 1: Client requests analysis (no payment)');
    console.log(`   GET /tools/analyze_token_security?token_address=${token.address}`);
    const cost = calculateCost('analyze_token_security');
    console.log(`   ← HTTP 402 Payment Required`);
    console.log(`   ← X-Price: ${cost} ETH`);
    console.log(`   ← X-Price-Currency: ETH\n`);

    // Step 2: Client makes payment
    console.log('💰 STEP 2: Client makes payment');
    console.log(`   POST /api/pay`);
    console.log(`   Body: { amount: ${cost}, currency: 'ETH', toolName: 'analyze_token_security' }`);
    const paymentId = `demo-${Date.now()}`;
    console.log(`   ← { paymentId: '${paymentId}', status: 'confirmed' }\n`);

    // Step 3: Client calls again with payment proof
    console.log('📡 STEP 3: Client calls again with payment proof');
    console.log(`   GET /tools/analyze_token_security?token_address=${token.address}&payment_id=${paymentId}`);

    // Step 4: Perform analysis
    console.log('   ⏳ Analyzing token...\n');
    const analysis = await analyzeTokenSecurity(token.address);

    if (analysis.error) {
      console.log(`   ❌ Error: ${analysis.error}`);
      console.log(`   💡 Tip: Get free Etherscan API key from https://etherscan.io/apis\n`);
      continue;
    }

    // Step 5: Return results
    console.log('✅ STEP 4: Server returns analysis\n');
    console.log(`   📊 Risk Score: ${analysis.riskScore}/100 [${analysis.riskLevel}]`);
    console.log(`   📝 ${analysis.recommendation}\n`);

    console.log('   📈 Metrics:');
    console.log(`      • Total Holders: ${analysis.metrics.totalHolders}`);
    console.log(`      • Top Holder: ${analysis.metrics.topHolder.percentage}%`);
    console.log(`      • Top 10 Total: ${analysis.metrics.top10Percentage}%`);
    console.log(`      • Gini Coefficient: ${analysis.metrics.giniCoefficient} (0=equal, 1=unequal)`);

    if (analysis.flags.length > 0) {
      console.log('\n   🚨 Risk Flags:');
      analysis.flags.forEach(flag => console.log(`      ${flag}`));
    }

    console.log(`\n   💳 Cost: ${cost} ETH`);
    console.log(`   💡 Value: Prevents ~$500+ loss from rug pull`);
    console.log(`   📊 ROI: ${(500 / (cost * 2500)).toFixed(0)}x`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ DEMO COMPLETE');
  console.log('='.repeat(70) + '\n');

  console.log('🎯 KEY TAKEAWAYS:');
  console.log('   ✓ Service is discoverable via HTTP endpoints');
  console.log('   ✓ HTTP 402 enables micropayment flow');
  console.log('   ✓ Payment justifies actual RPC costs');
  console.log('   ✓ Analysis prevents real trader losses\n');

  console.log('🚀 NEXT STEPS:');
  console.log('   1. Get Etherscan API key: https://etherscan.io/apis');
  console.log('   2. Add key to .env: ETHERSCAN_KEY=your_key');
  console.log('   3. Run server: npm start');
  console.log('   4. Test live: curl http://localhost:3000/health\n');
}

runDemo().catch(console.error);