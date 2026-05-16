/**
 * Pricing Engine
 * Calculates service costs and generates HTTP 402 responses
 */

const TOOL_COSTS = {
  'analyze_token_security': 0.0002  // ETH (cost of multiple Etherscan API calls)
};

export function calculateCost(toolName) {
  return TOOL_COSTS[toolName] || 0.0001;
}

export function buildHTTP402Response(toolName, cost) {
  return {
    status: 402,
    headers: {
      'X-Price': cost.toString(),
      'X-Price-Currency': 'ETH',
      'X-Service': 'Token-Security-Analyzer',
      'Content-Type': 'application/json'
    },
    body: {
      error: 'payment_required',
      message: 'This service requires payment to execute',
      price: cost,
      currency: 'ETH',
      toolName,
      paymentAddress: process.env.PAYMENT_ADDRESS || '0x0000000000000000000000000000000000000000',
      details: `This ${toolName} call costs ${cost} ETH to execute (Etherscan API + RPC calls)`
    }
  };
}

export function buildSuccessResponse(toolName, data, cost) {
  return {
    status: 200,
    headers: {
      'X-Cost': cost.toString(),
      'X-Cost-Currency': 'ETH',
      'Content-Type': 'application/json'
    },
    body: {
      success: true,
      tool: toolName,
      data,
      cost: {
        amount: cost,
        currency: 'ETH',
        reason: 'Etherscan API + computation'
      }
    }
  };
}

// Mock payment validation (for demo - always returns false to show 402 flow)
export function validatePayment(toolName, paymentProof) {
  // In production, verify actual blockchain payment here
  // For demo, always require payment
  return false;
}