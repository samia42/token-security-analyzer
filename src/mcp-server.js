/**
 * MCP Server for Token Security Analyzer
 *
 * Uses the official @modelcontextprotocol/sdk with stdio transport.
 * Compatible with Claude Desktop and any other MCP client.
 *
 * Register in Claude Desktop config (~/Library/Application Support/Claude/claude_desktop_config.json):
 *
 *   {
 *     "mcpServers": {
 *       "token-security": {
 *         "command": "node",
 *         "args": ["<absolute-path>/src/mcp-server.js"],
 *         "env": { "ETHERSCAN_KEY": "<your-key>" }
 *       }
 *     }
 *   }
 */

import 'dotenv/config.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { analyzeTokenSecurity } from './tools/analyzeTokenSecurity.js';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const server = new McpServer({
  name: 'token-security-analyzer',
  version: '1.0.0',
});

server.registerTool(
  'analyze_token_security',
  {
    title: 'Analyze Token Security',
    description:
      'Analyze an ERC-20 token for rug-pull risks. Checks holder concentration, contract verification, dangerous functions, and liquidity. Returns a 0-100 risk score with a breakdown.',
    inputSchema: {
      token_address: z
        .string()
        .regex(ADDRESS_RE, 'Must be a 0x-prefixed 40-hex-character Ethereum address'),
    },
  },
  async ({ token_address }) => {
    const analysis = await analyzeTokenSecurity(token_address);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: !analysis.error,
              data: analysis,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

// stdout is reserved for the MCP protocol; log to stderr only.
console.error('[MCP] Token Security Analyzer ready on stdio');
