'use strict'

const xrpl = require('xrpl')
const { CURRENCIES } = require('../config')
const { submitTx, getOracleTime } = require('../utils/tx')

// ═══════════════════════════════════════════════════════════════
//  FLOW 2: lenderDeposit() — ~6 transactions per lender
//  Registers lender capital commitment and issues receipt tokens.
//  Lender's XRP stays in their own account — NO transfer yet.
// ═══════════════════════════════════════════════════════════════

async function lenderDeposit(client, accounts, lenderWallet, amount, tierName, rate) {
  console.log('')
  console.log(`  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510`)
  console.log(`  \u2502  LENDER DEPOSIT: ${tierName.padEnd(14)} | ${amount} XRP @ ${(rate * 100).toFixed(0)}% APR      \u2502`)
  console.log(`  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`)
  console.log('')

  // 1. Issue dRECEIPT tokens to lender (represents their commitment to lend)
  await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'Payment',
    Account: accounts.protocolIssuer.classicAddress,
    Destination: lenderWallet.classicAddress,
    Amount: {
      currency: CURRENCIES.dRECEIPT,
      issuer: accounts.protocolIssuer.classicAddress,
      value: String(amount)
    }
  }, `Protocol: Issue ${amount} dRECEIPT to ${tierName} Lender`)

  // 2. Mint Lender Position NFT
  const nftURI = Buffer.from(JSON.stringify({
    type: 'LENDER_POSITION',
    tier: tierName,
    amount: amount,
    rate: rate,
    lender: lenderWallet.classicAddress
  })).toString('hex').toUpperCase()

  const mintResult = await submitTx(client, accounts.protocolIssuer, {
    TransactionType: 'NFTokenMint',
    Account: accounts.protocolIssuer.classicAddress,
    NFTokenTaxon: 1,
    Flags: 8, // tfTransferable
    URI: nftURI
  }, `Protocol: Mint ${tierName} Position NFT`)

  // Extract NFT Token ID
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
    // 3. Create sell offer to lender at 0
    const offerResult = await submitTx(client, accounts.protocolIssuer, {
      TransactionType: 'NFTokenCreateOffer',
      Account: accounts.protocolIssuer.classicAddress,
      NFTokenID: nftTokenId,
      Amount: '0',
      Destination: lenderWallet.classicAddress,
      Flags: 1 // tfSellNFToken
    }, `Protocol: Create NFT sell offer to ${tierName} Lender`)

    // Extract offer ID
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

    // Try to find the offer via account_objects if we couldn't extract from meta
    if (!offerId) {
      try {
        const offers = await client.request({
          command: 'nft_sell_offers',
          nft_id: nftTokenId
        })
        if (offers.result.offers && offers.result.offers.length > 0) {
          offerId = offers.result.offers[0].nft_offer_index
        }
      } catch (e) { /* ignore */ }
    }

    if (offerId) {
      // 4. Lender accepts the NFT offer
      await submitTx(client, lenderWallet, {
        TransactionType: 'NFTokenAcceptOffer',
        Account: lenderWallet.classicAddress,
        NFTokenSellOffer: offerId
      }, `${tierName} Lender: Accept Position NFT`)
    }
  }

  // 5. Update oracle with total liquidity
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
  }, `Oracle: Update liquidity after ${tierName} deposit`)

  console.log(`  \u2514\u2500 ${tierName} Lender registered: ${amount} XRP @ ${(rate * 100).toFixed(0)}% APR`)
  console.log(`     XRP stays in lender's account \u2014 no capital transfer yet`)
  console.log('')
}

module.exports = { lenderDeposit }
