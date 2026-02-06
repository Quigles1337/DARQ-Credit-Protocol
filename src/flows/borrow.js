'use strict'

const xrpl = require('xrpl')
const { CURRENCIES, LOAN_PARAMS, BLACKHOLE_ADDRESS, LENDER_SPLIT } = require('../config')
const { submitTx, getLedgerTime, rippleTimeFromNow } = require('../utils/tx')
const { getCheckIds, getTokenBalance } = require('../utils/state')
const { getLPTokenBalance } = require('../utils/amm')
const { generateCryptoCondition } = require('../utils/crypto')
const { calculateLoanAllocation, formatLoanAllocation } = require('../utils/pools')

// ═══════════════════════════════════════════════════════════════
//  FLOW 3: borrowLoan() — ~45 transactions
//  LP token vault (blackholed) + RLUSD lending + RLUSD Checks
//  Capital: Underlender RLUSD → Originator → Borrower
//  Collateral: Overlender LP tokens → Vault (blackholed)
// ═══════════════════════════════════════════════════════════════

async function borrowLoan(client, accounts) {
  const ammInfo = accounts._ammInfo
  const loanAmount = LOAN_PARAMS.LOAN_AMOUNT_RLUSD

  console.log('')
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log(`\u2551   FLOW 3: BORROW LOAN \u2014 ${loanAmount} RLUSD (AMM-Backed Overlender)          \u2551`)
  console.log('\u2551   LP token vault + RLUSD Checks (forced repayment)                  \u2551')
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log('')

  // ─── Phase A: Credit Assessment ───
  console.log('  Phase A: Credit Assessment')

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

  const dScoreBalance = await getTokenBalance(
    client, accounts.borrower.classicAddress, CURRENCIES.dSCORE, accounts.protocolIssuer.classicAddress
  )
  console.log(`  \u2514\u2500 Borrower dSCORE: ${dScoreBalance} (Tier: ${Number(dScoreBalance) >= 700 ? 'PRIME' : 'SUBPRIME'})`)
  console.log('')

  // ─── Phase B: Pool Matching — Overlender/Underlender Split ───
  console.log('  Phase B: Pool Matching (Overlender/Underlender Split)')

  // Get originator's LP token balance (deposited by overlenders)
  const originatorLP = await getLPTokenBalance(
    client, accounts.protocolIssuer.classicAddress, ammInfo.lpTokenCurrency, ammInfo.lpTokenIssuer
  )

  // Build overlender list with LP balances (proportional share)
  const overlenderNames = ['overlender1', 'overlender2']
  const totalLPFromOverlenders = Number(originatorLP)
  const perOverlenderLP = (totalLPFromOverlenders / overlenderNames.length).toFixed(6)

  const overlenderWallets = overlenderNames.map(name => ({
    name: name.toUpperCase(),
    wallet: accounts[name],
    lpBalance: perOverlenderLP,
  }))

  const underlender = {
    name: 'UNDERLENDER1',
    wallet: accounts.underlender1,
  }

  const { allocations, weightedRate } = calculateLoanAllocation(loanAmount, overlenderWallets, underlender)
  console.log(formatLoanAllocation(allocations, weightedRate, loanAmount))

  // ─── Phase C: Collateral Vault Creation (Blackhole Vault for LP Tokens) ───
  console.log('  Phase C: LP Token Vault Creation (Blackhole Vault)')

  // Fund new vault account
  const vaultFunded = await client.fundWallet()
  const vaultWallet = vaultFunded.wallet
  console.log(`  [\u2713] Vault funded: ${vaultWallet.classicAddress}`)

  // Vault: TrustSet for LP tokens
  await submitTx(client, vaultWallet, {
    TransactionType: 'TrustSet',
    Account: vaultWallet.classicAddress,
    LimitAmount: {
      currency: ammInfo.lpTokenCurrency,
      issuer: ammInfo.lpTokenIssuer,
      value: '10000000'
    }
  }, 'Vault: TrustSet LP Token')

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

  // Originator sends ALL LP tokens to vault
  const lpToVault = originatorLP
  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'Payment',
    Account: accounts.protocolIssuer.classicAddress,
    Destination: vaultWallet.classicAddress,
    Amount: {
      currency: ammInfo.lpTokenCurrency,
      issuer: ammInfo.lpTokenIssuer,
      value: lpToVault
    }
  }, `Originator: Send ${lpToVault} LP tokens \u2192 Vault`)

  // Vault: Enable DepositAuth
  await submitTx(client, vaultWallet, {
    TransactionType: 'AccountSet',
    Account: vaultWallet.classicAddress,
    SetFlag: 9 // asfDepositAuth
  }, 'Vault: Enable DepositAuth')

  // Vault: DepositPreauth Originator (for LP token return on repay)
  await submitTx(client, vaultWallet, {
    TransactionType: 'DepositPreauth',
    Account: vaultWallet.classicAddress,
    Authorize: accounts.protocolIssuer.classicAddress
  }, 'Vault: DepositPreauth Originator')

  // Calculate escrow times
  const liquidationReadyTime = await rippleTimeFromNow(client, LOAN_PARAMS.LIQUIDATION_READY_SECONDS)
  const expiryTime = await rippleTimeFromNow(client, LOAN_PARAMS.EXPIRY_SECONDS)

  // Liquidation trigger escrow (XRP, time-locked only — releases after LIQUIDATION_READY_SECONDS)
  const liquidationEscrowResult = await submitTx(client, vaultWallet, {
    TransactionType: 'EscrowCreate',
    Account: vaultWallet.classicAddress,
    Destination: accounts.protocolIssuer.classicAddress,
    Amount: xrpl.xrpToDrops(String(LOAN_PARAMS.LIQUIDATION_TRIGGER_XRP)),
    FinishAfter: liquidationReadyTime,
    CancelAfter: expiryTime
  }, `Vault: Create Liquidation Trigger Escrow (${LOAN_PARAMS.LIQUIDATION_TRIGGER_XRP} XRP)`)

  let liquidationEscrowSeq = null
  if (liquidationEscrowResult.result && liquidationEscrowResult.result.tx_json) {
    liquidationEscrowSeq = liquidationEscrowResult.result.tx_json.Sequence
  }

  // Standing DEX offer — LP tokens for dCREDIT (seizure mechanism)
  // Anyone with dCREDIT can cross this offer to extract LP tokens from vault
  await submitTx(client, vaultWallet, {
    TransactionType: 'OfferCreate',
    Account: vaultWallet.classicAddress,
    TakerPays: {
      currency: CURRENCIES.dCREDIT,
      issuer: accounts.protocolIssuer.classicAddress,
      value: lpToVault // 1:1 ratio with LP tokens for simplicity
    },
    TakerGets: {
      currency: ammInfo.lpTokenCurrency,
      issuer: ammInfo.lpTokenIssuer,
      value: lpToVault
    }
  }, `Vault: Standing Offer (${lpToVault} LP tokens for dCREDIT)`)

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

  // ─── Phase D: Direct RLUSD Lending — Originator → Borrower ───
  console.log('  Phase D: Direct RLUSD Lending (Underlender capital \u2192 Borrower)')

  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'Payment',
    Account: accounts.protocolIssuer.classicAddress,
    Destination: accounts.borrower.classicAddress,
    Amount: {
      currency: CURRENCIES.RLUSD,
      issuer: accounts.rlusdIssuer.classicAddress,
      value: String(loanAmount)
    }
  }, `Originator: Send ${loanAmount} RLUSD \u2192 Borrower (loan disbursement)`)

  console.log('  \u2514\u2500 Capital flow: Underlender \u2192 Originator \u2192 Borrower')
  console.log('')

  // ─── Phase E: Forced Repayment Setup — RLUSD Checks ───
  console.log('  Phase E: Forced Repayment Setup (Borrower creates RLUSD Checks)')

  const checkExpiration = await rippleTimeFromNow(client, LOAN_PARAMS.MATURITY_SECONDS + LOAN_PARAMS.CHECK_GRACE_SECONDS)

  for (const alloc of allocations) {
    await submitTx(client, accounts.borrower, {
      TransactionType: 'CheckCreate',
      Account: accounts.borrower.classicAddress,
      Destination: alloc.wallet.classicAddress,
      SendMax: {
        currency: CURRENCIES.RLUSD,
        issuer: accounts.rlusdIssuer.classicAddress,
        value: String(alloc.totalOwed)
      },
      Expiration: checkExpiration
    }, `Borrower: CheckCreate \u2192 ${alloc.name} (${alloc.totalOwed} RLUSD)`)
  }

  // Get all Check IDs and associate with allocations
  const checks = await getCheckIds(client, accounts.borrower.classicAddress)
  console.log(`  \u2514\u2500 ${checks.length} RLUSD Checks created. Lenders can cash at maturity.`)
  console.log('')

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
      value: String(loanAmount)
    }
  }, `Protocol: Issue ${loanAmount} dCREDIT to Borrower (debt token)`)

  // Origination fee in RLUSD
  if (LOAN_PARAMS.ORIGINATION_FEE_RLUSD > 0) {
    await submitTx(client, accounts.borrower, {
      TransactionType: 'Payment',
      Account: accounts.borrower.classicAddress,
      Destination: accounts.protocolIssuer.classicAddress,
      Amount: {
        currency: CURRENCIES.RLUSD,
        issuer: accounts.rlusdIssuer.classicAddress,
        value: String(LOAN_PARAMS.ORIGINATION_FEE_RLUSD)
      }
    }, `Borrower: Pay ${LOAN_PARAMS.ORIGINATION_FEE_RLUSD} RLUSD origination fee to Originator`)
  }
  console.log('')

  // ─── Phase G: Loan Position NFT ───
  console.log('  Phase G: Loan Position NFT')

  const loanNFTURI = Buffer.from(JSON.stringify({
    type: 'LOAN_POSITION',
    loan: loanAmount,
    denomination: 'RLUSD',
    lpCollateral: lpToVault,
    rate: `${(weightedRate * 100).toFixed(2)}%`,
    vault: vaultWallet.classicAddress,
    overlenders: overlenderNames.length,
    underlenders: 1
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

  // ─── Phase H: Final Logging ───
  console.log('  Phase H: Final Logging')

  // Build loan details
  const loanDetails = {
    loanAmount,
    denomination: 'RLUSD',
    lpCollateral: lpToVault,
    vaultAddress: vaultWallet.classicAddress,
    liquidationEscrowSeq,
    allocations: allocations.map(a => ({
      ...a,
      wallet: a.wallet, // keep wallet reference
    })),
    weightedRate,
    loanNFTId,
    checkExpiration,
    ammInfo,
  }

  // Summary
  console.log('')
  console.log('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  console.log('  \u2551                LOAN ORIGINATED SUCCESSFULLY                     \u2551')
  console.log('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  console.log(`  Loan Amount:          ${loanAmount} RLUSD`)
  console.log(`  LP Collateral:        ${lpToVault} LP tokens in blackholed vault`)
  console.log(`  Vault:                ${vaultWallet.classicAddress}`)
  console.log(`  Weighted Rate:        ${(weightedRate * 100).toFixed(2)}% APR`)
  console.log(`  Lenders:`)
  for (const a of allocations) {
    if (a.type === 'overlender') {
      console.log(`    ${a.name.padEnd(16)} LP collateral (${a.backingValue} RLUSD backing) @ ${(a.rate * 100).toFixed(1)}% \u2192 Check: ${a.checkId ? a.checkId.substring(0, 12) + '...' : 'N/A'}`)
    } else {
      console.log(`    ${a.name.padEnd(16)} ${a.principal} RLUSD capital @ ${(a.rate * 100).toFixed(1)}% \u2192 Check: ${a.checkId ? a.checkId.substring(0, 12) + '...' : 'N/A'}`)
    }
  }
  console.log(`  Liquidation Escrow:   Seq ${liquidationEscrowSeq}`)
  console.log(`  Loan NFT:             ${loanNFTId ? loanNFTId.substring(0, 16) + '...' : 'N/A'}`)
  console.log('')

  return loanDetails
}

module.exports = { borrowLoan }
