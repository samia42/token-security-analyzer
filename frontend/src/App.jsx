import React, { useState } from 'react';
import './App.css';

const PRESETS = [
  { label: 'USDC', addr: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', hint: 'stablecoin' },
  { label: 'LINK', addr: '0x514910771AF9CA656af840dff83E8264EcF986CA', hint: 'clean baseline' },
  { label: 'SHIB', addr: '0x95aD61b0a150d79219dCF64E1E6Cc01F0B64C4cE', hint: 'thin V3 liquidity' },
  { label: 'Random', addr: '0x1234567890abcdef1234567890abcdef12345678', hint: 'unverified' },
];

export default function TokenAnalyzerDashboard() {
  const [tokenAddress, setTokenAddress] = useState('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const [expandedSection, setExpandedSection] = useState('holders');

  const analyzeToken = async () => {
    if (!tokenAddress.trim()) {
      setError('Enter a valid token address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Request payment
      const paymentRes = await fetch('http://localhost:3000/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 0.0002,
          currency: 'ETH',
          toolName: 'analyze_token_security'
        })
      });

      if (!paymentRes.ok) throw new Error('Payment failed');
      const payment = await paymentRes.json();
      const paymentId = payment.paymentId;

      // Step 2: Analyze with payment proof
      const analysisRes = await fetch(
        `http://localhost:3000/tools/analyze_token_security?token_address=${tokenAddress}&payment_id=${paymentId}`
      );

      if (!analysisRes.ok) throw new Error('Analysis failed');
      const result = await analysisRes.json();
      
      setAnalysis(result.data);
    } catch (err) {
      setError(err.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (score) => {
    if (score >= 80) return '#E24B4A';
    if (score >= 60) return '#BA7517';
    if (score >= 40) return '#EF9F27';
    if (score >= 20) return '#639922';
    return '#0F6E56';
  };

  const getRiskLevel = (score) => {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MODERATE';
    if (score >= 20) return 'LOW';
    return 'VERY_LOW';
  };

  return (
    <div className="container">
      <header className="header">
        <h1>🔍 Token Security Analyzer</h1>
        <p>Detect rug pulls before you trade</p>
      </header>

      <div className="search-section">
        <div className="search-box">
          <input
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !loading) analyzeToken(); }}
            placeholder="Enter token contract address (0x...)"
            className="input"
          />
          <button onClick={analyzeToken} disabled={loading} className="btn-primary">
            {loading ? (
              <span className="btn-loading">
                <span className="spinner" /> Analyzing
              </span>
            ) : 'Analyze Token'}
          </button>
        </div>
        <div className="presets">
          <span className="presets-label">Try:</span>
          {PRESETS.map((p) => (
            <button
              key={p.addr}
              className={`preset-chip ${tokenAddress.toLowerCase() === p.addr.toLowerCase() ? 'active' : ''}`}
              onClick={() => { setTokenAddress(p.addr); }}
              disabled={loading}
              title={p.hint}
            >
              {p.label}
              <span className="preset-hint">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="error-box">
          <span>❌ {error}</span>
        </div>
      )}

      {loading && !analysis && (
        <div className="loading-card">
          <div className="loading-row">
            <span className="loading-step">Fetching holder distribution from Ethplorer</span>
            <span className="dots"><span /><span /><span /></span>
          </div>
          <div className="loading-row">
            <span className="loading-step">Resolving proxy implementation + source on Etherscan</span>
            <span className="dots"><span /><span /><span /></span>
          </div>
          <div className="loading-row">
            <span className="loading-step">Scanning verified source for dangerous patterns</span>
            <span className="dots"><span /><span /><span /></span>
          </div>
          <div className="loading-row">
            <span className="loading-step">Probing Uniswap V3 pools on-chain</span>
            <span className="dots"><span /><span /><span /></span>
          </div>
        </div>
      )}

      {analysis && (
        <div className="results">
          {/* Risk Score Card */}
          <div className="risk-card">
            <div className="risk-header">
              <div className="risk-info">
                <h2>Risk Assessment</h2>
                <p className="risk-score" style={{ color: getRiskColor(analysis.riskScore) }}>
                  {analysis.riskScore}/100
                </p>
                <span className="risk-level" style={{ 
                  color: getRiskColor(analysis.riskScore),
                  borderColor: getRiskColor(analysis.riskScore)
                }}>
                  {analysis.riskLevel}
                </span>
              </div>
              <div className="risk-gauge">
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#e0e0e0" strokeWidth="8" />
                  <circle 
                    cx="60" 
                    cy="60" 
                    r="50" 
                    fill="none" 
                    stroke={getRiskColor(analysis.riskScore)} 
                    strokeWidth="8"
                    strokeDasharray={`${(analysis.riskScore / 100) * 314} 314`}
                    style={{ transition: 'stroke-dasharray 0.5s ease' }}
                  />
                  <text x="60" y="65" textAnchor="middle" fontSize="20" fontWeight="bold" fill={getRiskColor(analysis.riskScore)}>
                    {analysis.riskScore}
                  </text>
                </svg>
              </div>
            </div>
            <p className="recommendation">{analysis.recommendation}</p>
          </div>

          {/* Risk Breakdown */}
          <div className="breakdown-card">
            <h3>Risk Breakdown</h3>
            <div className="breakdown-items">
              <div className="breakdown-item">
                <span>Holder Concentration</span>
                <div className="bar">
                  <div className="fill" style={{ width: `${Math.min(analysis.riskBreakdown.holderConcentration, 100)}%`, background: '#0F6E56' }}></div>
                </div>
                <span className="value">{analysis.riskBreakdown.holderConcentration}</span>
              </div>
              <div className="breakdown-item">
                <span>Contract Verification</span>
                <div className="bar">
                  <div className="fill" style={{ width: `${Math.max(0, Math.min(analysis.riskBreakdown.contractVerification, 100))}%`, background: analysis.riskBreakdown.contractVerification < 0 ? '#0F6E56' : '#BA7517' }}></div>
                </div>
                <span className="value">{analysis.riskBreakdown.contractVerification}</span>
              </div>
              <div className="breakdown-item">
                <span>Dangerous Functions</span>
                <div className="bar">
                  <div className="fill" style={{ width: `${Math.min(analysis.riskBreakdown.dangerousFunctions, 100)}%`, background: '#0F6E56' }}></div>
                </div>
                <span className="value">{analysis.riskBreakdown.dangerousFunctions}</span>
              </div>
              <div className="breakdown-item">
                <span>Liquidity</span>
                <div className="bar">
                  <div className="fill" style={{ width: `${Math.min(analysis.riskBreakdown.liquidity, 100)}%`, background: '#0F6E56' }}></div>
                </div>
                <span className="value">{analysis.riskBreakdown.liquidity}</span>
              </div>
            </div>
          </div>

          {/* Analysis Details */}
          <div className="analysis-sections">
            {/* Holders Section */}
            <div className="section-card">
              <button 
                className="section-header"
                onClick={() => setExpandedSection(expandedSection === 'holders' ? null : 'holders')}
              >
                <span>👥 Holder Distribution</span>
                <span className={`arrow ${expandedSection === 'holders' ? 'open' : ''}`}>▼</span>
              </button>
              {expandedSection === 'holders' && (
                <div className="section-content">
                  {(() => {
                    const m = analysis.analysis.holders.metrics;
                    const fmt = (v, suffix = '') => v == null ? '—' : `${v}${suffix}`;
                    return (
                      <div className="metrics-grid">
                        <div className="metric">
                          <span className="label">Total Holders</span>
                          <span className="value">{m.totalHolders == null ? '—' : m.totalHolders.toLocaleString()}</span>
                        </div>
                        <div className="metric">
                          <span className="label">Top Holder</span>
                          <span className="value">{fmt(m.topHolder?.percentage, '%')}</span>
                        </div>
                        <div className="metric">
                          <span className="label">Top 10</span>
                          <span className="value">{fmt(m.top10Percentage, '%')}</span>
                        </div>
                        <div className="metric">
                          <span className="label">Gini Coeff.</span>
                          <span className="value">{fmt(m.giniCoefficient)}</span>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flags">
                    {analysis.analysis.holders.flags.map((flag, i) => (
                      <div key={i} className="flag">{flag}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Contract Verification */}
            <div className="section-card">
              <button 
                className="section-header"
                onClick={() => setExpandedSection(expandedSection === 'contract' ? null : 'contract')}
              >
                <span>✅ Contract Verification</span>
                <span className={`arrow ${expandedSection === 'contract' ? 'open' : ''}`}>▼</span>
              </button>
              {expandedSection === 'contract' && (
                <div className="section-content">
                  <div className="status" style={{ color: analysis.analysis.contractVerified.error ? '#991b1b' : (analysis.analysis.contractVerified.verified ? '#0F6E56' : '#BA7517') }}>
                    {analysis.analysis.contractVerified.flag}
                  </div>
                  {!analysis.analysis.contractVerified.error && analysis.analysis.contractVerified.contractName && (
                    <div className="metrics-grid">
                      <div className="metric">
                        <span className="label">Contract Name</span>
                        <span className="value">{analysis.analysis.contractVerified.contractName}</span>
                      </div>
                      <div className="metric">
                        <span className="label">Compiler</span>
                        <span className="value">{analysis.analysis.contractVerified.compilerVersion}</span>
                      </div>
                      <div className="metric">
                        <span className="label">Verified</span>
                        <span className="value">{analysis.analysis.contractVerified.verified ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                  )}
                  {analysis.analysis.contractVerified.isProxy && analysis.analysis.contractVerified.implementation && (
                    <div className="proxy-info">
                      <div className="proxy-label">Proxy → implementation</div>
                      <div className="proxy-row">
                        <span className="proxy-kind">{analysis.analysis.contractVerified.proxyKind}</span>
                        <span className="proxy-name">{analysis.analysis.contractVerified.implementation.contractName || 'Unknown'}</span>
                        <span className="proxy-addr">
                          {analysis.analysis.contractVerified.implementation.address.slice(0, 8)}…{analysis.analysis.contractVerified.implementation.address.slice(-6)}
                        </span>
                        <span className="proxy-verified" style={{ color: analysis.analysis.contractVerified.implementation.verified ? '#0F6E56' : '#BA7517' }}>
                          {analysis.analysis.contractVerified.implementation.verified ? '✓ verified' : '⚠ not verified'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Dangerous Functions */}
            <div className="section-card">
              <button 
                className="section-header"
                onClick={() => setExpandedSection(expandedSection === 'functions' ? null : 'functions')}
              >
                <span>⚠️ Dangerous Functions</span>
                <span className={`arrow ${expandedSection === 'functions' ? 'open' : ''}`}>▼</span>
              </button>
              {expandedSection === 'functions' && (
                <div className="section-content">
                  <div className="status" style={{ color: analysis.analysis.dangerousFunctions.error ? '#991b1b' : '#374151' }}>
                    {analysis.analysis.dangerousFunctions.error
                      ? analysis.analysis.dangerousFunctions.flags[0]
                      : `${analysis.analysis.dangerousFunctions.totalFound} pattern${analysis.analysis.dangerousFunctions.totalFound === 1 ? '' : 's'} matched`}
                  </div>
                  {analysis.analysis.dangerousFunctions.confidence && (
                    <div className="confidence-badge">
                      <span className="confidence-tag">confidence: {analysis.analysis.dangerousFunctions.confidence}</span>
                      {analysis.analysis.dangerousFunctions.disclaimer && (
                        <div className="confidence-text">{analysis.analysis.dangerousFunctions.disclaimer}</div>
                      )}
                    </div>
                  )}
                  <div className="flags">
                    {analysis.analysis.dangerousFunctions.flags.map((flag, i) => (
                      <div key={i} className="flag">{flag}</div>
                    ))}
                  </div>
                  {!analysis.analysis.dangerousFunctions.error && analysis.analysis.dangerousFunctions.functions.length > 0 && (
                    <div className="functions-list">
                      {analysis.analysis.dangerousFunctions.functions.map((func, i) => (
                        <div key={i} className="function-item">
                          <span className="type">{func.type}</span>
                          <span className="severity">{func.severity}</span>
                          <span className="description">{func.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Liquidity */}
            <div className="section-card">
              <button 
                className="section-header"
                onClick={() => setExpandedSection(expandedSection === 'liquidity' ? null : 'liquidity')}
              >
                <span>💧 Liquidity Analysis</span>
                <span className={`arrow ${expandedSection === 'liquidity' ? 'open' : ''}`}>▼</span>
              </button>
              {expandedSection === 'liquidity' && (
                <div className="section-content">
                  {analysis.analysis.liquidity.error ? (
                    <div className="status" style={{ color: '#991b1b' }}>
                      {analysis.analysis.liquidity.flags[0]}
                    </div>
                  ) : analysis.analysis.liquidity.hasLiquidity ? (
                    <>
                      <div className="metrics-grid">
                        <div className="metric">
                          <span className="label">Total Liquidity</span>
                          <span className="value">
                            {analysis.analysis.liquidity.totalLiquidity >= 1_000_000
                              ? `$${(analysis.analysis.liquidity.totalLiquidity / 1_000_000).toFixed(1)}M`
                              : `$${analysis.analysis.liquidity.totalLiquidity.toLocaleString()}`}
                          </span>
                        </div>
                        <div className="metric">
                          <span className="label">Pools</span>
                          <span className="value">{analysis.analysis.liquidity.pools.length}</span>
                        </div>
                        {analysis.analysis.liquidity.ethPriceUsd && (
                          <div className="metric">
                            <span className="label">ETH price</span>
                            <span className="value">${Math.round(analysis.analysis.liquidity.ethPriceUsd).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                      <div className="flags">
                        {analysis.analysis.liquidity.flags.map((flag, i) => (
                          <div key={i} className="flag">{flag}</div>
                        ))}
                      </div>
                      {analysis.analysis.liquidity.pools.length > 0 && (
                        <div className="pools-table">
                          <table>
                            <thead>
                              <tr>
                                <th>Pair</th>
                                <th>Pool TVL</th>
                                <th>Fee</th>
                              </tr>
                            </thead>
                            <tbody>
                              {analysis.analysis.liquidity.pools.map((pool, i) => {
                                const tvl = pool.estimatedTvlUsd;
                                const tvlStr = tvl == null
                                  ? '—'
                                  : tvl >= 1_000_000
                                    ? `$${(tvl / 1_000_000).toFixed(2)}M`
                                    : tvl >= 1_000
                                      ? `$${(tvl / 1_000).toFixed(1)}k`
                                      : `$${tvl.toLocaleString()}`;
                                return (
                                  <tr key={i}>
                                    <td>TOKEN / {pool.token1}</td>
                                    <td>{tvlStr}</td>
                                    <td>{pool.feeLabel || `${pool.fee} bps`}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="status" style={{ color: '#BA7517' }}>
                      No significant liquidity found
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Cost Section */}
          <div className="cost-card">
            <span>💳 Analysis Cost: 0.0002 ETH (~$0.50)</span>
            <span>📊 ROI: Prevents ~$500+ losses</span>
          </div>
        </div>
      )}
    </div>
  );
}