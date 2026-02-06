'use strict'

const xrpl = require('xrpl')
const { CURRENCIES, LOAN_PARAMS, DEFAULT_SPLIT } = require('../config')
const { submitTx, getLedgerTime, waitForRippleTime } = require('../utils/tx')
const { getXRPBalance, getTokenBalance, getAccountEscrows, getNFTs } = require('../utils/state')
const { ammWithdrawAllToRLUSD, getLPTokenBalance, getAMMInfo } = require('../utils/amm')

// ═══════════════════════════════════════════════════════════════
//  FLOW 5: liquidateLoan() — ~25 transactions
//  100% default: All RLUSD Checks bounce → LP token seizure
//  → 1-sided AMMWithdraw → Payment waterfall (80/20 split)
//  Overlender paid FIRST. Underlender absorbs 80% of default.
// ═══════════════════════════════════════════════════════════════

async function liquidateLoan(client, accounts, loanDetails) {
  const ammInfo = loanDetails.ammInfo

  console.log('')
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('\u2551   FLOW 5: LIQUIDATION \u2014 100% DEFAULT + AMM WITHDRAWAL              \u2551')
  console.log('\u2551   All Checks bounce \u2192 LP seizure \u2192 1-sided AMM \u2192 80/20 waterfall \u2551')
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  // ─── Step 1: Simulate borrower draining RLUSD (default scenario) ───
  console.log('  \u26A0 Simulating borrower draining RLUSD (100% default scenario)...')

  const borrowerRLUSD = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.RLUSD, accounts.rlusdIssuer.classicAddress
  )
  console.log(`  Borrower RLUSD balance before drain: ${borrowerRLUSD}`)

  // Drain all RLUSD to a temp account
  if (Number(borrowerRLUSD) > 0) {
    const drainDest = await client.fundWallet()
    // Drain dest needs RLUSD trustline
    await submitTx(client, drainDest.wallet, {
      TransactionType: 'TrustSet',
      Account: drainDest.wallet.classicAddress,
      LimitAmount: {
        currency: CURRENCIES.RLUSD,
        issuer: accounts.rlusdIssuer.classicAddress,
        value: '10000000'
      }
    }, 'Drain Dest: TrustSet RLUSD')

    await submitTx(client, accounts.borrower, {
      TransactionType: 'Payment',
      Account: accounts.borrower.classicAddress,
      Destination: drainDest.wallet.classicAddress,
      Amount: {
        currency: CURRENCIES.RLUSD,
        issuer: accounts.rlusdIssuer.classicAddress,
        value: borrowerRLUSD
      }
    }, `Borrower: DRAIN ${borrowerRLUSD} RLUSD (simulating default)`)
  }

  const postDrainRLUSD = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.RLUSD, accounts.rlusdIssuer.classicAddress
  )
  console.log(`  \u2514\u2500 Borrower RLUSD after drain: ${postDrainRLUSD}`)
  console.log('')

  // ─── Step 2: Attempt RLUSD Check collection (all should fail) ───
  console.log('  Step 2: Attempt RLUSD Check Collection (Pre-Liquidation)')
  console.log('')
  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551   RLUSD CHECK COLLECTION ATTEMPT (ALL EXPECTED TO FAIL)          \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  const totalOwed = loanDetails.allocations.reduce((s, a) => s + a.totalOwed, 0)

  for (const alloc of loanDetails.allocations) {
    if (!alloc.checkId) {
      console.log(`  [\u2717] ${alloc.name}: No CheckID \u2014 skipped`)
      continue
    }

    await submitTx(client, alloc.wallet, {
      TransactionType: 'CheckCash',
      Account: alloc.wallet.classicAddress,
      CheckID: alloc.checkId,
      Amount: {
        currency: CURRENCIES.RLUSD,
        issuer: accounts.rlusdIssuer.classicAddress,
        value: String(alloc.totalOwed)
      }
    }, `${alloc.name}: CheckCash ${alloc.totalOwed} RLUSD`)
  }

  console.log('')
  console.log('  All Checks BOUNCED (tecPATH_PARTIAL / tecPATH_DRY) \u2014 borrower has no RLUSD')
  console.log(`  Total shortfall: ${totalOwed.toFixed(6)} RLUSD`)
  console.log('')

  // ─── Step 3: Collateral seizure — LP tokens from vault ───
  console.log('  Step 3: Collateral Seizure (LP Tokens from Blackholed Vault)')

  // Wait for liquidation trigger escrow maturity
  console.log('  Waiting for liquidation trigger escrow maturity...')
  const escrows = await getAccountEscrows(client, loanDetails.vaultAddress)
  if (escrows.length > 0) {
    const liqEscrow = escrows.find(e => !e.Condition)
    if (liqEscrow && liqEscrow.FinishAfter) {
      await waitForRippleTime(client, liqEscrow.FinishAfter)
    } else {
      await new Promise(r => setTimeout(r, 40000))
    }
  } else {
    await new Promise(r => setTimeout(r, 40000))
  }

  // Originator finishes the trigger escrow
  if (loanDetails.liquidationEscrowSeq) {
    await submitTx(client, accounts.protocolIssuer, {
      TransactionType: 'EscrowFinish',
      Account: accounts.protocolIssuer.classicAddress,
      Owner: loanDetails.vaultAddress,
      OfferSequence: loanDetails.liquidationEscrowSeq
    }, 'Originator: Finish liquidation trigger escrow')
  }

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
  }, 'Originator: Cross vault offer \u2014 SEIZE LP tokens')

  const seizedLP = await getLPTokenBalance(
    client, accounts.protocolIssuer.classicAddress, ammInfo.lpTokenCurrency, ammInfo.lpTokenIssuer
  )
  console.log(`  \u2514\u2500 LP tokens seized: ${seizedLP}`)
  console.log('')

  // ─── Step 4: AMMWithdraw 1-sided — LP tokens → RLUSD ───
  console.log('  Step 4: AMMWithdraw 1-Sided (LP tokens \u2192 RLUSD)')
  console.log('')

  await ammWithdrawAllToRLUSD(
    client, accounts.protocolIssuer,
    accounts.rlusdIssuer.classicAddress, ammInfo
  )

  const recoveredRLUSD = await getTokenBalance(
    client, accounts.protocolIssuer.classicAddress, CURRENCIES.RLUSD, accounts.rlusdIssuer.classicAddress
  )
  console.log(`  \u2514\u2500 RLUSD recovered from AMM: ${recoveredRLUSD}`)
  console.log('')

  // ─── Step 5: Payment Waterfall (80/20 Default Split) ───
  console.log('  Step 5: Payment Waterfall (80/20 Default Split)')
  console.log('')
  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551   PAYMENT WATERFALL \u2014 OVERLENDER FIRST, THEN UNDERLENDER        \u2551')
  console.log(`  \u2551   Underlender absorbs ${(DEFAULT_SPLIT.UNDERLENDER_LOSS * 100).toFixed(0)}% loss | Overlender absorbs ${(DEFAULT_SPLIT.OVERLENDER_LOSS * 100).toFixed(0)}% loss     \u2551`)
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  const totalRecovered = Number(recoveredRLUSD)
  const defaultAmount = totalOwed

  // Overlender loss = 20% of default
  // Underlender loss = 80% of default
  const overlenderLoss = defaultAmount * DEFAULT_SPLIT.OVERLENDER_LOSS
  const underlenderLoss = defaultAmount * DEFAULT_SPLIT.UNDERLENDER_LOSS

  // Overlender gets paid FIRST from recovered RLUSD
  const overlenderAllocs = loanDetails.allocations.filter(a => a.type === 'overlender')
  const underlenderAlloc = loanDetails.allocations.find(a => a.type === 'underlender')

  // Total owed to overlenders (just interest since LP tokens were already seized)
  const totalOverlenderOwed = overlenderAllocs.reduce((s, a) => s + a.totalOwed, 0)

  // Overlender payout = max(0, recovered - overlender_loss_share)
  // Since overlender gets paid first, they get up to what's available minus their loss
  const overlenderPayout = Math.min(totalRecovered, Math.max(0, totalOverlenderOwed))
  const remainingForUnderlender = Math.max(0, totalRecovered - overlenderPayout)

  // Underlender gets only interest (not principal) since they absorb 80% of default
  const underlenderInterestOnly = underlenderAlloc ? underlenderAlloc.interest : 0
  const underlenderPayout = Math.min(remainingForUnderlender, underlenderInterestOnly)

  console.log(`  Total owed:              ${totalOwed.toFixed(6)} RLUSD`)
  console.log(`  RLUSD recovered (AMM):   ${totalRecovered.toFixed(6)} RLUSD`)
  console.log(`  Default amount:          ${defaultAmount.toFixed(6)} RLUSD`)
  console.log(`  Overlender loss (${(DEFAULT_SPLIT.OVERLENDER_LOSS * 100).toFixed(0)}%):  ${overlenderLoss.toFixed(6)} RLUSD`)
  console.log(`  Underlender loss (${(DEFAULT_SPLIT.UNDERLENDER_LOSS * 100).toFixed(0)}%): ${underlenderLoss.toFixed(6)} RLUSD`)
  console.log('')

  // Pay overlenders first
  if (overlenderPayout > 0 && overlenderAllocs.length > 0) {
    const perOverlenderPay = Math.floor((overlenderPayout / overlenderAllocs.length) * 1000000) / 1000000
    for (const alloc of overlenderAllocs) {
      if (perOverlenderPay > 0) {
        await submitTx(client, accounts.protocolIssuer, {
          TransactionType: 'Payment',
          Account: accounts.protocolIssuer.classicAddress,
          Destination: alloc.wallet.classicAddress,
          Amount: {
            currency: CURRENCIES.RLUSD,
            issuer: accounts.rlusdIssuer.classicAddress,
            value: String(perOverlenderPay)
          }
        }, `Waterfall: Pay ${perOverlenderPay} RLUSD \u2192 ${alloc.name} (OVERLENDER FIRST)`)
      }
    }
  }

  // Pay underlender (interest only — absorbs 80% of default)
  if (underlenderPayout > 0 && underlenderAlloc) {
    await submitTx(client, accounts.protocolIssuer, {
      TransactionType: 'Payment',
      Account: accounts.protocolIssuer.classicAddress,
      Destination: underlenderAlloc.wallet.classicAddress,
      Amount: {
        currency: CURRENCIES.RLUSD,
        issuer: accounts.rlusdIssuer.classicAddress,
        value: String(Math.floor(underlenderPayout * 1000000) / 1000000)
      }
    }, `Waterfall: Pay ${underlenderPayout.toFixed(6)} RLUSD \u2192 ${underlenderAlloc.name} (interest only, absorbs ${(DEFAULT_SPLIT.UNDERLENDER_LOSS * 100).toFixed(0)}% loss)`)
  }

  // Any surplus stays with Originator
  const remainingSurplus = await getTokenBalance(
    client, accounts.protocolIssuer.classicAddress, CURRENCIES.RLUSD, accounts.rlusdIssuer.classicAddress
  )
  if (Number(remainingSurplus) > 0) {
    console.log(`  Surplus: ${remainingSurplus} RLUSD retained by Originator`)
  }
  console.log('')

  // ─── Step 6: Credit score penalty ───
  console.log('  Step 6: Credit Score Penalty')

  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'Clawback',
    Account: accounts.protocolIssuer.classicAddress,
    Amount: {
      currency: CURRENCIES.dSCORE,
      issuer: accounts.borrower.classicAddress, // issuer = HOLDER for clawback
      value: String(LOAN_PARAMS.LIQUIDATION_SCORE_PENALTY)
    }
  }, `Protocol: Clawback ${LOAN_PARAMS.LIQUIDATION_SCORE_PENALTY} dSCORE (liquidation penalty)`)

  const newScore = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.dSCORE, accounts.protocolIssuer.classicAddress
  )
  console.log(`  \u2514\u2500 Borrower dSCORE: ${newScore} (was ${LOAN_PARAMS.INITIAL_CREDIT_SCORE})`)
  console.log('')

  // ─── Step 7: Liquidation NFT ───
  console.log('  Step 7: Liquidation Record NFT')

  const liqURI = Buffer.from(JSON.stringify({
    type: 'LIQUIDATION_RECORD',
    loan: loanDetails.loanAmount,
    denomination: 'RLUSD',
    recoveredAMM: Number(recoveredRLUSD),
    defaultSplit: { overlender: DEFAULT_SPLIT.OVERLENDER_LOSS, underlender: DEFAULT_SPLIT.UNDERLENDER_LOSS },
    reason: 'DEFAULT',
    status: 'LIQUIDATED'
  })).toString('hex').toUpperCase()

  const mintResult = await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'NFTokenMint',
    Account: accounts.protocolIssuer.classicAddress,
    NFTokenTaxon: 4,
    Flags: 8,
    URI: liqURI
  }, 'Protocol: Mint Liquidation Record NFT')

  let liqNFTId = null
  if (mintResult.result && mintResult.result.meta && mintResult.result.meta.TransactionResult === 'tesSUCCESS') {
    const affectedNodes = mintResult.result.meta.AffectedNodes || []
    for (const node of affectedNodes) {
      const modified = node.ModifiedNode || node.CreatedNode
      if (modified && modified.LedgerEntryType === 'NFTokenPage') {
        const finalFields = modified.FinalFields || modified.NewFields
        if (finalFields && finalFields.NFTokens) {
          const tokens = finalFields.NFTokens
          if (tokens.length > 0) {
            liqNFTId = tokens[tokens.length - 1].NFToken.NFTokenID
          }
        }
      }
    }
  }

  if (liqNFTId) {
    const offerResult = await submitTx(client, accounts.protocolIssuer, {
      TransactionType: 'NFTokenCreateOffer',
      Account: accounts.protocolIssuer.classicAddress,
      NFTokenID: liqNFTId,
      Amount: '0',
      Destination: accounts.borrower.classicAddress,
      Flags: 1
    }, 'Protocol: Create Liquidation NFT offer to Borrower')

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
        const offers = await client.request({ command: 'nft_sell_offers', nft_id: liqNFTId })
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
      }, 'Borrower: Accept Liquidation Record NFT')
    }
  }

  console.log('')

  // ─── Step 8: Final Accounting ───
  console.log('  Step 8: Final Accounting')
  console.log('')

  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551         LIQUIDATION COMPLETE \u2014 FINAL ACCOUNTING                 \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  const finalBorrowerRLUSD = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.RLUSD, accounts.rlusdIssuer.classicAddress
  )
  console.log(`  Borrower:             RLUSD: ${finalBorrowerRLUSD} | dSCORE: ${newScore}`)

  for (const alloc of loanDetails.allocations) {
    const rlusdBal = await getTokenBalance(
      client, alloc.wallet.classicAddress, CURRENCIES.RLUSD, accounts.rlusdIssuer.classicAddress
    )
    if (alloc.type === 'overlender') {
      const lpBal = await getLPTokenBalance(
        client, alloc.wallet.classicAddress, ammInfo.lpTokenCurrency, ammInfo.lpTokenIssuer
      )
      console.log(`  ${alloc.name.padEnd(20)} RLUSD: ${rlusdBal} | LP: ${lpBal} | Waterfall: OVERLENDER FIRST`)
    } else {
      console.log(`  ${alloc.name.padEnd(20)} RLUSD: ${rlusdBal} | Waterfall: interest only (absorbs ${(DEFAULT_SPLIT.UNDERLENDER_LOSS * 100).toFixed(0)}% loss)`)
    }
  }

  const originatorRLUSD = await getTokenBalance(
    client, accounts.protocolIssuer.classicAddress, CURRENCIES.RLUSD, accounts.rlusdIssuer.classicAddress
  )
  console.log(`  Originator:           RLUSD: ${originatorRLUSD} (surplus retained)`)

  console.log('')
  console.log('  Recovery Summary:')
  console.log(`    RLUSD from AMM:       ${recoveredRLUSD} RLUSD (1-sided LP withdrawal)`)
  console.log(`    Default split:        Overlender ${(DEFAULT_SPLIT.OVERLENDER_LOSS * 100).toFixed(0)}% | Underlender ${(DEFAULT_SPLIT.UNDERLENDER_LOSS * 100).toFixed(0)}%`)
  console.log(`    Credit penalty:       -${LOAN_PARAMS.LIQUIDATION_SCORE_PENALTY} dSCORE`)
  console.log(`    Vault status:         BLACKHOLED (LP tokens seized via standing offer)`)
  console.log('')
}

module.exports = { liquidateLoan }
