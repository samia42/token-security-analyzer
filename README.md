# Token Security Analyzer

An ERC-20 rug-pull risk analyzer for Ethereum mainnet. Exposes the same analysis through three interfaces:

| Interface | Audience | Entry point |
|-----------|----------|-------------|
| **MCP server** | AI agents (Claude Desktop, any MCP client) | `node src/mcp-server.js` |
| **HTTP service** | Web dashboards, scripts, integrations | `node src/server.js` |
| **CLI** | Humans at a terminal | `node cli.js --token 0x...` |

The HTTP service uses an **HTTP 402** payment-required flow (mock for now), so a service ID, a price, and the unlock flow are part of the protocol — the same shape a real x402-style paid service would take.

---

## What it checks (the four signals)

For any ERC-20 address, the analyzer pulls four independent signals and combines them into a single 0–100 risk score.

| Signal | What it measures | Data source |
|---|---|---|
| **Holder distribution** | Total holders, top-1 share, top-10 share, approx Gini over top-10 | Ethplorer free API (`getTokenInfo`, `getTopTokenHolders`) |
| **Contract verification** | Source code published on Etherscan? Contract name + compiler version. | Etherscan API V2 (`module=contract&action=getsourcecode&chainid=1`) |
| **Dangerous functions** | Pattern-matches verified source code for `selfdestruct`, pause modifiers, emergency-withdraw, owner-gated mint, blacklist, fee/tax setters. Comments are stripped before matching. | Etherscan source code (same call as verification) |
| **Liquidity** | Total Uniswap V3 TVL, 24 h volume, number of pools | DeFiLlama API, with a small fallback table for major tokens when DeFiLlama is rate-limited |

The score is bounded `[0, 100]`. Bands:

- `0–19` → `VERY_LOW` ✅
- `20–39` → `LOW` ✅
- `40–59` → `MODERATE` ⚠️
- `60–79` → `HIGH` ⚠️
- `80–100` → `CRITICAL` ⛔

---

## Project layout

```
token-aggregator/
├── src/
│   ├── mcp-server.js              MCP server over stdio (@modelcontextprotocol/sdk)
│   ├── server.js                  HTTP server with /api/pay and /tools/analyze_token_security
│   ├── middleware/
│   │   └── pricingEngine.js       HTTP 402 response + cost calculator
│   └── tools/
│       ├── analyzeTokenSecurity.js  Orchestrator — combines the four signals
│       ├── holderAnalysis.js        Ethplorer-backed real holder data
│       ├── contractVerified.js      Etherscan V2 source-code lookup
│       ├── dangerousFunctions.js    Pattern scan over verified source
│       └── liquidityAnalysis.js     DeFiLlama + fallback for majors
├── frontend/                       React + Vite dashboard
├── cli.js                          Terminal entry point
└── .env.example                    Required + optional env vars
```

---

## Running it locally

### 1. Install

```bash
npm install
cd frontend && npm install && cd ..
```

### 2. Configure

Copy `.env.example` to `.env` and fill in your **Etherscan API key**:

```bash
cp .env.example .env
# edit .env, set ETHERSCAN_KEY=...
```

Get a free key at <https://etherscan.io/apis>. Ethplorer and DeFiLlama don't require a key.

### 3. Run the three interfaces

```bash
# CLI
node cli.js --token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48

# HTTP server (port 3000)
node src/server.js
# In another terminal, also start the dashboard
cd frontend && npm run dev   # http://localhost:5173

# MCP server (stdin/stdout — driven by an MCP client)
node src/mcp-server.js
```

### 4. Wire MCP into Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (or the equivalent on your OS):

```json
{
  "mcpServers": {
    "tokenSecurityAnalyzer": {
      "command": "node",
      "args": ["/absolute/path/to/token-aggregator/src/mcp-server.js"],
      "env": {
        "ETHERSCAN_KEY": "your_etherscan_api_key"
      }
    }
  }
}
```

Fully quit Claude Desktop (⌘Q) and relaunch. The 🔌 tools icon in a new chat will list `analyze_token_security`. Then ask Claude something like:

> Analyze the security of token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48.

---

## HTTP 402 flow (for the HTTP service)

The HTTP service intentionally refuses to analyze without a payment ID. The flow is:

```
GET /tools/analyze_token_security?token_address=0x...
  → 402 Payment Required
     X-Price: 0.0002
     X-Price-Currency: ETH

POST /api/pay  body: { amount, currency, toolName }
  → 200 { paymentId: "payment-<uuid>" }

GET /tools/analyze_token_security?token_address=0x...&payment_id=<paymentId>
  → 200 { success: true, data: { riskScore, riskLevel, analysis, allFlags, ... } }
```

The current payment endpoint is a **mock** — it accepts any body and returns a confirmed paymentId. The 15-minute TTL, bounded payment map, UUID IDs, and 4 KB body cap are real (designed not to leak memory or be brute-forced), so swapping in a real on-chain verifier is mostly a one-function change in `src/server.js`.

---

## Notable engineering decisions

These came up during the build and are worth knowing about if you're reading the code:

### 1. The MCP server uses the official SDK, not a hand-rolled JSON loop

An earlier prototype tried to read JSON-RPC off stdin with a custom message format. Real MCP clients (Claude Desktop, etc.) speak strict JSON-RPC 2.0 with an `initialize` handshake and `notifications/initialized` flow, so the original wouldn't connect. We now use `@modelcontextprotocol/sdk`'s `McpServer` + `StdioServerTransport` with a Zod-validated tool schema, which handles all of that.

