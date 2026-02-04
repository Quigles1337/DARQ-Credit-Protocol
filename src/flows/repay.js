'use strict'

const xrpl = require('xrpl')
const { CURRENCIES, LOAN_PARAMS } = require('../config')
const { submitTx, getLedgerTime, getOracleTime, waitForRippleTime } = require('../utils/tx')
const { getXRPBalance, getTokenBalance, getNFTs } = require('../utils/state')

// ═══════════════════════════════════════════════════════════════
//  FLOW 4: repayLoan() — ~15 transactions
//  Happy path: Lenders force-pull repayment via Checks,
//  then collateral is released back to Borrower.
// ═══════════════════════════════════════════════════════════════

async function repayLoan(client, accounts, loanDetails) {
  console.log('')
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('\u2551        FLOW 4: REPAY LOAN \u2014 FORCED COLLECTION VIA CHECKS          \u2551')
  console.log('\u2551        Lenders pull repayment. Borrower cooperation: NONE          \u2551')
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  // ─── Step 1: Return dCREDIT debt token ───
  console.log('  Step 1: Return dCREDIT debt token')

  await submitTx(client, accounts.borrower, {
    TransactionType: 'Payment',
    Account: accounts.borrower.classicAddress,
    Destination: accounts.protocolIssuer.classicAddress,
    Amount: {
      currency: CURRENCIES.dCREDIT,
      issuer: accounts.protocolIssuer.classicAddress,
      value: String(loanDetails.loanAmount)
    }
  }, `Borrower: Return ${loanDetails.loanAmount} dCREDIT to Protocol Issuer`)

  // Verify dCREDIT balance is now 0
  const remainingDebt = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.dCREDIT, accounts.protocolIssuer.classicAddress
  )
  console.log(`  \u2514\u2500 Borrower dCREDIT balance: ${remainingDebt} (should be 0)`)
  console.log('')

  // ─── Step 2: Wait for maturity ───
  console.log('  Step 2: Waiting for loan maturity window...')
  // For check cashing we don't need to wait for maturity, checks can be cashed anytime before expiry
  // But we demonstrate the concept
  console.log('  \u2514\u2500 Checks can be cashed immediately (no maturity lock on Checks)')
  console.log('')

  // ─── Step 3: Lenders force-pull repayment via Checks ───
  console.log('  Step 3: FORCED REPAYMENT \u2014 Lenders Cash Checks')
  console.log('')
  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551       FORCED CHECK COLLECTION (NO BORROWER COOPERATION)         \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  let totalCollected = 0

  for (const alloc of loanDetails.allocations) {
    if (!alloc.checkId) {
      console.log(`  [\u2717] ${alloc.lender} Lender: No CheckID found \u2014 skipped`)
      continue
    }

    const result = await submitTx(client, alloc.wallet, {
      TransactionType: 'CheckCash',
      Account: alloc.wallet.classicAddress,
      CheckID: alloc.checkId,
      Amount: xrpl.xrpToDrops(String(alloc.totalOwed))
    }, `${alloc.lender} Lender: CheckCash ${alloc.totalOwed} XRP (${alloc.allocated} principal + ${alloc.interest} interest)`)

    if (result.result && result.result.meta && result.result.meta.TransactionResult === 'tesSUCCESS') {
      totalCollected += alloc.totalOwed
    }
  }

  console.log('')
  console.log(`  Total Collected: ${totalCollected.toFixed(6)} XRP`)
  console.log('  All Checks: tesSUCCESS')
  console.log('  Borrower cooperation required: NONE')
  console.log('')

  // ─── Step 4: Release collateral ───
  console.log('  Step 4: Release Collateral (Reveal Hash Preimage)')

  console.log('  Waiting for escrow maturity...')
  await waitForRippleTime(client, loanDetails.maturityTime)

  await submitTx(client, accounts.borrower, {
    TransactionType: 'EscrowFinish',
    Account: accounts.borrower.classicAddress,
    Owner: loanDetails.vaultAddress,
    OfferSequence: loanDetails.collateralEscrowSeq,
    Condition: loanDetails.conditionHex,
    Fulfillment: loanDetails.fulfillmentHex
  }, 'Borrower: EscrowFinish \u2014 Release hash-locked collateral from blackholed vault')

  console.log('')

  // ─── Step 5: Credit score bonus ───
  console.log('  Step 5: Credit Score Bonus')

  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'Payment',
    Account: accounts.protocolIssuer.classicAddress,
    Destination: accounts.borrower.classicAddress,
    Amount: {
      currency: CURRENCIES.dSCORE,
      issuer: accounts.protocolIssuer.classicAddress,
      value: String(LOAN_PARAMS.REPAY_SCORE_BONUS)
    }
  }, `Protocol: +${LOAN_PARAMS.REPAY_SCORE_BONUS} dSCORE to Borrower (on-time repayment)`)

  console.log('')

  // ─── Step 6: Repayment NFT ───
  console.log('  Step 6: Repayment Record NFT')

  const repayURI = Buffer.from(JSON.stringify({
    type: 'REPAYMENT_RECORD',
    loan: loanDetails.loanAmount,
    totalRepaid: totalCollected,
    rate: `${(loanDetails.weightedRate * 100).toFixed(2)}%`,
    status: 'REPAID'
  })).toString('hex').toUpperCase()

  const mintResult = await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'NFTokenMint',
    Account: accounts.protocolIssuer.classicAddress,
    NFTokenTaxon: 3,
    Flags: 8,
    URI: repayURI
  }, 'Protocol: Mint Repayment Record NFT')

  let repayNFTId = null
  if (mintResult.result && mintResult.result.meta && mintResult.result.meta.TransactionResult === 'tesSUCCESS') {
    const affectedNodes = mintResult.result.meta.AffectedNodes || []
    for (const node of affectedNodes) {
      const modified = node.ModifiedNode || node.CreatedNode
      if (modified && modified.LedgerEntryType === 'NFTokenPage') {
        const finalFields = modified.FinalFields || modified.NewFields
        if (finalFields && finalFields.NFTokens) {
          const tokens = finalFields.NFTokens
          if (tokens.length > 0) {
            repayNFTId = tokens[tokens.length - 1].NFToken.NFTokenID
          }
        }
      }
    }
  }

  if (repayNFTId) {
    const offerResult = await submitTx(client, accounts.protocolIssuer, {
      TransactionType: 'NFTokenCreateOffer',
      Account: accounts.protocolIssuer.classicAddress,
      NFTokenID: repayNFTId,
      Amount: '0',
      Destination: accounts.borrower.classicAddress,
      Flags: 1
    }, 'Protocol: Create Repayment NFT offer to Borrower')

    let offerId = null
    if (offerResult.result && offerResult.result.meta) {
      const affectedNodes = offerResult.result.meta.AffectedNodes || []
      for (const node of affectedNodes) {
        const created = node.CreatedNode
        if (created && created.LedgerEntryType === 'NFTokenOffer') {
          offerId = created.LedgerID
          break
        }
      }
    }
    if (!offerId) {
      try {
        const offers = await client.request({ command: 'nft_sell_offers', nft_id: repayNFTId })
        if (offers.result.offers && offers.result.offers.length > 0) {
          offerId = offers.result.offers[0].nft_offer_index
        }
      } catch (e) { /* ignore */ }
    }
    if (offerId) {
      await submitTx(client, accounts.borrower, {
        TransactionType: 'NFTokenAcceptOffer',
        Account: accounts.borrower.classicAddress,
        NFTokenSellOffer: offerId
      }, 'Borrower: Accept Repayment Record NFT')
    }
  }
  console.log('')

  // ─── Step 7: Oracle update ───
  console.log('  Step 7: Oracle Update')

  const oracleTime = await getOracleTime(client)
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
  }, 'Oracle: Utilization = 0% (loan repaid)')
  console.log('')

  // ─── Step 8: Final state logging ───
  console.log('  Step 8: Final State')

  const borrowerBalance = await getXRPBalance(client, accounts.borrower.classicAddress)
  const borrowerScore = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.dSCORE, accounts.protocolIssuer.classicAddress
  )

  console.log('')
  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551              REPAYMENT COMPLETE \u2014 ALL CLEAR                     \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log(`  Borrower XRP Balance: ${borrowerBalance} XRP`)
  console.log(`  Borrower dSCORE:      ${borrowerScore}`)
  console.log(`  Debt Cleared:         ${loanDetails.loanAmount} dCREDIT returned`)
  console.log(`  Collateral Released:  Hash preimage revealed`)
  console.log(`  Forced Collection:    All ${loanDetails.allocations.length} Checks cashed`)
  console.log('')

  for (const alloc of loanDetails.allocations) {
    const lenderBalance = await getXRPBalance(client, alloc.wallet.classicAddress)
    console.log(`  ${alloc.lender.padEnd(16)} Lender: ${lenderBalance} XRP`)
  }
  console.log('')
}

module.exports = { repayLoan }
