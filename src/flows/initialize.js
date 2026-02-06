'use strict'

const xrpl = require('xrpl')
const { CURRENCIES, AMM_CONFIG, LOAN_PARAMS } = require('../config')
const { submitTx, getLedgerTime } = require('../utils/tx')
const { createAMM, ammDeposit, getLPTokenBalance } = require('../utils/amm')
const { getTokenBalance } = require('../utils/state')

// ═══════════════════════════════════════════════════════════════
//  FLOW 1: initializeProtocol() — ~35 transactions
//  Sets up all accounts, RLUSD token, XRP/RLUSD AMM,
//  LP token distribution, trustlines.
// ═══════════════════════════════════════════════════════════════

async function initializeProtocol(client) {
  console.log('')
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('\u2551        FLOW 1: INITIALIZE PROTOCOL (AMM + OVERLENDER)             \u2551')
  console.log('\u2551        RLUSD stablecoin + XRP/RLUSD AMM + LP tokens               \u2551')
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  // ─── Step 1: Fund all 7 accounts ───
  console.log('  Step 1: Funding accounts via testnet faucet...')
  const accountNames = [
    'protocolIssuer', 'rlusdIssuer', 'ammBootstrapper',
    'overlender1', 'overlender2', 'underlender1', 'borrower'
  ]

  const accounts = {}
  for (const name of accountNames) {
    const funded = await client.fundWallet()
    accounts[name] = funded.wallet
    console.log(`  [\u2713] ${name.padEnd(22)} ${funded.wallet.classicAddress}`)
  }
  console.log('')

  // ─── Step 2: Configure RLUSD Issuer ───
  console.log('  Step 2: Configuring RLUSD Issuer...')

  // Enable Default Ripple (required for token transfers)
  await submitTx(client, accounts.rlusdIssuer, {
    TransactionType: 'AccountSet',
    Account: accounts.rlusdIssuer.classicAddress,
    SetFlag: 8 // asfDefaultRipple
  }, 'RLUSD Issuer: Enable Default Ripple')

  // Enable Clawback (for enforcement)
  await submitTx(client, accounts.rlusdIssuer, {
    TransactionType: 'AccountSet',
    Account: accounts.rlusdIssuer.classicAddress,
    SetFlag: 16 // asfAllowTrustLineClawback
  }, 'RLUSD Issuer: Enable Clawback')

  console.log('')

  // ─── Step 3: Configure Protocol Issuer ───
  console.log('  Step 3: Configuring Protocol Issuer (Originator)...')

  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'AccountSet',
    Account: accounts.protocolIssuer.classicAddress,
    SetFlag: 16 // asfAllowTrustLineClawback
  }, 'Protocol Issuer: Enable Clawback')

  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'AccountSet',
    Account: accounts.protocolIssuer.classicAddress,
    SetFlag: 8 // asfDefaultRipple
  }, 'Protocol Issuer: Enable Default Ripple')
  console.log('')

  // ─── Step 4: Establish RLUSD trustlines ───
  console.log('  Step 4: Establishing RLUSD trustlines...')

  const rlusdTrustAccounts = [
    'ammBootstrapper', 'overlender1', 'overlender2', 'underlender1',
    'borrower', 'protocolIssuer'
  ]
  for (const name of rlusdTrustAccounts) {
    await submitTx(client, accounts[name], {
      TransactionType: 'TrustSet',
      Account: accounts[name].classicAddress,
      LimitAmount: {
        currency: CURRENCIES.RLUSD,
        issuer: accounts.rlusdIssuer.classicAddress,
        value: '10000000'
      }
    }, `${name}: TrustSet RLUSD`)
  }
  console.log('')

  // ─── Step 5: Issue RLUSD to participants ───
  console.log('  Step 5: Issuing RLUSD to participants...')

  // AMM bootstrapper gets enough to seed the pool
  await submitTx(client, accounts.rlusdIssuer, {
    TransactionType: 'Payment',
    Account: accounts.rlusdIssuer.classicAddress,
    Destination: accounts.ammBootstrapper.classicAddress,
    Amount: {
      currency: CURRENCIES.RLUSD,
      issuer: accounts.rlusdIssuer.classicAddress,
      value: String(AMM_CONFIG.INITIAL_RLUSD)
    }
  }, `RLUSD Issuer: Issue ${AMM_CONFIG.INITIAL_RLUSD} RLUSD to AMM Bootstrapper`)

  // Overlenders get RLUSD for AMM deposits
  for (const name of ['overlender1', 'overlender2']) {
    await submitTx(client, accounts.rlusdIssuer, {
      TransactionType: 'Payment',
      Account: accounts.rlusdIssuer.classicAddress,
      Destination: accounts[name].classicAddress,
      Amount: {
        currency: CURRENCIES.RLUSD,
        issuer: accounts.rlusdIssuer.classicAddress,
        value: String(AMM_CONFIG.OVERLENDER_DEPOSIT_RLUSD)
      }
    }, `RLUSD Issuer: Issue ${AMM_CONFIG.OVERLENDER_DEPOSIT_RLUSD} RLUSD to ${name}`)
  }

  // Underlender gets RLUSD to lend
  await submitTx(client, accounts.rlusdIssuer, {
    TransactionType: 'Payment',
    Account: accounts.rlusdIssuer.classicAddress,
    Destination: accounts.underlender1.classicAddress,
    Amount: {
      currency: CURRENCIES.RLUSD,
      issuer: accounts.rlusdIssuer.classicAddress,
      value: '100'
    }
  }, 'RLUSD Issuer: Issue 100 RLUSD to Underlender')

  // Borrower gets some RLUSD for origination fee + repayment ability
  await submitTx(client, accounts.rlusdIssuer, {
    TransactionType: 'Payment',
    Account: accounts.rlusdIssuer.classicAddress,
    Destination: accounts.borrower.classicAddress,
    Amount: {
      currency: CURRENCIES.RLUSD,
      issuer: accounts.rlusdIssuer.classicAddress,
      value: '25'
    }
  }, 'RLUSD Issuer: Issue 25 RLUSD to Borrower (for fees)')

  console.log('')

  // ─── Step 6: Create XRP/RLUSD AMM ───
  console.log('  Step 6: Creating XRP/RLUSD AMM pool...')

  const ammInfo = await createAMM(
    client, accounts.ammBootstrapper,
    AMM_CONFIG.INITIAL_XRP, AMM_CONFIG.INITIAL_RLUSD,
    accounts.rlusdIssuer.classicAddress
  )

  console.log(`  [\u2713] AMM Account:    ${ammInfo.ammAccountId}`)
  console.log(`  [\u2713] LP Token Code:  ${ammInfo.lpTokenCurrency}`)
  console.log(`  [\u2713] LP Token Issuer: ${ammInfo.lpTokenIssuer}`)
  console.log(`  [\u2713] Pool: ${ammInfo.xrpPool} XRP + ${typeof ammInfo.rlusdPool === 'object' ? ammInfo.rlusdPool.value : ammInfo.rlusdPool} RLUSD`)
  console.log('')

  // Store AMM info in accounts for later use
  accounts._ammInfo = ammInfo

  // ─── Step 7: Overlenders deposit into AMM to get LP tokens ───
  console.log('  Step 7: Overlenders depositing into AMM for LP tokens...')

  // Overlenders need LP token trustline first
  for (const name of ['overlender1', 'overlender2', 'protocolIssuer']) {
    await submitTx(client, accounts[name], {
      TransactionType: 'TrustSet',
      Account: accounts[name].classicAddress,
      LimitAmount: {
        currency: ammInfo.lpTokenCurrency,
        issuer: ammInfo.lpTokenIssuer,
        value: '10000000'
      }
    }, `${name}: TrustSet LP Token`)
  }

  // Overlenders deposit XRP + RLUSD into AMM
  for (const name of ['overlender1', 'overlender2']) {
    await ammDeposit(
      client, accounts[name],
      AMM_CONFIG.OVERLENDER_DEPOSIT_XRP, AMM_CONFIG.OVERLENDER_DEPOSIT_RLUSD,
      accounts.rlusdIssuer.classicAddress
    )
    const lpBal = await getLPTokenBalance(client, accounts[name].classicAddress, ammInfo.lpTokenCurrency, ammInfo.lpTokenIssuer)
    console.log(`  \u2514\u2500 ${name} LP token balance: ${lpBal}`)
  }
  console.log('')

  // ─── Step 8: Protocol token trustlines ───
  console.log('  Step 8: Establishing protocol token trustlines...')

  // dRECEIPT: overlenders + underlender
  for (const name of ['overlender1', 'overlender2', 'underlender1']) {
    await submitTx(client, accounts[name], {
      TransactionType: 'TrustSet',
      Account: accounts[name].classicAddress,
      LimitAmount: { currency: CURRENCIES.dRECEIPT, issuer: accounts.protocolIssuer.classicAddress, value: '1000000' }
    }, `${name}: TrustSet dRECEIPT`)
  }

  // dCREDIT: borrower
  await submitTx(client, accounts.borrower, {
    TransactionType: 'TrustSet',
    Account: accounts.borrower.classicAddress,
    LimitAmount: { currency: CURRENCIES.dCREDIT, issuer: accounts.protocolIssuer.classicAddress, value: '1000000' }
  }, 'Borrower: TrustSet dCREDIT')

  // dSCORE: borrower
  await submitTx(client, accounts.borrower, {
    TransactionType: 'TrustSet',
    Account: accounts.borrower.classicAddress,
    LimitAmount: { currency: CURRENCIES.dSCORE, issuer: accounts.protocolIssuer.classicAddress, value: '1000000' }
  }, 'Borrower: TrustSet dSCORE')

  console.log('')

  // ─── Summary ───
  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551                 INITIALIZATION COMPLETE                          \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')
  console.log('  AMM Pool:')
  console.log(`    XRP/RLUSD AMM:  ${ammInfo.ammAccountId}`)
  console.log(`    LP Token:       ${ammInfo.lpTokenCurrency} (issuer: ${ammInfo.lpTokenIssuer})`)
  console.log('')
  console.log('  Token Codes:')
  console.log(`    RLUSD:    ${CURRENCIES.RLUSD}`)
  console.log(`    dCREDIT:  ${CURRENCIES.dCREDIT}`)
  console.log(`    dRECEIPT: ${CURRENCIES.dRECEIPT}`)
  console.log(`    dSCORE:   ${CURRENCIES.dSCORE}`)
  console.log('')

  return accounts
}

module.exports = { initializeProtocol }
