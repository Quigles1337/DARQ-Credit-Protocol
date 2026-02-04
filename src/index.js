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

function saveState(state) {
  // Serialize wallets to seed + address for persistence
  const serialized = {}
  for (const [key, value] of Object.entries(state)) {
    if (value && value.seed && value.classicAddress) {
      serialized[key] = { seed: value.seed, address: value.classicAddress }
    } else {
      serialized[key] = value
    }
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(serialized, null, 2))
  console.log(`  State saved to ${STATE_FILE}`)
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return null
  const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  // Reconstitute wallets from seeds
  const state = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value && value.seed) {
      state[key] = xrpl.Wallet.fromSeed(value.seed)
    } else {
      state[key] = value
    }
  }
  return state
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
        await lenderDeposit(client, accounts, accounts.lenderConservative, POOL_TIERS.CONSERVATIVE.deposit, 'CONSERVATIVE', POOL_TIERS.CONSERVATIVE.rate)
        await lenderDeposit(client, accounts, accounts.lenderBalanced, POOL_TIERS.BALANCED.deposit, 'BALANCED', POOL_TIERS.BALANCED.rate)
        await lenderDeposit(client, accounts, accounts.lenderAggressive, POOL_TIERS.AGGRESSIVE.deposit, 'AGGRESSIVE', POOL_TIERS.AGGRESSIVE.rate)
        break
      }
      case 'borrow': {
        const accounts = loadState()
        if (!accounts) { console.error('  Run "init" first'); break }
        const loanDetails = await borrowLoan(client, accounts, 45, 90)
        // Save loan details alongside accounts
        const fullState = { ...accounts }
        fs.writeFileSync(STATE_FILE, JSON.stringify({
          ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')),
          loanDetails
        }, null, 2))
        break
      }
      case 'repay': {
        const accounts = loadState()
        if (!accounts) { console.error('  Run "init" first'); break }
        const rawState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
        if (!rawState.loanDetails) { console.error('  Run "borrow" first'); break }
        // Reconstitute wallet refs in loanDetails
        const loanDetails = rawState.loanDetails
        for (const alloc of loanDetails.allocations) {
          if (alloc.lender === 'CONSERVATIVE') alloc.wallet = accounts.lenderConservative
          if (alloc.lender === 'BALANCED') alloc.wallet = accounts.lenderBalanced
          if (alloc.lender === 'AGGRESSIVE') alloc.wallet = accounts.lenderAggressive
        }
        await repayLoan(client, accounts, loanDetails)
        break
      }
      case 'liquidate': {
        const accounts = loadState()
        if (!accounts) { console.error('  Run "init" first'); break }
        const rawState2 = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
        if (!rawState2.loanDetails) { console.error('  Run "borrow" first'); break }
        const loanDetails2 = rawState2.loanDetails
        for (const alloc of loanDetails2.allocations) {
          if (alloc.lender === 'CONSERVATIVE') alloc.wallet = accounts.lenderConservative
          if (alloc.lender === 'BALANCED') alloc.wallet = accounts.lenderBalanced
          if (alloc.lender === 'AGGRESSIVE') alloc.wallet = accounts.lenderAggressive
        }
        await liquidateLoan(client, accounts, loanDetails2)
        break
      }
      default:
        console.log('  Usage: node src/index.js <init|deposit|borrow|repay|liquidate>')
    }
  } finally {
    await client.disconnect()
    console.log('  Disconnected from XRPL Testnet')
  }
}

const command = process.argv[2] || 'init'
runCommand(command).catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
