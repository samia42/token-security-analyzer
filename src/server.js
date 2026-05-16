/**
 * Token Security Analyzer Server
 * Simple HTTP server (MCP support can be added later)
 */

import 'dotenv/config.js';
import http from 'http';
import { analyzeTokenSecurity } from './tools/analyzeTokenSecurity.js';
import { calculateCost, buildHTTP402Response, buildSuccessResponse } from './middleware/pricingEngine.js';

const PORT = process.env.PORT || 3000;

// In-memory payment tracking (for demo)
const payments = new Map();

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const params = url.searchParams;

  try {
    // Route 1: Analyze token security (with HTTP 402)
    if (pathname === '/tools/analyze_token_security') {
      const tokenAddress = params.get('token_address');
      const paymentId = params.get('payment_id');

      if (!tokenAddress) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'token_address parameter required' }));
        return;
      }

      const cost = calculateCost('analyze_token_security');
      const hasPaid = paymentId && payments.has(paymentId);

      if (!hasPaid) {
        // Return 402 Payment Required
        const response402 = buildHTTP402Response('analyze_token_security', cost);
        res.writeHead(response402.status, response402.headers);
        res.end(JSON.stringify(response402.body));
        return;
      }

      // Payment confirmed - execute analysis
      console.log(`✅ Payment confirmed (${paymentId}). Analyzing token: ${tokenAddress}`);
      const analysis = await analyzeTokenSecurity(tokenAddress);

      const successResponse = buildSuccessResponse('analyze_token_security', analysis, cost);
      res.writeHead(successResponse.status, successResponse.headers);
      res.end(JSON.stringify(successResponse.body, null, 2));
      return;
    }

    // Route 2: Mock payment endpoint
    if (pathname === '/api/pay' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const paymentData = JSON.parse(body);
          const paymentId = `payment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          payments.set(paymentId, {
            amount: paymentData.amount,
            currency: paymentData.currency,
            toolName: paymentData.toolName,
            status: 'confirmed',
            timestamp: new Date().toISOString()
          });

          console.log(`💰 [PAYMENT] Received ${paymentData.amount} ${paymentData.currency} for ${paymentData.toolName}`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            paymentId,
            status: 'confirmed',
            message: 'Payment accepted (mock). You can now call the service.'
          }, null, 2));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid payment data' }));
        }
      });
      return;
    }

    // Route 3: Health check
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'OK',
        service: 'Token-Security-Analyzer',
        version: '1.0.0',
        endpoints: [
          'GET /tools/analyze_token_security?token_address=0x...',
          'POST /api/pay (body: {amount, currency, toolName})',
          'GET /health'
        ]
      }, null, 2));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));

  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Token Security Analyzer running on http://localhost:${PORT}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   GET  http://localhost:${PORT}/tools/analyze_token_security?token_address=0x...`);
  console.log(`   POST http://localhost:${PORT}/api/pay`);
  console.log(`\n💡 Example:`);
  console.log(`   1. curl http://localhost:${PORT}/tools/analyze_token_security?token_address=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`);
  console.log(`   2. Get 402 with X-Price header`);
  console.log(`   3. curl -X POST http://localhost:${PORT}/api/pay -H "Content-Type: application/json" -d '{...}'`);
  console.log(`   4. Re-run step 1 with payment_id to get analysis\n`);
});