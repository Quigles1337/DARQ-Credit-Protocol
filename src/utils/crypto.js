'use strict'

const cc = require('five-bells-condition')
const crypto = require('crypto')

// ═══════════════════════════════════════════════════════════════
//  Crypto-Condition Generation (PREIMAGE-SHA-256)
// ═══════════════════════════════════════════════════════════════

function generateCryptoCondition() {
  const preimage = crypto.randomBytes(32)
  const fulfillment = new cc.PreimageSha256()
  fulfillment.setPreimage(preimage)

  const conditionHex = fulfillment.getConditionBinary().toString('hex').toUpperCase()
  const fulfillmentHex = fulfillment.serializeBinary().toString('hex').toUpperCase()

  return { conditionHex, fulfillmentHex }
}

module.exports = { generateCryptoCondition }
