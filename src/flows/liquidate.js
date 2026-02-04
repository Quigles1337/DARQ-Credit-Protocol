'use strict'

const xrpl = require('xrpl')
const { CURRENCIES, LOAN_PARAMS } = require('../config')
const { submitTx, getLedgerTime, getOracleTime, waitForRippleTime } = require('../utils/tx')
const { getXRPBalance, getTokenBalance, getAccountEscrows, getNFTs } = require('../utils/state')

// ═══════════════════════════════════════════════════════════════
//  FLOW 5: liquidateLoan() — ~18 transactions
//  Triggered on price crash or CheckCash failure (borrower default).
//  Partial recovery via Checks, remainder from collateral seizure.
// ═══════════════════════════════════════════════════════════════

async function liquidateLoan(client, accounts, loanDetails) {
  console.log('')
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('\u2551        FLOW 5: LIQUIDATION \u2014 BORROWER DEFAULT                     \u2551')
  console.log('\u2551        Price crash + account drain \u2192 collateral seizure           \u2551')
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  // ─── Step 1: Oracle price crash ───
  console.log('  Step 1: Oracle Price Crash')

  const oracleTime = await getOracleTime(client)
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
          AssetPrice: String(Math.round(LOAN_PARAMS.LIQUIDATION_XRP_USD_PRICE * 1000)),
          Scale: 3
        }
      }
    ]
  }, `Oracle: XRP/USD CRASH $${LOAN_PARAMS.XRP_USD_PRICE} \u2192 $${LOAN_PARAMS.LIQUIDATION_XRP_USD_PRICE}`)

  console.log(`  \u2514\u2500 Price below liquidation threshold ($${LOAN_PARAMS.LIQUIDATION_THRESHOLD})`)
  console.log('')

  // ─── Simulate borrower draining account ───
  console.log('  \u26A0 Simulating borrower draining account (default scenario)...')

  const borrowerBalance = await getXRPBalance(client, accounts.borrower.classicAddress)
  // Drain most funds — leave just enough for the smallest check to succeed
  // This demonstrates partial Check recovery (1 succeeds, 2 fail)
  const smallestCheck = Math.min(...loanDetails.allocations.map(a => a.totalOwed))
  const keepAmount = smallestCheck + 12 // Keep smallest check + reserve
  const drainAmount = Math.max(0, Number(borrowerBalance) - keepAmount)

  if (drainAmount > 0) {
    // Create a temp drain destination
    const drainDest = await client.fundWallet()
    await submitTx(client, accounts.borrower, {
      TransactionType: 'Payment',
      Account: accounts.borrower.classicAddress,
      Destination: drainDest.wallet.classicAddress,
      Amount: xrpl.xrpToDrops(String(Math.floor(drainAmount)))
    }, `Borrower: DRAIN ${Math.floor(drainAmount)} XRP (simulating default)`)
  }

  const postDrainBalance = await getXRPBalance(client, accounts.borrower.classicAddress)
  console.log(`  \u2514\u2500 Borrower balance after drain: ${postDrainBalance} XRP`)
  console.log('')

  // ─── Step 2: Attempt Check collection ───
  console.log('  Step 2: Attempt Check Collection (Pre-Liquidation)')
  console.log('')
  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551       CHECK COLLECTION ATTEMPT (PRE-LIQUIDATION)                \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  let recoveredViaChecks = 0
  const failedLenders = []
  const totalOwed = loanDetails.allocations.reduce((s, a) => s + a.totalOwed, 0)

  for (const alloc of loanDetails.allocations) {
    if (!alloc.checkId) {
      console.log(`  [\u2717] ${alloc.lender} Lender: No CheckID \u2014 skipped`)
      failedLenders.push(alloc)
      continue
    }

    const result = await submitTx(client, alloc.wallet, {
      TransactionType: 'CheckCash',
      Account: alloc.wallet.classicAddress,
      CheckID: alloc.checkId,
      Amount: xrpl.xrpToDrops(String(alloc.totalOwed))
    }, `${alloc.lender} Lender: CheckCash ${alloc.totalOwed} XRP`)

    const txResult = result.result && result.result.meta ? result.result.meta.TransactionResult : 'ERROR'
    if (txResult === 'tesSUCCESS') {
      recoveredViaChecks += alloc.totalOwed
    } else {
      failedLenders.push(alloc)
    }
  }

  const shortfall = totalOwed - recoveredViaChecks
  const recoveryPct = totalOwed > 0 ? ((recoveredViaChecks / totalOwed) * 100).toFixed(1) : '0'

  console.log('')
  console.log(`  Recovery via Checks: ${recoveredViaChecks.toFixed(6)} / ${totalOwed.toFixed(6)} XRP (${recoveryPct}%)`)
  if (shortfall > 0) {
    console.log(`  Shortfall:           ${shortfall.toFixed(6)} XRP \u2014 proceeding to collateral liquidation`)
  }
  console.log('')

  // ─── Step 3: Collateral seizure ───
  if (failedLenders.length > 0) {
    console.log('  Step 3: Collateral Seizure')

    // Wait for liquidation escrow maturity using ledger time
    console.log('  Waiting for liquidation trigger escrow maturity...')
    // Wait until ledger time passes the liquidation ready time
    // The escrow FinishAfter was set relative to borrow time
    const escrows = await getAccountEscrows(client, loanDetails.vaultAddress)
    if (escrows.length > 0) {
      // Find the liquidation trigger escrow (non-conditional one)
      const liqEscrow = escrows.find(e => !e.Condition)
      if (liqEscrow && liqEscrow.FinishAfter) {
        await waitForRippleTime(client, liqEscrow.FinishAfter)
      } else {
        await new Promise(r => setTimeout(r, 40000))
      }
    } else {
      await new Promise(r => setTimeout(r, 40000))
    }

    // Liquidation Engine finishes the trigger escrow
    if (loanDetails.liquidationEscrowSeq) {
      await submitTx(client, accounts.liquidationEngine, {
        TransactionType: 'EscrowFinish',
        Account: accounts.liquidationEngine.classicAddress,
        Owner: loanDetails.vaultAddress,
        OfferSequence: loanDetails.liquidationEscrowSeq
      }, 'Liquidation Engine: Finish liquidation trigger escrow')
    }

    // Liquidation Engine crosses the standing DEX offer
    // Issue some dCREDIT to liquidation engine so it can cross the offer
    const liquidationEngineNeedsDCREDIT = loanDetails.collateralAmount * 0.2
    await submitTx(client, accounts.protocolIssuer, {
      TransactionType: 'Payment',
      Account: accounts.protocolIssuer.classicAddress,
      Destination: accounts.liquidationEngine.classicAddress,
      Amount: {
        currency: CURRENCIES.dCREDIT,
        issuer: accounts.protocolIssuer.classicAddress,
        value: String(liquidationEngineNeedsDCREDIT)
      }
    }, `Protocol: Issue ${liquidationEngineNeedsDCREDIT} dCREDIT to Liquidation Engine`)

    // Cross the vault's standing offer
    await submitTx(client, accounts.liquidationEngine, {
      TransactionType: 'OfferCreate',
      Account: accounts.liquidationEngine.classicAddress,
      TakerPays: xrpl.xrpToDrops(String(Math.floor(loanDetails.collateralAmount * 0.2))),
      TakerGets: {
        currency: CURRENCIES.dCREDIT,
        issuer: accounts.protocolIssuer.classicAddress,
        value: String(liquidationEngineNeedsDCREDIT)
      },
      Flags: 0x00020000 // tfImmediateOrCancel
    }, 'Liquidation Engine: Cross vault standing offer (seize collateral)')

    console.log('')

    // ─── Step 4: Distribute recovered collateral ───
    console.log('  Step 4: Distribute Recovered Collateral')

    const liquidationEngineBalance = await getXRPBalance(client, accounts.liquidationEngine.classicAddress)
    const availableForDistribution = Math.max(0, Number(liquidationEngineBalance) - 15) // Keep reserve

    if (availableForDistribution > 0 && failedLenders.length > 0) {
      const totalShortfall = failedLenders.reduce((s, l) => s + l.totalOwed, 0)

      for (const lender of failedLenders) {
        const share = (lender.totalOwed / totalShortfall) * availableForDistribution
        const payout = Math.floor(share * 1000000) / 1000000

        if (payout > 0) {
          await submitTx(client, accounts.liquidationEngine, {
            TransactionType: 'Payment',
            Account: accounts.liquidationEngine.classicAddress,
            Destination: lender.wallet.classicAddress,
            Amount: xrpl.xrpToDrops(String(payout))
          }, `Liquidation Engine: Pay ${payout} XRP \u2192 ${lender.lender} Lender (recovery)`)
        }
      }

      // Liquidation bonus to treasury (any surplus)
      const remainingLE = await getXRPBalance(client, accounts.liquidationEngine.classicAddress)
      const surplus = Math.max(0, Number(remainingLE) - 12)
      if (surplus > 1) {
        await submitTx(client, accounts.liquidationEngine, {
          TransactionType: 'Payment',
          Account: accounts.liquidationEngine.classicAddress,
          Destination: accounts.treasury.classicAddress,
          Amount: xrpl.xrpToDrops(String(Math.floor(surplus)))
        }, `Liquidation Engine: Pay ${Math.floor(surplus)} XRP liquidation bonus \u2192 Treasury`)
      }
    }
    console.log('')
  }

  // ─── Step 5: Credit score penalty ───
  console.log('  Step 5: Credit Score Penalty')

  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'Clawback',
    Account: accounts.protocolIssuer.classicAddress,
    Amount: {
      currency: CURRENCIES.dSCORE,
      issuer: accounts.borrower.classicAddress, // NOTE: issuer = HOLDER for clawback
      value: String(LOAN_PARAMS.LIQUIDATION_SCORE_PENALTY)
    }
  }, `Protocol: Clawback ${LOAN_PARAMS.LIQUIDATION_SCORE_PENALTY} dSCORE (liquidation penalty)`)

  const newScore = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.dSCORE, accounts.protocolIssuer.classicAddress
  )
  console.log(`  \u2514\u2500 Borrower dSCORE: ${newScore} (was ${LOAN_PARAMS.INITIAL_CREDIT_SCORE})`)
  console.log('')

  // ─── Step 6: Liquidation NFT + Oracle ───
  console.log('  Step 6: Liquidation Record NFT')

  const liqURI = Buffer.from(JSON.stringify({
    type: 'LIQUIDATION_RECORD',
    loan: loanDetails.loanAmount,
    recoveredChecks: recoveredViaChecks,
    shortfall: shortfall,
    reason: 'PRICE_CRASH_AND_DEFAULT',
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

  // Oracle update
  const oracleTime2 = await getOracleTime(client)
  await submitTx(client, accounts.oracleCommittee, {
    TransactionType: 'OracleSet',
    Account: accounts.oracleCommittee.classicAddress,
    OracleDocumentID: 2,
    Provider: Buffer.from('DARQ-Oracle').toString('hex'),
    AssetClass: Buffer.from('utilization').toString('hex'),
    LastUpdateTime: oracleTime2,
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
  }, 'Oracle: Utilization = 0% (loan liquidated)')
  console.log('')

  // ─── Step 7: Final accounting ───
  console.log('  Step 7: Final Accounting')
  console.log('')

  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551              LIQUIDATION COMPLETE \u2014 FINAL ACCOUNTING             \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  // Log all final balances
  const finalBorrower = await getXRPBalance(client, accounts.borrower.classicAddress)
  console.log(`  Borrower:             ${finalBorrower} XRP | dSCORE: ${newScore}`)

  for (const alloc of loanDetails.allocations) {
    const lenderBalance = await getXRPBalance(client, alloc.wallet.classicAddress)
    const wasRecovered = !failedLenders.find(f => f.lender === alloc.lender)
    const status = wasRecovered ? 'RECOVERED via Check' : 'RECOVERED via collateral'
    console.log(`  ${alloc.lender.padEnd(20)} ${lenderBalance} XRP | ${status}`)
  }

  const treasuryBalance = await getXRPBalance(client, accounts.treasury.classicAddress)
  console.log(`  Treasury:             ${treasuryBalance} XRP`)

  console.log('')
  console.log('  Recovery Summary:')
  console.log(`    Check recovery:       ${recoveredViaChecks.toFixed(6)} XRP (${recoveryPct}%)`)
  console.log(`    Collateral seizure:   Active (vault DEX offer crossed)`)
  console.log(`    Credit penalty:       -${LOAN_PARAMS.LIQUIDATION_SCORE_PENALTY} dSCORE`)
  console.log(`    Vault status:         BLACKHOLED (immutable)`)
  console.log('')
}

module.exports = { liquidateLoan }
