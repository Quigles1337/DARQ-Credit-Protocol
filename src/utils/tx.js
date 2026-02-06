'use strict'

const xrpl = require('xrpl')
const { RIPPLE_EPOCH_OFFSET } = require('../config')

// ═══════════════════════════════════════════════════════════════
//  Transaction Submission & Time Utilities
// ═══════════════════════════════════════════════════════════════

let txCount = 0

async function submitTx(client, wallet, txJson, description) {
  txCount++
  try {
    const prepared = await client.autofill(txJson)
    const signed = wallet.sign(prepared)
    const result = await client.submitAndWait(signed.tx_blob)
    const txResult = result.result.meta.TransactionResult
    const marker = txResult === 'tesSUCCESS' ? '\u2713' : '\u2717'
    console.log(`  [${marker}] ${description}: ${txResult}`)
    if (txResult !== 'tesSUCCESS') {
      console.error(`      FAILED: ${txResult}`)
    }
    return result
  } catch (err) {
    console.log(`  [\u2717] ${description}: ERROR`)
    console.error(`      ${err.message}`)
    return { error: err.message, result: { meta: { TransactionResult: 'ERROR' } } }
  }
}

// Get current time from validated ledger (avoids tecINVALID_UPDATE_TIME)
async function getLedgerTime(client) {
  const ledger = await client.request({ command: 'ledger', ledger_index: 'validated' })
  return ledger.result.ledger.close_time // Already in Ripple epoch
}

// Ripple time N seconds from now using ledger time
async function rippleTimeFromNow(client, seconds) {
  const ledgerTime = await getLedgerTime(client)
  return ledgerTime + seconds
}

// Wait until XRPL ledger time passes target
async function waitForRippleTime(client, targetRippleTime) {
  while (true) {
    const now = await getLedgerTime(client)
    if (now >= targetRippleTime + 6) break // +6s buffer for ledger close lag
    const waitSecs = Math.max(5, (targetRippleTime - now + 6) * 1.1)
    console.log(`    \u23F3 Waiting ${Math.ceil(waitSecs)}s for ledger time...`)
    await new Promise(r => setTimeout(r, waitSecs * 1000))
  }
}

function getTxCount() { return txCount }
function resetTxCount() { txCount = 0 }

module.exports = {
  submitTx,
  getLedgerTime,
  rippleTimeFromNow,
  waitForRippleTime,
  getTxCount,
  resetTxCount,
}
