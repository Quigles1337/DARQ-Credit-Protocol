'use strict'

// ═══════════════════════════════════════════════════════════════
//  DARQ Credit Protocol v3 — Configuration
//  AMM-Backed Overlender Architecture
//  Facilitator with Overlender (LP tokens) + Underlender (RLUSD)
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
  RLUSD:    encodeCurrencyCode('RLUSD'),
  // LP token currency code is determined at runtime after AMMCreate
  // It uses a special 0x03 prefix format assigned by the AMM
}

// AMM configuration (testnet-sized — faucet gives ~100 XRP per account)
const AMM_CONFIG = {
  INITIAL_XRP: 50,            // XRP seeded into AMM pool
  INITIAL_RLUSD: 125,         // RLUSD seeded into AMM pool ($2.50/XRP peg)
  OVERLENDER_DEPOSIT_XRP: 15, // XRP deposited by each overlender into AMM
  OVERLENDER_DEPOSIT_RLUSD: 38, // RLUSD deposited by each overlender into AMM
}

// Overlender / Underlender split
const LENDER_SPLIT = {
  OVERLENDER_SHARE: 0.50,     // 50% of loan backed by LP token collateral
  UNDERLENDER_SHARE: 0.50,    // 50% of loan provided as direct RLUSD
}

// Default loss absorption
const DEFAULT_SPLIT = {
  UNDERLENDER_LOSS: 0.80,     // Underlender absorbs 80% of default amount
  OVERLENDER_LOSS: 0.20,      // Overlender absorbs 20% of default amount
}

// Loan parameters (testnet — short durations for demo)
const LOAN_PARAMS = {
  LOAN_AMOUNT_RLUSD: 50,          // Loan amount in RLUSD
  COLLATERAL_RATIO: 2.0,          // 200% overcollateralization (LP token value)
  MATURITY_SECONDS: 90,           // Escrow maturity (testnet: 90s)
  EXPIRY_SECONDS: 180,            // Escrow cancel-after (testnet: 180s)
  LIQUIDATION_READY_SECONDS: 30,  // Liquidation trigger FinishAfter
  CHECK_GRACE_SECONDS: 60,        // Extra time on Check expiration
  LIQUIDATION_TRIGGER_XRP: 5,     // XRP in liquidation trigger escrow
  INITIAL_CREDIT_SCORE: 700,
  REPAY_SCORE_BONUS: 50,
  LIQUIDATION_SCORE_PENALTY: 100,
  ORIGINATION_FEE_RLUSD: 1,       // Flat origination fee in RLUSD
  XRP_USD_PRICE: 2.50,            // Oracle price
  LIQUIDATION_XRP_USD_PRICE: 1.00, // Crash price for liquidation demo
  LIQUIDATION_THRESHOLD: 1.20,    // 120% — below this triggers liquidation
  OVERLENDER_RATE: 0.03,          // 3% APR for overlender
  UNDERLENDER_RATE: 0.06,         // 6% APR for underlender (higher risk = higher yield)
}

// Blackhole address — XRPL well-known unspendable address
const BLACKHOLE_ADDRESS = 'rrrrrrrrrrrrrrrrrrrrBZbvji'

// Account structure (populated during initialization)
const ACCOUNTS = {
  protocolIssuer:   null,   // Originator — issues tokens, crosses vault, distributes
  rlusdIssuer:      null,   // Separate RLUSD stablecoin issuer
  ammBootstrapper:  null,   // Seeds the initial AMM pool
  overlender1:      null,   // LP token depositor
  overlender2:      null,   // LP token depositor
  underlender1:     null,   // Direct RLUSD lender
  borrower:         null,
}

module.exports = {
  RIPPLE_EPOCH_OFFSET,
  TESTNET_URL,
  CURRENCIES,
  AMM_CONFIG,
  LENDER_SPLIT,
  DEFAULT_SPLIT,
  LOAN_PARAMS,
  BLACKHOLE_ADDRESS,
  ACCOUNTS,
  encodeCurrencyCode,
}
