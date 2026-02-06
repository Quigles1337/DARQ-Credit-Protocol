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

function saveState(accounts, extra) {
  const serialized = {}
  for (const [key, value] of Object.entries(accounts)) {
    if (key === '_ammInfo') {
      serialized[key] = value
    } else if (value && value.seed && value.classicAddress) {
      serialized[key] = { seed: value.seed, address: value.classicAddress }
    } else {
      serialized[key] = value
    }
  }
  if (extra) {
    Object.assign(serialized, extra)
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(serialized, null, 2))
  console.log(`  State saved to ${STATE_FILE}`)
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return null
  const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  const state = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === '_ammInfo') {
      state[key] = value
    } else if (value && value.seed) {
      state[key] = xrpl.Wallet.fromSeed(value.seed)
    } else {
      state[key] = value
    }
  }
  return state
}

function reconstituteLoanDetails(rawState, accounts) {
  const loanDetails = rawState.loanDetails
  if (!loanDetails) return null
  for (const alloc of loanDetails.allocations) {
    if (alloc.name === 'Overlender 1') alloc.wallet = accounts.overlender1
    else if (alloc.name === 'Overlender 2') alloc.wallet = accounts.overlender2
    else if (alloc.name === 'Underlender 1') alloc.wallet = accounts.underlender1
  }
  if (!loanDetails.ammInfo && accounts._ammInfo) {
    loanDetails.ammInfo = accounts._ammInfo
  }
  return loanDetails
}

async function runCommand(command) {
  const client = new xrpl.Client(TESTNET_URL)
  await client.connect()
  console.log(`  Connected to XRPL Testnet`)
  console.log('')

  try {
    switch (command) {
      case 'init': {
        const accounts = await initializeProtocol(client)
        saveState(accounts)
        break
      }
      case 'deposit': {
        const accounts = loadState()
        if (!accounts) { console.error('  Run "init" first'); break }
        await overlenderDeposit(client, accounts, accounts.overlender1, 'Overlender 1')
        await overlenderDeposit(client, accounts, accounts.overlender2, 'Overlender 2')
        await underlenderDeposit(client, accounts, accounts.underlender1, 'Underlender 1', LOAN_PARAMS.LOAN_AMOUNT_RLUSD)
        break
      }
      case 'borrow': {
        const accounts = loadState()
        if (!accounts) { console.error('  Run "init" first'); break }
        const loanDetails = await borrowLoan(client, accounts)
        const serializedAllocations = loanDetails.allocations.map(a => ({
          ...a,
          wallet: a.wallet ? { seed: a.wallet.seed, address: a.wallet.classicAddress } : null
        }))
        saveState(accounts, { loanDetails: { ...loanDetails, allocations: serializedAllocations } })
        break
      }
      case 'repay': {
        const accounts = loadState()
        if (!accounts) { console.error('  Run "init" first'); break }
        const rawState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
        const loanDetails = reconstituteLoanDetails(rawState, accounts)
        if (!loanDetails) { console.error('  Run "borrow" first'); break }
        await repayLoan(client, accounts, loanDetails)
        break
      }
      case 'liquidate': {
        const accounts = loadState()
        if (!accounts) { console.error('  Run "init" first'); break }
        const rawState2 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
        const loanDetails2 = reconstituteLoanDetails(rawState2, accounts)
        if (!loanDetails2) { console.error('  Run "borrow" first'); break }
        await liquidateLoan(client, accounts, loanDetails2)
        break
      }
      case 'summary': {
        const accounts = loadState()
        if (!accounts) { console.error('  Run "init" first'); break }
        const rawState3 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
        const loanDetails3 = reconstituteLoanDetails(rawState3, accounts)
        await protocolSummary(client, accounts, loanDetails3)
        break
      }
      default:
        console.log('  DARQ Credit Protocol v3 — AMM-Backed Overlender Architecture')
        console.log('')
        console.log('  Usage: node src/index.js <command>')
        console.log('')
        console.log('  Commands:')
        console.log('    init       - Initialize protocol (10 accounts, RLUSD, AMM, trustlines)')
        console.log('    deposit    - Overlender LP token + Underlender RLUSD deposits')
        console.log('    borrow     - Originate loan (LP vault, RLUSD lending, Checks)')
        console.log('    repay      - Happy path (CheckCash + LP token return)')
        console.log('    liquidate  - Default path (AMMWithdraw + 80/20 waterfall)')
        console.log('    summary    - Show final protocol state')
    }
  } finally {
    await client.disconnect()
    console.log('  Disconnected from XRPL Testnet')
  }
}

const command = process.argv[2] || ''
runCommand(command).catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
