'use strict'

const xrpl = require('xrpl')
const { CURRENCIES, POOL_TIERS, LOAN_PARAMS } = require('../config')
const { submitTx, getLedgerTime, getOracleTime } = require('../utils/tx')

// ═══════════════════════════════════════════════════════════════
//  FLOW 1: initializeProtocol() — ~25 transactions
//  Sets up all accounts, trustlines, access control, oracles.
//  Protocol NEVER receives lender capital.
// ═══════════════════════════════════════════════════════════════

async function initializeProtocol(client) {
  console.log('')
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('\u2551        FLOW 1: INITIALIZE PROTOCOL (FACILITATOR)                  \u2551')
  console.log('\u2551        Protocol holds NO capital \u2014 matchmaker & monitor only       \u2551')
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  // ─── Step 1: Fund all 8 accounts ───
  console.log('  Step 1: Funding accounts via testnet faucet...')
  const accountNames = [
    'protocolIssuer', 'liquidationEngine', 'treasury', 'oracleCommittee',
    'lenderConservative', 'lenderBalanced', 'lenderAggressive', 'borrower'
  ]

  const accounts = {}
  for (const name of accountNames) {
    const funded = await client.fundWallet()
    accounts[name] = funded.wallet
    console.log(`  [\u2713] ${name.padEnd(22)} ${funded.wallet.classicAddress}`)
  }
  console.log('')

  // ─── Step 2: Configure Protocol Issuer ───
  console.log('  Step 2: Configuring Protocol Issuer...')

  // Enable Clawback flag FIRST (before any trustlines)
  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'AccountSet',
    Account: accounts.protocolIssuer.classicAddress,
    SetFlag: 16 // asfAllowTrustLineClawback
  }, 'Protocol Issuer: Enable Clawback')

  // Enable Default Ripple
  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'AccountSet',
    Account: accounts.protocolIssuer.classicAddress,
    SetFlag: 8 // asfDefaultRipple
  }, 'Protocol Issuer: Enable Default Ripple')
  console.log('')

  // ─── Step 3: Establish trustlines ───
  console.log('  Step 3: Establishing trustlines...')

  // Lender Conservative: dRECEIPT
  await submitTx(client, accounts.lenderConservative, {
    TransactionType: 'TrustSet',
    Account: accounts.lenderConservative.classicAddress,
    LimitAmount: { currency: CURRENCIES.dRECEIPT, issuer: accounts.protocolIssuer.classicAddress, value: '1000000' }
  }, 'Lender Conservative: TrustSet dRECEIPT')

  // Lender Balanced: dRECEIPT
  await submitTx(client, accounts.lenderBalanced, {
    TransactionType: 'TrustSet',
    Account: accounts.lenderBalanced.classicAddress,
    LimitAmount: { currency: CURRENCIES.dRECEIPT, issuer: accounts.protocolIssuer.classicAddress, value: '1000000' }
  }, 'Lender Balanced: TrustSet dRECEIPT')

  // Lender Aggressive: dRECEIPT
  await submitTx(client, accounts.lenderAggressive, {
    TransactionType: 'TrustSet',
    Account: accounts.lenderAggressive.classicAddress,
    LimitAmount: { currency: CURRENCIES.dRECEIPT, issuer: accounts.protocolIssuer.classicAddress, value: '1000000' }
  }, 'Lender Aggressive: TrustSet dRECEIPT')

  // Borrower: dCREDIT + dSCORE
  await submitTx(client, accounts.borrower, {
    TransactionType: 'TrustSet',
    Account: accounts.borrower.classicAddress,
    LimitAmount: { currency: CURRENCIES.dCREDIT, issuer: accounts.protocolIssuer.classicAddress, value: '1000000' }
  }, 'Borrower: TrustSet dCREDIT')

  await submitTx(client, accounts.borrower, {
    TransactionType: 'TrustSet',
    Account: accounts.borrower.classicAddress,
    LimitAmount: { currency: CURRENCIES.dSCORE, issuer: accounts.protocolIssuer.classicAddress, value: '1000000' }
  }, 'Borrower: TrustSet dSCORE')

  // Liquidation Engine: dCREDIT
  await submitTx(client, accounts.liquidationEngine, {
    TransactionType: 'TrustSet',
    Account: accounts.liquidationEngine.classicAddress,
    LimitAmount: { currency: CURRENCIES.dCREDIT, issuer: accounts.protocolIssuer.classicAddress, value: '1000000' }
  }, 'Liquidation Engine: TrustSet dCREDIT')

  // Treasury: dCREDIT, dRECEIPT, dSCORE
  await submitTx(client, accounts.treasury, {
    TransactionType: 'TrustSet',
    Account: accounts.treasury.classicAddress,
    LimitAmount: { currency: CURRENCIES.dCREDIT, issuer: accounts.protocolIssuer.classicAddress, value: '1000000' }
  }, 'Treasury: TrustSet dCREDIT')

  await submitTx(client, accounts.treasury, {
    TransactionType: 'TrustSet',
    Account: accounts.treasury.classicAddress,
    LimitAmount: { currency: CURRENCIES.dRECEIPT, issuer: accounts.protocolIssuer.classicAddress, value: '1000000' }
  }, 'Treasury: TrustSet dRECEIPT')

  await submitTx(client, accounts.treasury, {
    TransactionType: 'TrustSet',
    Account: accounts.treasury.classicAddress,
    LimitAmount: { currency: CURRENCIES.dSCORE, issuer: accounts.protocolIssuer.classicAddress, value: '1000000' }
  }, 'Treasury: TrustSet dSCORE')

  console.log('')

  // ─── Step 4: Access control ───
  console.log('  Step 4: Configuring access control...')

  // Treasury: Enable DepositAuth
  await submitTx(client, accounts.treasury, {
    TransactionType: 'AccountSet',
    Account: accounts.treasury.classicAddress,
    SetFlag: 9 // asfDepositAuth
  }, 'Treasury: Enable DepositAuth')

  // Treasury: DepositPreauth for Liquidation Engine
  await submitTx(client, accounts.treasury, {
    TransactionType: 'DepositPreauth',
    Account: accounts.treasury.classicAddress,
    Authorize: accounts.liquidationEngine.classicAddress
  }, 'Treasury: DepositPreauth Liquidation Engine')

  // Treasury: DepositPreauth for each Lender
  await submitTx(client, accounts.treasury, {
    TransactionType: 'DepositPreauth',
    Account: accounts.treasury.classicAddress,
    Authorize: accounts.lenderConservative.classicAddress
  }, 'Treasury: DepositPreauth Lender Conservative')

  await submitTx(client, accounts.treasury, {
    TransactionType: 'DepositPreauth',
    Account: accounts.treasury.classicAddress,
    Authorize: accounts.lenderBalanced.classicAddress
  }, 'Treasury: DepositPreauth Lender Balanced')

  await submitTx(client, accounts.treasury, {
    TransactionType: 'DepositPreauth',
    Account: accounts.treasury.classicAddress,
    Authorize: accounts.lenderAggressive.classicAddress
  }, 'Treasury: DepositPreauth Lender Aggressive')

  // Treasury: DepositPreauth for Borrower (origination fee)
  await submitTx(client, accounts.treasury, {
    TransactionType: 'DepositPreauth',
    Account: accounts.treasury.classicAddress,
    Authorize: accounts.borrower.classicAddress
  }, 'Treasury: DepositPreauth Borrower')

  console.log('')

  // ─── Step 5: Initialize oracle feeds ───
  console.log('  Step 5: Initializing oracle feeds...')

  // XRP/USD price feed
  let oracleTime = await getOracleTime(client)
  await submitTx(client, accounts.oracleCommittee, {
    TransactionType: 'OracleSet',
    Account: accounts.oracleCommittee.classicAddress,
    OracleDocumentID: 0,
    Provider: Buffer.from('DARQ-Oracle').toString('hex'),
    AssetClass: Buffer.from('currency').toString('hex'),
    LastUpdateTime: oracleTime,
    PriceDataSeries: [
      {
        PriceData: {
          BaseAsset: 'XRP',
          QuoteAsset: 'USD',
          AssetPrice: String(Math.round(LOAN_PARAMS.XRP_USD_PRICE * 1000)),
          Scale: 3
        }
      }
    ]
  }, `Oracle: XRP/USD = $${LOAN_PARAMS.XRP_USD_PRICE}`)

  // Pool rates feed
  oracleTime = await getOracleTime(client)
  await submitTx(client, accounts.oracleCommittee, {
    TransactionType: 'OracleSet',
    Account: accounts.oracleCommittee.classicAddress,
    OracleDocumentID: 1,
    Provider: Buffer.from('DARQ-Oracle').toString('hex'),
    AssetClass: Buffer.from('rates').toString('hex'),
    LastUpdateTime: oracleTime,
    PriceDataSeries: [
      {
        PriceData: {
          BaseAsset: 'XRP',
          QuoteAsset: 'USD',
          AssetPrice: String(Math.round(POOL_TIERS.CONSERVATIVE.rate * 10000)),
          Scale: 4
        }
      }
    ]
  }, `Oracle: Pool rates (3%, 5%, 8%)`)

  // Utilization feed
  oracleTime = await getOracleTime(client)
  await submitTx(client, accounts.oracleCommittee, {
    TransactionType: 'OracleSet',
    Account: accounts.oracleCommittee.classicAddress,
    OracleDocumentID: 2,
    Provider: Buffer.from('DARQ-Oracle').toString('hex'),
    AssetClass: Buffer.from('utilization').toString('hex'),
    LastUpdateTime: oracleTime,
    PriceDataSeries: [
      {
        PriceData: {
          BaseAsset: 'XRP',
          QuoteAsset: 'USD',
          AssetPrice: '1',
          Scale: 3
        }
      }
    ]
  }, 'Oracle: Utilization = 0%')

  console.log('')

  // ─── Step 6: Register pool tiers ───
  console.log('  Step 6: Pool tier registration')
  console.log('')
  console.log('  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510')
  console.log(`  \u2502  Conservative Pool: ${accounts.lenderConservative.classicAddress.substring(0,12)}... @ 3%  \u2014 20 XRP  \u2502`)
  console.log(`  \u2502  Balanced Pool:     ${accounts.lenderBalanced.classicAddress.substring(0,12)}... @ 5%  \u2014 30 XRP  \u2502`)
  console.log(`  \u2502  Aggressive Pool:   ${accounts.lenderAggressive.classicAddress.substring(0,12)}... @ 8%  \u2014 15 XRP  \u2502`)
  console.log('  \u2502  Total Liquidity:   65 XRP across 3 tiers                        \u2502')
  console.log('  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518')
  console.log('')

  // ─── Log all accounts ───
  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551                 INITIALIZATION COMPLETE                          \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')
  console.log('  Token Codes:')
  console.log(`    dCREDIT:  ${CURRENCIES.dCREDIT}`)
  console.log(`    dRECEIPT: ${CURRENCIES.dRECEIPT}`)
  console.log(`    dSCORE:   ${CURRENCIES.dSCORE}`)
  console.log('')

  return accounts
}

module.exports = { initializeProtocol }
