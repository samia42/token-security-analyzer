import { analyzeTokenSecurity } from './src/tools/analyzeTokenSecurity.js';

const TOKENS = [
  { name: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  { name: 'DAI',  address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
  { name: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
];

for (const t of TOKENS) {
  console.log(`\n── ${t.name} ${t.address} ──`);
  const a = await analyzeTokenSecurity(t.address);
  if (a.error) { console.log(`error: ${a.error}`); continue; }
  console.log(`risk ${a.riskScore}/100 [${a.riskLevel}] — ${a.recommendation}`);
  a.allFlags?.slice(0, 5).forEach((f) => console.log(`  ${f}`));
}
