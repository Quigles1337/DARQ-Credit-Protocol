'use strict'

const xrpl = require('xrpl')
const { CURRENCIES } = require('../config')
const { submitTx } = require('../utils/tx')
const { getLPTokenBalance } = require('../utils/amm')

// ═══════════════════════════════════════════════════════════════
//  FLOW 2: Lender Deposits
//  Overlender: sends LP tokens to originator (collateral commitment)
//  Underlender: sends RLUSD to originator (capital commitment)
// ═══════════════════════════════════════════════════════════════

/**
 * Overlender deposits LP tokens to Protocol Issuer (Originator).
 * Gets dRECEIPT + Position NFT in return.
 */
async function overlenderDeposit(client, accounts, overlenderWallet, overlenderName) {
  const ammInfo = accounts._ammInfo

  console.log('')
  console.log(`  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510`)
  console.log(`  \u2502  OVERLENDER DEPOSIT: ${overlenderName.padEnd(12)} | LP Tokens @ ${(require('../config').LOAN_PARAMS.OVERLENDER_RATE * 100).toFixed(0)}% APR  \u2502`)
  console.log(`  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`)
  console.log('')

  // 1. Get LP token balance
  const lpBalance = await getLPTokenBalance(
    client, overlenderWallet.classicAddress, ammInfo.lpTokenCurrency, ammInfo.lpTokenIssuer
  )
  console.log(`  \u2514\u2500 ${overlenderName} LP token balance: ${lpBalance}`)

  // 2. Send LP tokens to originator (Protocol Issuer)
  await submitTx(client, overlenderWallet, {
    TransactionType: 'Payment',
    Account: overlenderWallet.classicAddress,
    Destination: accounts.protocolIssuer.classicAddress,
    Amount: {
      currency: ammInfo.lpTokenCurrency,
      issuer: ammInfo.lpTokenIssuer,
      value: lpBalance
    }
  }, `${overlenderName}: Send ${lpBalance} LP tokens \u2192 Originator`)

  // 3. Issue dRECEIPT to overlender
  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'Payment',
    Account: accounts.protocolIssuer.classicAddress,
    Destination: overlenderWallet.classicAddress,
    Amount: {
      currency: CURRENCIES.dRECEIPT,
      issuer: accounts.protocolIssuer.classicAddress,
      value: lpBalance
    }
  }, `Protocol: Issue ${lpBalance} dRECEIPT to ${overlenderName}`)

  // 4. Mint Overlender Position NFT
  const nftResult = await mintPositionNFT(client, accounts, overlenderWallet, {
    type: 'OVERLENDER_POSITION',
    lender: overlenderName,
    lpTokens: lpBalance,
    rate: require('../config').LOAN_PARAMS.OVERLENDER_RATE,
    address: overlenderWallet.classicAddress
  })

  console.log(`  \u2514\u2500 ${overlenderName} registered: ${lpBalance} LP tokens deposited`)
  console.log('')

  return { lpBalance }
}

/**
 * Underlender deposits RLUSD to Protocol Issuer (Originator).
 * Gets dRECEIPT + Position NFT in return.
 */
async function underlenderDeposit(client, accounts, underlenderWallet, underlenderName, rlusdAmount) {
  console.log('')
  console.log(`  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510`)
  console.log(`  \u2502  UNDERLENDER DEPOSIT: ${underlenderName.padEnd(11)} | ${rlusdAmount} RLUSD @ ${(require('../config').LOAN_PARAMS.UNDERLENDER_RATE * 100).toFixed(0)}% APR  \u2502`)
  console.log(`  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`)
  console.log('')

  // 1. Send RLUSD to originator (Protocol Issuer)
  await submitTx(client, underlenderWallet, {
    TransactionType: 'Payment',
    Account: underlenderWallet.classicAddress,
    Destination: accounts.protocolIssuer.classicAddress,
    Amount: {
      currency: CURRENCIES.RLUSD,
      issuer: accounts.rlusdIssuer.classicAddress,
      value: String(rlusdAmount)
    }
  }, `${underlenderName}: Send ${rlusdAmount} RLUSD \u2192 Originator`)

  // 2. Issue dRECEIPT to underlender
  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'Payment',
    Account: accounts.protocolIssuer.classicAddress,
    Destination: underlenderWallet.classicAddress,
    Amount: {
      currency: CURRENCIES.dRECEIPT,
      issuer: accounts.protocolIssuer.classicAddress,
      value: String(rlusdAmount)
    }
  }, `Protocol: Issue ${rlusdAmount} dRECEIPT to ${underlenderName}`)

  // 3. Mint Underlender Position NFT
  await mintPositionNFT(client, accounts, underlenderWallet, {
    type: 'UNDERLENDER_POSITION',
    lender: underlenderName,
    rlusdAmount,
    rate: require('../config').LOAN_PARAMS.UNDERLENDER_RATE,
    address: underlenderWallet.classicAddress
  })

  console.log(`  \u2514\u2500 ${underlenderName} registered: ${rlusdAmount} RLUSD deposited`)
  console.log('')
}

/**
 * Mint and transfer a Position NFT to lender.
 */
async function mintPositionNFT(client, accounts, lenderWallet, metadata) {
  const nftURI = Buffer.from(JSON.stringify(metadata)).toString('hex').toUpperCase()

  const mintResult = await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'NFTokenMint',
    Account: accounts.protocolIssuer.classicAddress,
    NFTokenTaxon: 1,
    Flags: 8, // tfTransferable
    URI: nftURI
  }, `Protocol: Mint ${metadata.type} NFT`)

  let nftTokenId = null
  if (mintResult.result && mintResult.result.meta && mintResult.result.meta.TransactionResult === 'tesSUCCESS') {
    const affectedNodes = mintResult.result.meta.AffectedNodes || []
    for (const node of affectedNodes) {
      const modified = node.ModifiedNode || node.CreatedNode
      if (modified && modified.LedgerEntryType === 'NFTokenPage') {
        const finalFields = modified.FinalFields || modified.NewFields
        if (finalFields && finalFields.NFTokens) {
          const tokens = finalFields.NFTokens
          if (tokens.length > 0) {
            nftTokenId = tokens[tokens.length - 1].NFToken.NFTokenID
          }
        }
      }
    }
  }

  if (nftTokenId) {
    const offerResult = await submitTx(client, accounts.protocolIssuer, {
      TransactionType: 'NFTokenCreateOffer',
      Account: accounts.protocolIssuer.classicAddress,
      NFTokenID: nftTokenId,
      Amount: '0',
      Destination: lenderWallet.classicAddress,
      Flags: 1 // tfSellNFToken
    }, `Protocol: Create NFT sell offer to ${metadata.lender || 'Lender'}`)

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
        const offers = await client.request({ command: 'nft_sell_offers', nft_id: nftTokenId })
        if (offers.result.offers && offers.result.offers.length > 0) {
          offerId = offers.result.offers[0].nft_offer_index
        }
      } catch (e) { /* ignore */ }
    }
    if (offerId) {
      await submitTx(client, lenderWallet, {
        TransactionType: 'NFTokenAcceptOffer',
        Account: lenderWallet.classicAddress,
        NFTokenSellOffer: offerId
      }, `${metadata.lender || 'Lender'}: Accept Position NFT`)
    }
  }

  return nftTokenId
}

module.exports = { overlenderDeposit, underlenderDeposit }
