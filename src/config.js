'use strict'

// ═══════════════════════════════════════════════════════════════
//  DARQ Credit Protocol v2 — Configuration
//  Facilitator Architecture: Protocol holds NO capital
// ═══════════════════════════════════════════════════════════════

const RIPPLE_EPOCH_OFFSET = 946684800

const TESTNET_URL = 'wss://s.altnet.rippletest.net:51233'

// Currency code encoding — >3 chars must be hex-encoded to 40 hex chars
function encodeCurrencyCode(code) {
  if (code.length <= 3) return code
  return Buffer.from(code).toString('hex').toUpperCase().padEnd(40, '0')
}

const CURRENCIES = {
  dCREDIT:  encodeCurrencyCode('dCREDIT'),
  dRECEIPT: encodeCurrencyCode('dRECEIPT'),
  dSCORE:   encodeCurrencyCode('dSCORE'),
}

// Pool tier definitions
const POOL_TIERS = {
  CONSERVATIVE: { name: 'CONSERVATIVE', label: 'Low-Risk Pool',  rate: 0.03, deposit: 20 },
  BALANCED:     { name: 'BALANCED',     label: 'Mid-Risk Pool',  rate: 0.05, deposit: 30 },
  AGGRESSIVE:   { name: 'AGGRESSIVE',   label: 'High-Risk Pool', rate: 0.08, deposit: 15 },
}

// Loan parameters (testnet — short durations for demo)
const LOAN_PARAMS = {
  COLLATERAL_RATIO: 2.0,           // 200% collateralization
  COLLATERAL_RETURN_FRACTION: 0.60, // 60% of collateral in hash-locked escrow
  LIQUIDATION_TRIGGER_XRP: 5,       // XRP in liquidation trigger escrow
  MATURITY_SECONDS: 90,             // Escrow maturity (testnet: 90s)
  EXPIRY_SECONDS: 180,              // Escrow cancel-after (testnet: 180s)
  LIQUIDATION_READY_SECONDS: 30,    // Liquidation trigger escrow FinishAfter
  CHECK_GRACE_SECONDS: 60,          // Extra time on Check expiration beyond maturity
  INITIAL_CREDIT_SCORE: 700,
  REPAY_SCORE_BONUS: 50,
  LIQUIDATION_SCORE_PENALTY: 100,
  ORIGINATION_FEE_XRP: 0.5,         // Flat origination fee
  XRP_USD_PRICE: 2.50,              // Initial oracle price
  LIQUIDATION_XRP_USD_PRICE: 1.00,  // Crash price for liquidation demo
  LIQUIDATION_THRESHOLD: 1.20,      // 120% — below this triggers liquidation
}

// Blackhole address — XRPL well-known unspendable address
const BLACKHOLE_ADDRESS = 'rrrrrrrrrrrrrrrrrrrrBZbvji'

// Account structure (populated during initialization)
const ACCOUNTS = {
  protocolIssuer:     null,
  liquidationEngine:  null,
  treasury:           null,
  oracleCommittee:    null,
  lenderConservative: null,
  lenderBalanced:     null,
  lenderAggressive:   null,
  borrower:           null,
}

module.exports = {
  RIPPLE_EPOCH_OFFSET,
  TESTNET_URL,
  CURRENCIES,
  POOL_TIERS,
  LOAN_PARAMS,
  BLACKHOLE_ADDRESS,
  ACCOUNTS,
  encodeCurrencyCode,
}
