'use strict'

const xrpl = require('xrpl')
const { CURRENCIES, LOAN_PARAMS, DEFAULT_SPLIT, LENDER_SPLIT } = require('../config')
const { getXRPBalance, getTokenBalance, getNFTs } = require('../utils/state')
const { getLPTokenBalance, getAMMInfo } = require('../utils/amm')

// ═══════════════════════════════════════════════════════════════
//  FLOW 6: protocolSummary() — Final protocol state display
//  Shows RLUSD balances, LP token balances, AMM info
// ═══════════════════════════════════════════════════════════════

async function protocolSummary(client, accounts, loanDetails) {
  const ammInfo = accounts._ammInfo || (loanDetails && loanDetails.ammInfo)

  console.log('')
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('\u2551   DARQ CREDIT PROTOCOL v3 \u2014 FINAL SUMMARY                        \u2551')
  console.log('\u2551   AMM-Backed Overlender Architecture (RLUSD denomination)          \u2551')
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  // ─── Account Balances ───
  console.log('  \u2500\u2500\u2500 ACCOUNT BALANCES (XRP + RLUSD) \u2500\u2500\u2500')
  console.log('')

  const accountList = [
    { name: 'Protocol Issuer', key: 'protocolIssuer' },
    { name: 'RLUSD Issuer', key: 'rlusdIssuer' },
    { name: 'AMM Bootstrapper', key: 'ammBootstrapper' },
    { name: 'Overlender 1', key: 'overlender1' },
    { name: 'Overlender 2', key: 'overlender2' },
    { name: 'Underlender 1', key: 'underlender1' },
    { name: 'Borrower', key: 'borrower' },
  ]

  for (const acct of accountList) {
    const xrpBal = await getXRPBalance(client, accounts[acct.key].classicAddress)
    const rlusdBal = await getTokenBalance(
      client, accounts[acct.key].classicAddress, CURRENCIES.RLUSD, accounts.rlusdIssuer.classicAddress
    )
    let lpBal = '0'
    if (ammInfo) {
      lpBal = await getLPTokenBalance(client, accounts[acct.key].classicAddress, ammInfo.lpTokenCurrency, ammInfo.lpTokenIssuer)
    }
    console.log(`  ${acct.name.padEnd(22)} ${xrpBal.toString().padStart(10)} XRP | ${rlusdBal.toString().padStart(10)} RLUSD | ${lpBal.toString().padStart(12)} LP`)
  }
  console.log('')

  // ─── Protocol Token Balances ───
  console.log('  \u2500\u2500\u2500 PROTOCOL TOKENS \u2500\u2500\u2500')
  console.log('')

  const borrowerDCREDIT = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.dCREDIT, accounts.protocolIssuer.classicAddress
  )
  const borrowerDSCORE = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.dSCORE, accounts.protocolIssuer.classicAddress
  )
  console.log(`  Borrower dCREDIT:     ${borrowerDCREDIT}`)
  console.log(`  Borrower dSCORE:      ${borrowerDSCORE}`)

  for (const key of ['overlender1', 'overlender2', 'underlender1']) {
    const receipt = await getTokenBalance(
      client, accounts[key].classicAddress, CURRENCIES.dRECEIPT, accounts.protocolIssuer.classicAddress
    )
    console.log(`  ${key.padEnd(22)} dRECEIPT: ${receipt}`)
  }
  console.log('')

  // ─── AMM Info ───
  if (ammInfo) {
    console.log('  \u2500\u2500\u2500 AMM POOL INFO \u2500\u2500\u2500')
    console.log('')
    try {
      const currentAMM = await getAMMInfo(client, accounts.rlusdIssuer.classicAddress)
      console.log(`  AMM Account:          ${currentAMM.ammAccountId}`)
      console.log(`  LP Token:             ${currentAMM.lpTokenCurrency}`)
      const xrpPool = typeof currentAMM.xrpPool === 'string' ? xrpl.dropsToXrp(currentAMM.xrpPool) : currentAMM.xrpPool
      const rlusdPool = typeof currentAMM.rlusdPool === 'object' ? currentAMM.rlusdPool.value : currentAMM.rlusdPool
      console.log(`  XRP in pool:          ${xrpPool}`)
      console.log(`  RLUSD in pool:        ${rlusdPool}`)
      console.log(`  Total LP supply:      ${currentAMM.lpTokenBalance}`)
    } catch (e) {
      console.log(`  AMM query failed: ${e.message}`)
    }
    console.log('')
  }

  // ─── Loan Details ───
  if (loanDetails) {
    console.log('  \u2500\u2500\u2500 LOAN DETAILS \u2500\u2500\u2500')
    console.log('')
    console.log(`  Loan Amount:          ${loanDetails.loanAmount} RLUSD`)
    console.log(`  LP Collateral:        ${loanDetails.lpCollateral} LP tokens`)
    console.log(`  Vault (blackholed):   ${loanDetails.vaultAddress}`)
    console.log(`  Weighted Avg Rate:    ${(loanDetails.weightedRate * 100).toFixed(2)}% APR`)
    console.log(`  Risk Split:           Overlender ${(LENDER_SPLIT.OVERLENDER_SHARE * 100).toFixed(0)}% | Underlender ${(LENDER_SPLIT.UNDERLENDER_SHARE * 100).toFixed(0)}%`)
    console.log(`  Default Split:        Overlender absorbs ${(DEFAULT_SPLIT.OVERLENDER_LOSS * 100).toFixed(0)}% | Underlender absorbs ${(DEFAULT_SPLIT.UNDERLENDER_LOSS * 100).toFixed(0)}%`)
    console.log('')

    console.log('  \u2500\u2500\u2500 LENDER ALLOCATION \u2500\u2500\u2500')
    console.log('')
    console.log('  Lender           | Type          | Rate  | Total Owed   | Check')
    console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500')

    for (const alloc of loanDetails.allocations) {
      const name = alloc.name.padEnd(18)
      const type = (alloc.type === 'overlender' ? 'LP Collateral' : 'RLUSD Direct').padEnd(13)
      const rate = `${(alloc.rate * 100).toFixed(1)}%`.padStart(5)
      const owed = `${alloc.totalOwed} RLUSD`.padStart(12)
      const check = alloc.checkId ? 'CREATED' : 'N/A'
      console.log(`  ${name} | ${type} | ${rate} | ${owed} | ${check}`)
    }
    console.log('')
  }

  // ─── NFTs ───
  console.log('  \u2500\u2500\u2500 NFT RECORDS \u2500\u2500\u2500')
  console.log('')

  const borrowerNFTs = await getNFTs(client, accounts.borrower.classicAddress)
  console.log(`  Borrower NFTs: ${borrowerNFTs.length}`)
  for (const nft of borrowerNFTs) {
    try {
      const decoded = Buffer.from(nft.URI, 'hex').toString('utf8')
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
  console.log('  Loan denomination:     RLUSD (stablecoin)')
  console.log('  Capital source:        Underlender (direct RLUSD) + Overlender (LP token collateral)')
  console.log('  Collateral custody:    Blackholed vault (LP tokens + standing DEX offer)')
  console.log('  Repayment mechanism:   CheckCreate/CheckCash in RLUSD (forced pull)')
  console.log('  LP token return:       Via vault standing offer crossing (dCREDIT key)')
  console.log('  Default recovery:      AMMWithdraw 1-sided (LP tokens \u2192 RLUSD)')
  console.log('  Default waterfall:     Overlender FIRST, then underlender (interest only)')
  console.log(`  Loss absorption:       Underlender ${(DEFAULT_SPLIT.UNDERLENDER_LOSS * 100).toFixed(0)}% | Overlender ${(DEFAULT_SPLIT.OVERLENDER_LOSS * 100).toFixed(0)}%`)
  console.log('  Credit scoring:        On-chain dSCORE token with Clawback')
  console.log('')
  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551    DARQ Credit Protocol v3 \u2014 Complete     \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')
}

module.exports = { protocolSummary }
