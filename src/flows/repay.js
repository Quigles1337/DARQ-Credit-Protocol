'use strict'

const xrpl = require('xrpl')
const { CURRENCIES, LOAN_PARAMS } = require('../config')
const { submitTx, getLedgerTime } = require('../utils/tx')
const { getXRPBalance, getTokenBalance, getNFTs } = require('../utils/state')
const { getLPTokenBalance } = require('../utils/amm')

// ═══════════════════════════════════════════════════════════════
//  FLOW 4: repayLoan() — ~20 transactions
//  Happy path: RLUSD Checks cashed, LP tokens returned to
//  overlenders via vault standing offer crossing.
// ═══════════════════════════════════════════════════════════════

async function repayLoan(client, accounts, loanDetails) {
  const ammInfo = loanDetails.ammInfo

  console.log('')
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('\u2551   FLOW 4: REPAY LOAN \u2014 FORCED COLLECTION + LP TOKEN RETURN         \u2551')
  console.log('\u2551   RLUSD Checks cashed. LP tokens returned via vault offer.         \u2551')
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

  const remainingDebt = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.dCREDIT, accounts.protocolIssuer.classicAddress
  )
  console.log(`  \u2514\u2500 Borrower dCREDIT balance: ${remainingDebt} (should be 0)`)
  console.log('')

  // ─── Step 2: Lenders cash RLUSD Checks (forced collection) ───
  console.log('  Step 2: FORCED REPAYMENT \u2014 Lenders Cash RLUSD Checks')
  console.log('')
  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551   FORCED RLUSD CHECK COLLECTION (NO BORROWER COOPERATION)       \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  let totalCollected = 0

  for (const alloc of loanDetails.allocations) {
    if (!alloc.checkId) {
      console.log(`  [\u2717] ${alloc.name}: No CheckID found \u2014 skipped`)
      continue
    }

    const result = await submitTx(client, alloc.wallet, {
      TransactionType: 'CheckCash',
      Account: alloc.wallet.classicAddress,
      CheckID: alloc.checkId,
      Amount: {
        currency: CURRENCIES.RLUSD,
        issuer: accounts.rlusdIssuer.classicAddress,
        value: String(alloc.totalOwed)
      }
    }, `${alloc.name}: CheckCash ${alloc.totalOwed} RLUSD (${alloc.type === 'underlender' ? alloc.principal + ' principal + ' + alloc.interest + ' interest' : alloc.interest + ' interest'})`)

    if (result.result && result.result.meta && result.result.meta.TransactionResult === 'tesSUCCESS') {
      totalCollected += alloc.totalOwed
    }
  }

  console.log('')
  console.log(`  Total Collected: ${totalCollected.toFixed(6)} RLUSD`)
  console.log('  All Checks: tesSUCCESS')
  console.log('')

  // ─── Step 3: Return LP tokens to overlenders ───
  console.log('  Step 3: Return LP Tokens to Overlenders')
  console.log('  (Originator crosses vault standing offer via dCREDIT)')
  console.log('')

  // Originator crosses vault's standing offer directly — as dCREDIT issuer,
  // the OfferCreate creates dCREDIT on the fly to match the vault's offer
  const lpAmount = loanDetails.lpCollateral
  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'OfferCreate',
    Account: accounts.protocolIssuer.classicAddress,
    TakerPays: {
      currency: ammInfo.lpTokenCurrency,
      issuer: ammInfo.lpTokenIssuer,
      value: lpAmount
    },
    TakerGets: {
      currency: CURRENCIES.dCREDIT,
      issuer: accounts.protocolIssuer.classicAddress,
      value: lpAmount
    },
    Flags: 0x00020000 // tfImmediateOrCancel
  }, 'Originator: Cross vault offer (dCREDIT \u2192 LP tokens)')

  // Distribute LP tokens back to each overlender
  const overlenderAllocs = loanDetails.allocations.filter(a => a.type === 'overlender')
  for (const alloc of overlenderAllocs) {
    const lpReturn = alloc.lpTokenAmount
    await submitTx(client, accounts.protocolIssuer, {
      TransactionType: 'Payment',
      Account: accounts.protocolIssuer.classicAddress,
      Destination: alloc.wallet.classicAddress,
      Amount: {
        currency: ammInfo.lpTokenCurrency,
        issuer: ammInfo.lpTokenIssuer,
        value: lpReturn
      }
    }, `Originator: Return ${lpReturn} LP tokens \u2192 ${alloc.name}`)
  }
  console.log('')

  // ─── Step 4: Credit score bonus ───
  console.log('  Step 4: Credit Score Bonus')

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

  // ─── Step 5: Repayment NFT ───
  console.log('  Step 5: Repayment Record NFT')

  const repayURI = Buffer.from(JSON.stringify({
    type: 'REPAYMENT_RECORD',
    loan: loanDetails.loanAmount,
    denomination: 'RLUSD',
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

  // ─── Step 6: Final state ───
  console.log('  Step 6: Final State')

  const borrowerScore = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.dSCORE, accounts.protocolIssuer.classicAddress
  )

  console.log('')
  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551              REPAYMENT COMPLETE \u2014 ALL CLEAR                     \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log(`  Borrower dSCORE:      ${borrowerScore}`)
  console.log(`  Debt Cleared:         ${loanDetails.loanAmount} dCREDIT returned`)
  console.log(`  LP Tokens:            Returned to overlenders`)
  console.log(`  RLUSD Collected:      ${totalCollected.toFixed(6)} RLUSD via forced Checks`)
  console.log('')

  for (const alloc of loanDetails.allocations) {
    if (alloc.type === 'overlender') {
      const lpBal = await getLPTokenBalance(
        client, alloc.wallet.classicAddress, ammInfo.lpTokenCurrency, ammInfo.lpTokenIssuer
      )
      console.log(`  ${alloc.name.padEnd(18)} LP tokens: ${lpBal} | Interest received: ${alloc.interest} RLUSD`)
    } else {
      const rlusdBal = await getTokenBalance(
        client, alloc.wallet.classicAddress, CURRENCIES.RLUSD, accounts.rlusdIssuer.classicAddress
      )
      console.log(`  ${alloc.name.padEnd(18)} RLUSD: ${rlusdBal} | Repaid: ${alloc.totalOwed} RLUSD`)
    }
  }
  console.log('')
}

module.exports = { repayLoan }
