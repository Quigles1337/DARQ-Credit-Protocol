'use strict'

const xrpl = require('xrpl')
const fs = require('fs')
const path = require('path')
const { TESTNET_URL, LOAN_PARAMS } = require('./config')
const { initializeProtocol } = require('./flows/initialize')
const { overlenderDeposit, underlenderDeposit } = require('./flows/deposit')
const { borrowLoan } = require('./flows/borrow')
const { repayLoan } = require('./flows/repay')
const { liquidateLoan } = require('./flows/liquidate')
const { protocolSummary } = require('./flows/summary')

const STATE_FILE = path.join(__dirname, '..', 'protocol-state.json')

// ═══════════════════════════════════════════════════════════════
//  DARQ Credit Protocol v3 — Full Lifecycle Demo
//  AMM-Backed Overlender Architecture
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
  console.log('\u2588     DARQ CREDIT PROTOCOL v3 \u2014 AMM-BACKED OVERLENDER               \u2588')
  console.log('\u2588     P2P Credit Lending on XRPL Testnet (RLUSD denomination)        \u2588')
  console.log(`\u2588     Mode: ${mode.toUpperCase().padEnd(58)}\u2588`)
  console.log('\u2588                                                                    \u2588')
  console.log('\u2588     Overlender:  LP token collateral (XRP/RLUSD AMM)               \u2588')
  console.log('\u2588     Underlender: Direct RLUSD capital                               \u2588')
  console.log('\u2588     Repayment:   CheckCreate/CheckCash (RLUSD, forced pull)         \u2588')
  console.log('\u2588     Collateral:  Blackholed vault (LP tokens + standing offer)      \u2588')
  console.log('\u2588     Default:     AMMWithdraw 1-sided, 80/20 waterfall               \u2588')
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
    //    Fund 10 accounts, create RLUSD, create AMM,
    //    distribute LP tokens, set up trustlines
    // ═══════════════════════════════════════════
    const accounts = await initializeProtocol(client)

    // ═══════════════════════════════════════════
    // 2. LENDER DEPOSITS
    //    Overlenders: LP tokens → Originator
    //    Underlender: RLUSD → Originator
    // ═══════════════════════════════════════════
    console.log('')
    console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
    console.log('\u2551        FLOW 2: LENDER DEPOSITS                                    \u2551')
    console.log('\u2551        Overlender: LP tokens | Underlender: RLUSD                  \u2551')
    console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')

    await overlenderDeposit(client, accounts, accounts.overlender1, 'Overlender 1')
    await overlenderDeposit(client, accounts, accounts.overlender2, 'Overlender 2')
    await underlenderDeposit(client, accounts, accounts.underlender1, 'Underlender 1', LOAN_PARAMS.LOAN_AMOUNT_RLUSD)

    // ═══════════════════════════════════════════
    // 3. BORROWER TAKES A LOAN
    //    LP token vault + RLUSD lending + RLUSD Checks
    // ═══════════════════════════════════════════
    const loanDetails = await borrowLoan(client, accounts)

    // Save state for resumption
    const stateToSave = {}
    for (const [key, value] of Object.entries(accounts)) {
      if (key === '_ammInfo') {
        stateToSave[key] = value
      } else if (value && value.seed) {
        stateToSave[key] = { seed: value.seed, address: value.classicAddress }
      }
    }
    stateToSave.loanDetails = {
      ...loanDetails,
      allocations: loanDetails.allocations.map(a => ({
        ...a,
        wallet: a.wallet ? { seed: a.wallet.seed, address: a.wallet.classicAddress } : null
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
