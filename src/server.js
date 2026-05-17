import 'dotenv/config.js';
import express from 'express';
import { paymentMiddleware } from 'x402-express';
import { wrapFetchWithPayment, createSigner } from 'x402-fetch';
import { analyzeTokenSecurity } from './tools/analyzeTokenSecurity.js';

const PORT = process.env.PORT || 3000;
const PAY_TO = process.env.PAYMENT_ADDRESS;
const DEMO_KEY = process.env.DEMO_PRIVATE_KEY;
const NETWORK = process.env.X402_NETWORK || 'base-sepolia';
const PRICE = process.env.X402_PRICE || '$0.001';
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'https://www.x402.org/facilitator';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

if (!PAY_TO || !ADDRESS_RE.test(PAY_TO)) {
  console.error('PAYMENT_ADDRESS env var is required (0x… address that receives USDC on ' + NETWORK + ')');
  process.exit(1);
}

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Payment');
  res.setHeader('Access-Control-Expose-Headers', 'X-Payment-Response');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    service: 'Token-Security-Analyzer',
    version: '2.0.0',
    payment: { protocol: 'x402', network: NETWORK, price: PRICE, payTo: PAY_TO, facilitator: FACILITATOR_URL },
    endpoints: [
      'GET /tools/analyze_token_security?token_address=0x… (x402-gated)',
      'GET /demo/analyze?token_address=0x… (server pays on your behalf, demo only)',
      'GET /health',
    ],
  });
});

app.use(paymentMiddleware(
  PAY_TO,
  {
    'GET /tools/analyze_token_security': {
      price: PRICE,
      network: NETWORK,
      config: {
        description: 'ERC-20 rug-pull risk analysis (verification, dangerous functions, liquidity, holders)',
      },
    },
  },
  { url: FACILITATOR_URL },
));

app.get('/tools/analyze_token_security', async (req, res) => {
  const tokenAddress = req.query.token_address;
  if (!tokenAddress || !ADDRESS_RE.test(tokenAddress)) {
    return res.status(400).json({ error: 'token_address must be a 0x-prefixed 40-hex-char address' });
  }
  try {
    const data = await analyzeTokenSecurity(tokenAddress);
    res.json({ success: true, tool: 'analyze_token_security', data });
  } catch (err) {
    console.error('analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

if (DEMO_KEY) {
  const signer = await createSigner(NETWORK, DEMO_KEY);
  const fetchWithPay = wrapFetchWithPayment(fetch, signer);
  const baseUrl = `http://localhost:${PORT}`;

  app.get('/demo/analyze', async (req, res) => {
    const tokenAddress = req.query.token_address;
    if (!tokenAddress || !ADDRESS_RE.test(tokenAddress)) {
      return res.status(400).json({ error: 'token_address must be a 0x-prefixed 40-hex-char address' });
    }
    try {
      const r = await fetchWithPay(`${baseUrl}/tools/analyze_token_security?token_address=${tokenAddress}`);
      const body = await r.json();
      const paymentResponse = r.headers.get('x-payment-response');
      res.status(r.status).json({ ...body, paymentResponse });
    } catch (err) {
      console.error('demo proxy error:', err);
      res.status(502).json({ error: err.message });
    }
  });
} else {
  app.get('/demo/analyze', (_req, res) => {
    res.status(503).json({ error: 'DEMO_PRIVATE_KEY not set — set it in .env to enable the dashboard demo proxy' });
  });
}

app.listen(PORT, () => {
  console.log(`\nToken Security Analyzer on http://localhost:${PORT}`);
  console.log(`  paid:   GET /tools/analyze_token_security?token_address=0x…   (${PRICE} USDC on ${NETWORK})`);
  console.log(`  demo:   GET /demo/analyze?token_address=0x…                   (${DEMO_KEY ? 'server pays' : 'disabled — set DEMO_PRIVATE_KEY'})`);
  console.log(`  health: GET /health\n`);
});
