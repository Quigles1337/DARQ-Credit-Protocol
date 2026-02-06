'use strict'

const xrpl = require('xrpl')
const { CURRENCIES } = require('../config')
const { submitTx } = require('./tx')

// ═══════════════════════════════════════════════════════════════
//  AMM Helper Functions — Create, Deposit, Withdraw, Query
// ═══════════════════════════════════════════════════════════════

/**
 * Create an XRP/RLUSD AMM pool.
 * @returns {{ ammAccountId, lpTokenCurrency, lpTokenIssuer }}
 */
async function createAMM(client, creatorWallet, xrpAmount, rlusdAmount, rlusdIssuerAddress) {
  console.log('  Creating XRP/RLUSD AMM pool...')

  const result = await submitTx(client, creatorWallet, {
    TransactionType: 'AMMCreate',
    Account: creatorWallet.classicAddress,
    Amount: xrpl.xrpToDrops(String(xrpAmount)),
    Amount2: {
      currency: CURRENCIES.RLUSD,
      issuer: rlusdIssuerAddress,
      value: String(rlusdAmount)
    },
    TradingFee: 500 // 0.5% trading fee
  }, `AMMCreate: ${xrpAmount} XRP + ${rlusdAmount} RLUSD`)

  // Query the AMM to get the account and LP token info
  const ammInfo = await getAMMInfo(client, rlusdIssuerAddress)
  return ammInfo
}

/**
 * Query AMM info for the XRP/RLUSD pool.
 * @returns {{ ammAccountId, lpTokenCurrency, lpTokenIssuer, lpTokenBalance, xrpPool, rlusdPool }}
 */
async function getAMMInfo(client, rlusdIssuerAddress) {
  const ammResult = await client.request({
    command: 'amm_info',
    asset: { currency: 'XRP' },
    asset2: {
      currency: CURRENCIES.RLUSD,
      issuer: rlusdIssuerAddress
    }
  })

  const amm = ammResult.result.amm
  const lpToken = amm.lp_token

  return {
    ammAccountId: amm.account,
    lpTokenCurrency: lpToken.currency,
    lpTokenIssuer: lpToken.issuer,
    lpTokenBalance: lpToken.value,
    xrpPool: amm.amount,  // XRP amount in drops or string
    rlusdPool: amm.amount2 // RLUSD amount object
  }
}

/**
 * Deposit into the AMM (dual-asset) to receive LP tokens.
 * @returns {string} LP token amount received
 */
async function ammDeposit(client, depositorWallet, xrpAmount, rlusdAmount, rlusdIssuerAddress) {
  const result = await submitTx(client, depositorWallet, {
    TransactionType: 'AMMDeposit',
    Account: depositorWallet.classicAddress,
    Asset: { currency: 'XRP' },
    Asset2: {
      currency: CURRENCIES.RLUSD,
      issuer: rlusdIssuerAddress
    },
    Amount: xrpl.xrpToDrops(String(xrpAmount)),
    Amount2: {
      currency: CURRENCIES.RLUSD,
      issuer: rlusdIssuerAddress,
      value: String(rlusdAmount)
    },
    Flags: 0x00100000 // tfTwoAsset
  }, `AMMDeposit: ${xrpAmount} XRP + ${rlusdAmount} RLUSD`)

  return result
}

/**
 * Single-asset deposit into the AMM (RLUSD only) to receive LP tokens.
 */
async function ammDepositSingleRLUSD(client, depositorWallet, rlusdAmount, rlusdIssuerAddress) {
  const result = await submitTx(client, depositorWallet, {
    TransactionType: 'AMMDeposit',
    Account: depositorWallet.classicAddress,
    Asset: { currency: 'XRP' },
    Asset2: {
      currency: CURRENCIES.RLUSD,
      issuer: rlusdIssuerAddress
    },
    Amount: {
      currency: CURRENCIES.RLUSD,
      issuer: rlusdIssuerAddress,
      value: String(rlusdAmount)
    },
    Flags: 0x00080000 // tfSingleAsset
  }, `AMMDeposit (single): ${rlusdAmount} RLUSD`)

  return result
}

/**
 * One-sided AMM withdrawal — redeem ALL LP tokens for RLUSD only.
 * Used by originator on default to convert seized LP tokens to RLUSD.
 * @param {string} lpTokenAmount - amount of LP tokens to redeem (or use flag for all)
 */
async function ammWithdrawAllToRLUSD(client, withdrawerWallet, rlusdIssuerAddress, ammInfo) {
  const result = await submitTx(client, withdrawerWallet, {
    TransactionType: 'AMMWithdraw',
    Account: withdrawerWallet.classicAddress,
    Asset: { currency: 'XRP' },
    Asset2: {
      currency: CURRENCIES.RLUSD,
      issuer: rlusdIssuerAddress
    },
    Amount: {
      currency: CURRENCIES.RLUSD,
      issuer: rlusdIssuerAddress,
      value: '0' // Placeholder — tfOneAssetWithdrawAll uses all LP tokens
    },
    Flags: 0x00040000 // tfOneAssetWithdrawAll
  }, 'AMMWithdraw (1-sided): All LP tokens \u2192 RLUSD')

  return result
}

/**
 * Withdraw a specific amount of LP tokens for RLUSD (partial withdrawal).
 */
async function ammWithdrawLPForRLUSD(client, withdrawerWallet, lpTokenAmount, lpTokenCurrency, lpTokenIssuer, rlusdIssuerAddress) {
  const result = await submitTx(client, withdrawerWallet, {
    TransactionType: 'AMMWithdraw',
    Account: withdrawerWallet.classicAddress,
    Asset: { currency: 'XRP' },
    Asset2: {
      currency: CURRENCIES.RLUSD,
      issuer: rlusdIssuerAddress
    },
    LPTokenIn: {
      currency: lpTokenCurrency,
      issuer: lpTokenIssuer,
      value: String(lpTokenAmount)
    },
    Amount: {
      currency: CURRENCIES.RLUSD,
      issuer: rlusdIssuerAddress,
      value: '0'
    },
    Flags: 0x00040000 // tfOneAssetWithdrawAll — for partial, use tfOneAssetLPToken (0x00010000)
  }, `AMMWithdraw: ${lpTokenAmount} LP tokens \u2192 RLUSD`)

  return result
}

/**
 * Get LP token balance for a specific account.
 */
async function getLPTokenBalance(client, address, lpTokenCurrency, lpTokenIssuer) {
  try {
    const lines = await client.request({
      command: 'account_lines',
      account: address,
      ledger_index: 'validated'
    })
    const line = lines.result.lines.find(
      l => l.currency === lpTokenCurrency && l.account === lpTokenIssuer
    )
    return line ? line.balance : '0'
  } catch (err) {
    return '0'
  }
}

module.exports = {
  createAMM,
  getAMMInfo,
  ammDeposit,
  ammDepositSingleRLUSD,
  ammWithdrawAllToRLUSD,
  ammWithdrawLPForRLUSD,
  getLPTokenBalance,
}
