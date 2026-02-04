'use strict'

const xrpl = require('xrpl')
const { CURRENCIES, POOL_TIERS, LOAN_PARAMS } = require('../config')
const { getXRPBalance, getTokenBalance, getNFTs } = require('../utils/state')

// ═══════════════════════════════════════════════════════════════
//  FLOW 6: protocolSummary() — Final protocol state display
// ═══════════════════════════════════════════════════════════════

async function protocolSummary(client, accounts, loanDetails) {
  console.log('')
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('\u2551          DARQ CREDIT PROTOCOL v2 \u2014 FINAL SUMMARY                 \u2551')
  console.log('\u2551          Facilitator Architecture (No Capital Held)                \u2551')
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  // ─── Account Balances ───
  console.log('  \u2500\u2500\u2500 ACCOUNT BALANCES \u2500\u2500\u2500')
  console.log('')

  const accountList = [
    { name: 'Protocol Issuer', wallet: accounts.protocolIssuer },
    { name: 'Liquidation Engine', wallet: accounts.liquidationEngine },
    { name: 'Treasury', wallet: accounts.treasury },
    { name: 'Oracle Committee', wallet: accounts.oracleCommittee },
    { name: 'Lender Conservative', wallet: accounts.lenderConservative },
    { name: 'Lender Balanced', wallet: accounts.lenderBalanced },
    { name: 'Lender Aggressive', wallet: accounts.lenderAggressive },
    { name: 'Borrower', wallet: accounts.borrower },
  ]

  for (const acct of accountList) {
    const balance = String(await getXRPBalance(client, acct.wallet.classicAddress))
    console.log(`  ${acct.name.padEnd(22)} ${acct.wallet.classicAddress}  ${balance.padStart(12)} XRP`)
  }
  console.log('')

  // ─── Token Balances ───
  console.log('  \u2500\u2500\u2500 TOKEN BALANCES \u2500\u2500\u2500')
  console.log('')

  const borrowerDCREDIT = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.dCREDIT, accounts.protocolIssuer.classicAddress
  )
  const borrowerDSCORE = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.dSCORE, accounts.protocolIssuer.classicAddress
  )

  console.log(`  Borrower dCREDIT:     ${borrowerDCREDIT}`)
  console.log(`  Borrower dSCORE:      ${borrowerDSCORE}`)

  for (const tier of ['lenderConservative', 'lenderBalanced', 'lenderAggressive']) {
    const receipt = await getTokenBalance(
      client, accounts[tier].classicAddress, CURRENCIES.dRECEIPT, accounts.protocolIssuer.classicAddress
    )
    console.log(`  ${tier.padEnd(22)} dRECEIPT: ${receipt}`)
  }
  console.log('')

  // ─── Loan Details ───
  if (loanDetails) {
    console.log('  \u2500\u2500\u2500 LOAN DETAILS \u2500\u2500\u2500')
    console.log('')
    console.log(`  Loan Amount:          ${loanDetails.loanAmount} XRP`)
    console.log(`  Collateral:           ${loanDetails.collateralAmount} XRP`)
    console.log(`  Vault (blackholed):   ${loanDetails.vaultAddress}`)
    console.log(`  Weighted Avg Rate:    ${(loanDetails.weightedRate * 100).toFixed(2)}% APR`)
    console.log('')

    console.log('  \u2500\u2500\u2500 POOL ALLOCATION \u2500\u2500\u2500')
    console.log('')
    console.log('  Pool             | Allocated | Rate  | Total Owed | Check Status')
    console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500')

    for (const alloc of loanDetails.allocations) {
      const name = alloc.lender.padEnd(16)
      const amount = `${alloc.allocated} XRP`.padStart(9)
      const rate = `${(alloc.rate * 100).toFixed(1)}%`.padStart(5)
      const owed = `${alloc.totalOwed} XRP`.padStart(10)
      const checkStatus = alloc.checkId ? 'CREATED' : 'N/A'
      console.log(`  ${name} | ${amount} | ${rate} | ${owed} | ${checkStatus}`)
    }
    console.log('')
  }

  // ─── NFTs ───
  console.log('  \u2500\u2500\u2500 NFT RECORDS \u2500\u2500\u2500')
  console.log('')

  const borrowerNFTs = await getNFTs(client, accounts.borrower.classicAddress)
  console.log(`  Borrower NFTs: ${borrowerNFTs.length}`)
  for (const nft of borrowerNFTs) {
    let decoded = ''
    try {
      decoded = Buffer.from(nft.URI, 'hex').toString('utf8')
      const parsed = JSON.parse(decoded)
      console.log(`    [${parsed.type}] ${nft.NFTokenID.substring(0, 16)}...`)
    } catch (e) {
      console.log(`    ${nft.NFTokenID.substring(0, 16)}...`)
    }
  }
  console.log('')

  // ─── Architecture Summary ───
  console.log('  \u2500\u2500\u2500 ARCHITECTURE \u2500\u2500\u2500')
  console.log('')
  console.log('  Capital flow:          Lender \u2192 Borrower (DIRECT, no intermediary)')
  console.log('  Repayment mechanism:   CheckCreate/CheckCash (forced pull)')
  console.log('  Collateral custody:    Blackholed vault (immutable)')
  console.log('  Collateral release:    PREIMAGE-SHA-256 hash-locked escrow')
  console.log('  Credit scoring:        On-chain dSCORE token with Clawback')
  console.log('  Protocol role:         Facilitator (matchmaker & monitor)')
  console.log('  Protocol capital:      ZERO (never holds lender/borrower funds)')
  console.log('')
  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551    DARQ Credit Protocol v2 \u2014 Complete     \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')
}

module.exports = { protocolSummary }
