'use strict'

const xrpl = require('xrpl')
const { CURRENCIES, LOAN_PARAMS, BLACKHOLE_ADDRESS, POOL_TIERS } = require('../config')
const { submitTx, getLedgerTime, getOracleTime, rippleTimeFromNow } = require('../utils/tx')
const { getCheckIds, getTokenBalance } = require('../utils/state')
const { generateCryptoCondition } = require('../utils/crypto')
const { calculatePoolAllocation, formatPoolAllocation } = require('../utils/pools')

// ═══════════════════════════════════════════════════════════════
//  FLOW 3: borrowLoan() — ~40 transactions
//  Capital flows DIRECTLY from lenders to borrower.
//  Checks flow from borrower to each lender (forced repayment).
// ═══════════════════════════════════════════════════════════════

async function borrowLoan(client, accounts, requestedAmount, collateralAmount) {
  console.log('')
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log(`\u2551        FLOW 3: BORROW LOAN \u2014 ${requestedAmount} XRP (${collateralAmount} XRP collateral)       \u2551`)
  console.log('\u2551        Direct P2P lending via Checks (forced repayment)            \u2551')
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  // ─── Phase A: Credit Assessment ───
  console.log('  Phase A: Credit Assessment')

  // Issue initial credit score
  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'Payment',
    Account: accounts.protocolIssuer.classicAddress,
    Destination: accounts.borrower.classicAddress,
    Amount: {
      currency: CURRENCIES.dSCORE,
      issuer: accounts.protocolIssuer.classicAddress,
      value: String(LOAN_PARAMS.INITIAL_CREDIT_SCORE)
    }
  }, `Protocol: Issue ${LOAN_PARAMS.INITIAL_CREDIT_SCORE} dSCORE to Borrower`)

  // Update oracle price feed
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

  // Read borrower credit score
  const dScoreBalance = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.dSCORE, accounts.protocolIssuer.classicAddress
  )
  console.log(`  \u2514\u2500 Borrower dSCORE: ${dScoreBalance} (Tier: ${Number(dScoreBalance) >= 700 ? 'PRIME' : 'SUBPRIME'})`)
  console.log('')

  // ─── Phase B: Pool Matching & Weighted Average ───
  console.log('  Phase B: Pool Matching & Weighted Average Calculation')

  const pools = [
    { name: 'CONSERVATIVE', wallet: accounts.lenderConservative, rate: POOL_TIERS.CONSERVATIVE.rate, available: POOL_TIERS.CONSERVATIVE.deposit },
    { name: 'BALANCED',     wallet: accounts.lenderBalanced,     rate: POOL_TIERS.BALANCED.rate,     available: POOL_TIERS.BALANCED.deposit },
    { name: 'AGGRESSIVE',   wallet: accounts.lenderAggressive,   rate: POOL_TIERS.AGGRESSIVE.rate,   available: POOL_TIERS.AGGRESSIVE.deposit },
  ]

  const { allocations, weightedRate } = calculatePoolAllocation(requestedAmount, pools)
  console.log(formatPoolAllocation(allocations, weightedRate, requestedAmount))

  // ─── Phase C: Collateral Vault Creation (Blackhole Vault) ───
  console.log('  Phase C: Collateral Vault Creation (Blackhole Vault)')

  // Fund new vault account
  const vaultFunded = await client.fundWallet()
  const vaultWallet = vaultFunded.wallet
  console.log(`  [\u2713] Vault funded: ${vaultWallet.classicAddress}`)

  // Vault: TrustSet dCREDIT (for standing liquidation offer)
  await submitTx(client, vaultWallet, {
    TransactionType: 'TrustSet',
    Account: vaultWallet.classicAddress,
    LimitAmount: {
      currency: CURRENCIES.dCREDIT,
      issuer: accounts.protocolIssuer.classicAddress,
      value: '1000000'
    }
  }, 'Vault: TrustSet dCREDIT')

  // Borrower sends collateral to vault
  await submitTx(client, accounts.borrower, {
    TransactionType: 'Payment',
    Account: accounts.borrower.classicAddress,
    Destination: vaultWallet.classicAddress,
    Amount: xrpl.xrpToDrops(String(collateralAmount))
  }, `Borrower: Deposit ${collateralAmount} XRP collateral to Vault`)

  // Vault: Enable DepositAuth
  await submitTx(client, vaultWallet, {
    TransactionType: 'AccountSet',
    Account: vaultWallet.classicAddress,
    SetFlag: 9 // asfDepositAuth
  }, 'Vault: Enable DepositAuth')

  // Vault: DepositPreauth Borrower
  await submitTx(client, vaultWallet, {
    TransactionType: 'DepositPreauth',
    Account: vaultWallet.classicAddress,
    Authorize: accounts.borrower.classicAddress
  }, 'Vault: DepositPreauth Borrower')

  // Vault: DepositPreauth Liquidation Engine
  await submitTx(client, vaultWallet, {
    TransactionType: 'DepositPreauth',
    Account: vaultWallet.classicAddress,
    Authorize: accounts.liquidationEngine.classicAddress
  }, 'Vault: DepositPreauth Liquidation Engine')

  // Generate crypto-condition for hash-locked escrow
  const { conditionHex, fulfillmentHex } = generateCryptoCondition()

  // Calculate escrow times
  const maturityTime = await rippleTimeFromNow(client, LOAN_PARAMS.MATURITY_SECONDS)
  const expiryTime = await rippleTimeFromNow(client, LOAN_PARAMS.EXPIRY_SECONDS)
  const liquidationReadyTime = await rippleTimeFromNow(client, LOAN_PARAMS.LIQUIDATION_READY_SECONDS)

  // Collateral return escrow (60% of collateral, hash-locked + time-locked)
  const collateralReturnAmount = Math.floor(collateralAmount * LOAN_PARAMS.COLLATERAL_RETURN_FRACTION)
  const collateralEscrowResult = await submitTx(client, vaultWallet, {
    TransactionType: 'EscrowCreate',
    Account: vaultWallet.classicAddress,
    Destination: accounts.borrower.classicAddress,
    Amount: xrpl.xrpToDrops(String(collateralReturnAmount)),
    FinishAfter: maturityTime,
    CancelAfter: expiryTime,
    Condition: conditionHex
  }, `Vault: Create Hash-Locked Escrow (${collateralReturnAmount} XRP)`)

  // Save escrow sequence
  let collateralEscrowSeq = null
  if (collateralEscrowResult.result && collateralEscrowResult.result.tx_json) {
    collateralEscrowSeq = collateralEscrowResult.result.tx_json.Sequence
  }

  // Liquidation trigger escrow (small amount, time-locked only)
  const liquidationEscrowResult = await submitTx(client, vaultWallet, {
    TransactionType: 'EscrowCreate',
    Account: vaultWallet.classicAddress,
    Destination: accounts.liquidationEngine.classicAddress,
    Amount: xrpl.xrpToDrops(String(LOAN_PARAMS.LIQUIDATION_TRIGGER_XRP)),
    FinishAfter: liquidationReadyTime,
    CancelAfter: expiryTime
  }, `Vault: Create Liquidation Trigger Escrow (${LOAN_PARAMS.LIQUIDATION_TRIGGER_XRP} XRP)`)

  let liquidationEscrowSeq = null
  if (liquidationEscrowResult.result && liquidationEscrowResult.result.tx_json) {
    liquidationEscrowSeq = liquidationEscrowResult.result.tx_json.Sequence
  }

  // Standing DEX offer — remaining collateral for dCREDIT at liquidation price
  const remainingCollateral = collateralAmount - collateralReturnAmount - LOAN_PARAMS.LIQUIDATION_TRIGGER_XRP
  // Account reserve is 10 XRP on testnet, so we need to keep some in the vault
  const offerCollateral = Math.max(0, remainingCollateral - 12) // Keep reserve
  if (offerCollateral > 0) {
    await submitTx(client, vaultWallet, {
      TransactionType: 'OfferCreate',
      Account: vaultWallet.classicAddress,
      TakerPays: {
        currency: CURRENCIES.dCREDIT,
        issuer: accounts.protocolIssuer.classicAddress,
        value: String(offerCollateral)
      },
      TakerGets: xrpl.xrpToDrops(String(offerCollateral))
    }, `Vault: Standing Liquidation Offer (${offerCollateral} XRP for dCREDIT)`)
  }

  // ═══ BLACKHOLE THE VAULT — POINT OF NO RETURN ═══
  console.log('')
  console.log('  \u2588\u2588\u2588 BLACKHOLING VAULT \u2014 POINT OF NO RETURN \u2588\u2588\u2588')

  await submitTx(client, vaultWallet, {
    TransactionType: 'SetRegularKey',
    Account: vaultWallet.classicAddress,
    RegularKey: BLACKHOLE_ADDRESS
  }, 'Vault: SetRegularKey to blackhole address')

  await submitTx(client, vaultWallet, {
    TransactionType: 'AccountSet',
    Account: vaultWallet.classicAddress,
    SetFlag: 4 // asfDisableMaster
  }, 'Vault: Disable Master Key (PERMANENT)')

  console.log('  \u2588\u2588\u2588 VAULT PERMANENTLY BLACKHOLED \u2588\u2588\u2588')
  console.log('')

  // ─── Phase D: Direct Lending — Lender → Borrower ───
  console.log('  Phase D: Direct Lending (Capital flows Lender \u2192 Borrower)')

  for (const alloc of allocations) {
    await submitTx(client, alloc.wallet, {
      TransactionType: 'Payment',
      Account: alloc.wallet.classicAddress,
      Destination: accounts.borrower.classicAddress,
      Amount: xrpl.xrpToDrops(String(alloc.allocated))
    }, `${alloc.name} Lender: Send ${alloc.allocated} XRP \u2192 Borrower (DIRECT)`)
  }

  console.log('  \u2514\u2500 Protocol NEVER touched this capital. Lender \u2192 Borrower direct.')
  console.log('')

  // ─── Phase E: Forced Repayment Setup — Borrower Creates Checks ───
  console.log('  Phase E: Forced Repayment Setup (Borrower creates Checks)')

  const checkExpiration = await rippleTimeFromNow(client, LOAN_PARAMS.MATURITY_SECONDS + LOAN_PARAMS.CHECK_GRACE_SECONDS)

  for (const alloc of allocations) {
    await submitTx(client, accounts.borrower, {
      TransactionType: 'CheckCreate',
      Account: accounts.borrower.classicAddress,
      Destination: alloc.wallet.classicAddress,
      SendMax: xrpl.xrpToDrops(String(alloc.totalOwed)),
      Expiration: checkExpiration
    }, `Borrower: CheckCreate \u2192 ${alloc.name} Lender (${alloc.totalOwed} XRP)`)
  }

  // Get all Check IDs
  const checks = await getCheckIds(client, accounts.borrower.classicAddress)
  console.log(`  \u2514\u2500 ${checks.length} Checks created. Lenders can cash at maturity WITHOUT borrower.`)
  console.log('')

  // Associate checks with allocations
  for (const alloc of allocations) {
    const matchingCheck = checks.find(c => c.destination === alloc.wallet.classicAddress)
    if (matchingCheck) {
      alloc.checkId = matchingCheck.checkId
    }
  }

  // ─── Phase F: Debt Token Issuance ───
  console.log('  Phase F: Debt Token Issuance')

  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'Payment',
    Account: accounts.protocolIssuer.classicAddress,
    Destination: accounts.borrower.classicAddress,
    Amount: {
      currency: CURRENCIES.dCREDIT,
      issuer: accounts.protocolIssuer.classicAddress,
      value: String(requestedAmount)
    }
  }, `Protocol: Issue ${requestedAmount} dCREDIT to Borrower (debt token)`)

  // Origination fee — Borrower pays to Treasury
  if (LOAN_PARAMS.ORIGINATION_FEE_XRP > 0) {
    await submitTx(client, accounts.borrower, {
      TransactionType: 'Payment',
      Account: accounts.borrower.classicAddress,
      Destination: accounts.treasury.classicAddress,
      Amount: xrpl.xrpToDrops(String(LOAN_PARAMS.ORIGINATION_FEE_XRP))
    }, `Borrower: Pay ${LOAN_PARAMS.ORIGINATION_FEE_XRP} XRP origination fee to Treasury`)
  }
  console.log('')

  // ─── Phase G: Loan Position NFT ───
  console.log('  Phase G: Loan Position NFT')

  const loanNFTURI = Buffer.from(JSON.stringify({
    type: 'LOAN_POSITION',
    loan: requestedAmount,
    collateral: collateralAmount,
    rate: `${(weightedRate * 100).toFixed(2)}%`,
    vault: vaultWallet.classicAddress,
    lenders: allocations.length
  })).toString('hex').toUpperCase()

  const loanMintResult = await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'NFTokenMint',
    Account: accounts.protocolIssuer.classicAddress,
    NFTokenTaxon: 2,
    Flags: 8,
    URI: loanNFTURI
  }, 'Protocol: Mint Loan Position NFT')

  let loanNFTId = null
  if (loanMintResult.result && loanMintResult.result.meta && loanMintResult.result.meta.TransactionResult === 'tesSUCCESS') {
    const affectedNodes = loanMintResult.result.meta.AffectedNodes || []
    for (const node of affectedNodes) {
      const modified = node.ModifiedNode || node.CreatedNode
      if (modified && modified.LedgerEntryType === 'NFTokenPage') {
        const finalFields = modified.FinalFields || modified.NewFields
        if (finalFields && finalFields.NFTokens) {
          const tokens = finalFields.NFTokens
          if (tokens.length > 0) {
            loanNFTId = tokens[tokens.length - 1].NFToken.NFTokenID
          }
        }
      }
    }
  }

  if (loanNFTId) {
    const offerResult = await submitTx(client, accounts.protocolIssuer, {
      TransactionType: 'NFTokenCreateOffer',
      Account: accounts.protocolIssuer.classicAddress,
      NFTokenID: loanNFTId,
      Amount: '0',
      Destination: accounts.borrower.classicAddress,
      Flags: 1
    }, 'Protocol: Create Loan NFT sell offer to Borrower')

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
        const offers = await client.request({ command: 'nft_sell_offers', nft_id: loanNFTId })
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
      }, 'Borrower: Accept Loan Position NFT')
    }
  }
  console.log('')

  // ─── Phase H: Oracle + Final Logging ───
  console.log('  Phase H: Oracle Update & Final Logging')

  oracleTime = await getOracleTime(client)
  const utilization = Math.round((requestedAmount / 65) * 100)
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
          AssetPrice: String(utilization),
          Scale: 1
        }
      }
    ]
  }, `Oracle: Utilization = ${utilization}%`)

  // Build loan details
  const loanDetails = {
    loanAmount: requestedAmount,
    collateralAmount,
    vaultAddress: vaultWallet.classicAddress,
    collateralEscrowSeq,
    liquidationEscrowSeq,
    conditionHex,
    fulfillmentHex,
    allocations: allocations.map(a => ({
      lender: a.name,
      wallet: a.wallet,
      allocated: a.allocated,
      interest: a.interest,
      totalOwed: a.totalOwed,
      checkId: a.checkId || null,
      rate: a.rate
    })),
    weightedRate,
    loanNFTId,
    maturityTime,
    expiryTime,
    checkExpiration
  }

  // Summary
  console.log('')
  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551                LOAN ORIGINATED SUCCESSFULLY                     \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log(`  Loan Amount:          ${requestedAmount} XRP`)
  console.log(`  Collateral:           ${collateralAmount} XRP in blackholed vault`)
  console.log(`  Vault:                ${vaultWallet.classicAddress}`)
  console.log(`  Weighted Rate:        ${(weightedRate * 100).toFixed(2)}% APR`)
  console.log(`  Lenders:              ${allocations.length}`)
  for (const a of allocations) {
    console.log(`    ${a.name.padEnd(16)} ${a.allocated} XRP @ ${(a.rate * 100).toFixed(1)}% \u2192 Check: ${a.checkId ? a.checkId.substring(0, 12) + '...' : 'N/A'}`)
  }
  console.log(`  Collateral Escrow:    Seq ${collateralEscrowSeq} (hash-locked)`)
  console.log(`  Liquidation Escrow:   Seq ${liquidationEscrowSeq}`)
  console.log(`  Loan NFT:             ${loanNFTId ? loanNFTId.substring(0, 16) + '...' : 'N/A'}`)
  console.log(`  Capital intermediary: NONE (direct P2P)`)
  console.log('')

  return loanDetails
}

module.exports = { borrowLoan }