### 2. stdout is reserved for the MCP protocol

`analyzeTokenSecurity` and friends log with `console.error`, never `console.log`. When the process is launched as an MCP server, stdout carries JSON-RPC framing — a stray `console.log` would corrupt the stream and Claude Desktop would silently drop the server.

### 3. Etherscan calls are serialized, not parallel

The free Etherscan tier is **5 req/sec**. Each analysis fires 2 Etherscan calls (`contractVerified` + `dangerousFunctions`). Running them in `Promise.all` together with several back-to-back analyses (e.g. comparing tokens) reliably tripped rate-limit errors that made the analyzer report `verified=false` for actually-verified contracts (e.g. LINK falsely scoring 80/100). The orchestrator now runs the two Etherscan calls **sequentially** with a 250 ms gap. Holder analysis (Ethplorer) and liquidity (DeFiLlama) still run in parallel with the Etherscan block.

### 4. Holder data is real and deterministic

An earlier version generated holder counts and concentration percentages with `Math.random()` for any token not in a 3-token hardcoded table. Same address, different answers on every call. Holder data is now fetched from Ethplorer's free public endpoint, which returns the actual on-chain holder count and top-10 list. USDC reports 6,874,784 holders (the real number), SHIB's top holder is the `0xdead…` burn address at 41.04 % — the analyzer doesn't try to detect burn addresses; it conservatively flags this as concentration risk.

### 5. Dangerous-function regex matches function shape, not just keywords

The original patterns like `'paused'` and `'blacklist'` would match those words anywhere in source code — in comments, doc strings, variable names. The current patterns:

- Strip `//…` and `/* … */` comments before scanning
- Match function-call / declaration shape: `\bselfdestruct\s*\(`, `\b(function|modifier)\s+pause\s*\(`
- Stop at the first match per category (so one risk doesn't get counted twice)

This won't catch every adversarial obfuscation, but it cuts down on the false-positive rate on legitimate contracts.

### 6. Token address is regex-validated everywhere

Each tool checks `/^0x[a-fA-F0-9]{40}$/` before assembling the URL, and uses `encodeURIComponent` on values inserted into Etherscan URLs. The HTTP endpoint and MCP schema both reject anything else with a clear error.

### 7. Real `fetch` timeouts via `AbortController`

`fetch(url, { timeout: 5000 })` is **silently ignored** by Node's native fetch — it only accepts `signal`. All external calls use a small `fetchWithTimeout` helper that wires up an `AbortController` and clears the timer in `finally`.

---

## Security fixes baked in

Beyond the MCP rewrite and the accuracy fixes, the build addressed a handful of vulnerabilities found while reviewing the original code:

| Issue | Fix |
|---|---|
| `Math.random + Date.now + substr(2,9)` paymentId → trivially guessable | `crypto.randomUUID()` |
| Unbounded payments map → memory leak | `MAX_PAYMENTS=10000` + 15-minute TTL |
| `/api/pay` accepted arbitrary body size | 4 KB cap with HTTP 413 |
| `token_address` not validated in HTTP route | Regex check + `encodeURIComponent` |
| `.env` (with real API key) committed despite `.gitignore` | Untracked. **Key in commit `46b67e6` of the public repo still needs rotation.** |
| `.env` had `DEMO_MODE=trueETHERSCAN_KEY=...` on one concatenated line | Cleaned and replaced with a proper `.env.example` |

---

## Known limitations

- **Etherscan free tier (100 k req/day, 5 req/s).** The 250 ms gap between calls keeps single analyses safe; running many tokens back-to-back will still rate-limit. Upgrade or stagger.
- **DeFiLlama is occasionally unreachable.** When it is, the liquidity check falls back to a small hardcoded table for `USDC/WETH/USDT/DAI/LINK/SHIB`. Other tokens get a `❌ No liquidity data found` flag.
- **Ethplorer's `freekey` is rate-limited.** For production, [register for a free Ethplorer key](https://ethplorer.io/wallet/#register) and set `ETHPLORER_KEY` in `.env`.
- **Mock payments.** `/api/pay` accepts anything; replace with on-chain verification (e.g. `ethers.js` checking a tx hash against `PAYMENT_ADDRESS` and amount) before charging real money.
- **Burn-address concentration looks like rug risk.** SHIB's top holder is `0xdead…` holding 41 % — the analyzer flags it as concentration. Detecting known burn addresses is a follow-up.
- **Pattern scanner won't catch obfuscated dangerous functions** (delegate calls into a hidden implementation, function names shortened in assembly, etc.). It's a quick screen, not a formal audit.

---

## Example: full CLI output for USDC

```
$ node cli.js --token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48

📊 RISK SCORE: 0/100 [VERY_LOW]
   ✅ VERY LOW RISK - Excellent security profile.

📈 RISK BREAKDOWN:
   • Holder Concentration: 0
   • Contract Verification: -15
   • Dangerous Functions: 0
   • Liquidity: 0

👥 HOLDER DISTRIBUTION:
   • Total Holders: 6,874,784
   • Top Holder: 21.50%
   • Top 10: 27.87%
   • Gini Coefficient: 0.612

✅ CONTRACT VERIFICATION:
   ✅ Contract verified - Code is public (FiatTokenProxy)
   • Name: FiatTokenProxy
   • Compiler: v0.4.24+commit.e67f0147
```

---

## License

MIT.
