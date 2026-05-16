#!/bin/bash

# Token Security Analyzer - Complete Demo
# Shows: request → 402 → pay → analysis

echo "=================================================="
echo "🔍 TOKEN SECURITY ANALYZER - LIVE DEMO"
echo "=================================================="
echo ""

# Test tokens
USDC="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
DAI="0x6B175474E89094C44Da98b954EedeAC495271d0F"
WETH="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

echo "📡 STEP 1: Request token analysis (no payment)"
echo "GET /tools/analyze_token_security?token_address=$USDC"
echo ""

response=$(curl -s "http://localhost:3000/tools/analyze_token_security?token_address=$USDC")
echo "← HTTP 402 Payment Required"
echo "← $(echo $response | jq -r '.error')"
echo "← Price: $(echo $response | jq -r '.price') ETH"
echo ""

echo "💰 STEP 2: Make payment"
echo "POST /api/pay"
echo ""

payment=$(curl -s -X POST http://localhost:3000/api/pay \
  -H "Content-Type: application/json" \
  -d '{"amount":0.0002,"currency":"ETH","toolName":"analyze_token_security"}')

paymentId=$(echo $payment | jq -r '.paymentId')
echo "← Payment confirmed: $paymentId"
echo ""

echo "📊 STEP 3: Request with payment proof"
echo "GET /tools/analyze_token_security?token_address=$USDC&payment_id=$paymentId"
echo ""

analysis=$(curl -s "http://localhost:3000/tools/analyze_token_security?token_address=$USDC&payment_id=$paymentId")

echo "✅ STEP 4: Analysis received"
echo ""
echo "Risk Score: $(echo $analysis | jq '.data.riskScore')/100 [$(echo $analysis | jq -r '.data.riskLevel')]"
echo "Recommendation: $(echo $analysis | jq -r '.data.recommendation')"
echo ""
echo "Metrics:"
echo "  • Total Holders: $(echo $analysis | jq '.data.metrics.totalHolders')"
echo "  • Top Holder: $(echo $analysis | jq '.data.metrics.topHolder.percentage')%"
echo "  • Top 10: $(echo $analysis | jq '.data.metrics.top10Percentage')%"
echo ""

echo "🚩 Flags:"
echo $analysis | jq -r '.data.flags[]' | sed 's/^/   /'

echo ""
echo "=================================================="
echo "✅ DEMO COMPLETE"
echo "=================================================="
echo ""
echo "Key Points:"
echo "  ✓ Service discoverable via HTTP"
echo "  ✓ HTTP 402 enables micropayment"
echo "  ✓ Real blockchain analysis"
echo "  ✓ Payment justifies RPC costs"