'use strict'

const xrpl = require('xrpl')
const fs = require('fs')
const path = require('path')
const { TESTNET_URL, POOL_TIERS } = require('./config')
const { initializeProtocol } = require('./flows/initialize')
const { lenderDeposit } = require('./flows/deposit')
const { borrowLoan } = require('./flows/borrow')
const { repayLoan } = require('./flows/repay')
const { liquidateLoan } = require('./flows/liquidate')
const { protocolSummary } = require('./flows/summary')

const STATE_FILE = path.join(__dirname, '..', 'protocol-state.json')

// ═══════════════════════════════════════════════════════════════
//  DARQ Credit Protocol v2 — Full Lifecycle Demo
//  Usage:
//    node src/demo.js repay       # Happy path: borrow + repay
//    node src/demo.js liquidate   # Default path: borrow + liquidation
// ═══════════════════════════════════════════════════════════════

async function main() {
  const mode = (process.argv[2] || 'repay').toLowerCase()

  if (!['repay', 'liquidate'].includes(mode)) {
    console.log('Usage: node src/demo.js <repay|liquidate>')
    console.log('  repay     - Full lifecycle ending with successful repayment')
    console.log('  liquidate - Full lifecycle ending with borrower default')
    process.exit(1)
  }

  console.log('')
  console.log('\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588')
  console.log('\u2588                                                                    \u2588')
  console.log('\u2588     DARQ CREDIT PROTOCOL v2 \u2014 FACILITATOR ARCHITECTURE             \u2588')
  console.log('\u2588     P2P Credit Lending on XRPL Testnet                             \u2588')
  console.log(`\u2588     Mode: ${mode.toUpperCase().padEnd(58)}\u2588`)
  console.log('\u2588                                                                    \u2588')
  console.log('\u2588     Capital intermediary: NONE                                     \u2588')
  console.log('\u2588     Repayment mechanism:  CheckCreate/CheckCash (forced pull)       \u2588')
  console.log('\u2588     Collateral custody:   Blackholed vault (immutable)              \u2588')
  console.log('\u2588                                                                    \u2588')
  console.log('\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588')
  console.log('')

  const client = new xrpl.Client(TESTNET_URL)
  await client.connect()
  console.log('  Connected to XRPL Testnet')
  console.log(`  Network: ${TESTNET_URL}`)
  console.log('')

  try {
    // ═══════════════════════════════════════════
    // 1. INITIALIZE PROTOCOL
    // ═══════════════════════════════════════════
    const accounts = await initializeProtocol(client)

    // ═══════════════════════════════════════════
    // 2. REGISTER LENDERS IN THREE POOLS
    // ═══════════════════════════════════════════
    console.log('')
    console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
    console.log('\u2551        FLOW 2: LENDER DEPOSITS (3 POOLS)                          \u2551')
    console.log('\u2551        XRP stays in lender accounts \u2014 no capital transfer         \u2551')
    console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')

    await lenderDeposit(client, accounts, accounts.lenderConservative,
      POOL_TIERS.CONSERVATIVE.deposit, 'CONSERVATIVE', POOL_TIERS.CONSERVATIVE.rate)
    await lenderDeposit(client, accounts, accounts.lenderBalanced,
      POOL_TIERS.BALANCED.deposit, 'BALANCED', POOL_TIERS.BALANCED.rate)
    await lenderDeposit(client, accounts, accounts.lenderAggressive,
      POOL_TIERS.AGGRESSIVE.deposit, 'AGGRESSIVE', POOL_TIERS.AGGRESSIVE.rate)

    // ═══════════════════════════════════════════
    // 3. BORROWER TAKES A LOAN
    // ═══════════════════════════════════════════
    const loanDetails = await borrowLoan(client, accounts, 45, 90)

    // Save state (deep clone to avoid mutating loanDetails)
    const stateToSave = {}
    for (const [key, wallet] of Object.entries(accounts)) {
      stateToSave[key] = { seed: wallet.seed, address: wallet.classicAddress }
    }
    stateToSave.loanDetails = {
      ...loanDetails,
      allocations: loanDetails.allocations.map(a => ({
        ...a,
        wallet: { seed: a.wallet.seed, address: a.wallet.classicAddress }
      }))
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2))

    // ═══════════════════════════════════════════
    // 4. REPAY OR LIQUIDATE
    // ═══════════════════════════════════════════
    if (mode === 'repay') {
      await repayLoan(client, accounts, loanDetails)
    } else {
      await liquidateLoan(client, accounts, loanDetails)
    }

    // ═══════════════════════════════════════════
    // 5. PROTOCOL SUMMARY
    // ═══════════════════════════════════════════
    await protocolSummary(client, accounts, loanDetails)

  } finally {
    await client.disconnect()
    console.log('  Disconnected from XRPL Testnet')
    console.log('')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
