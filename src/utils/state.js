'use strict'

const xrpl = require('xrpl')

// ═══════════════════════════════════════════════════════════════
//  Ledger State Query Utilities
// ═══════════════════════════════════════════════════════════════

async function getXRPBalance(client, address) {
  try {
    const info = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated'
    })
    return String(xrpl.dropsToXrp(info.result.account_data.Balance))
  } catch (err) {
    return '0'
  }
}

async function getTrustLines(client, address) {
  try {
    const lines = await client.request({
      command: 'account_lines',
      account: address,
      ledger_index: 'validated'
    })
    return lines.result.lines
  } catch (err) {
    return []
  }
}

async function getAccountObjects(client, address, type) {
  try {
    const params = {
      command: 'account_objects',
      account: address,
      ledger_index: 'validated'
    }
    if (type) params.type = type
    const objects = await client.request(params)
    return objects.result.account_objects
  } catch (err) {
    return []
  }
}

async function getCheckIds(client, accountAddress) {
  const objects = await getAccountObjects(client, accountAddress, 'check')
  return objects.map(obj => ({
    checkId: obj.index,
    destination: obj.Destination,
    sendMax: obj.SendMax,
    expiration: obj.Expiration
  }))
}

async function getTokenBalance(client, address, currencyHex, issuer) {
  const lines = await getTrustLines(client, address)
  const line = lines.find(l => l.currency === currencyHex && l.account === issuer)
  return line ? line.balance : '0'
}

async function getNFTs(client, address) {
  try {
    const result = await client.request({
      command: 'account_nfts',
      account: address,
      ledger_index: 'validated'
    })
    return result.result.account_nfts
  } catch (err) {
    return []
  }
}

async function getAccountEscrows(client, address) {
  return getAccountObjects(client, address, 'escrow')
}

async function getRLUSDBalance(client, address, rlusdCurrencyHex, rlusdIssuerAddress) {
  return getTokenBalance(client, address, rlusdCurrencyHex, rlusdIssuerAddress)
}

async function getLPTokenBalance(client, address, lpTokenCurrency, lpTokenIssuer) {
  return getTokenBalance(client, address, lpTokenCurrency, lpTokenIssuer)
}

module.exports = {
  getXRPBalance,
  getTrustLines,
  getAccountObjects,
  getCheckIds,
  getTokenBalance,
  getNFTs,
  getAccountEscrows,
  getRLUSDBalance,
  getLPTokenBalance,
}
