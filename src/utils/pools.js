'use strict'

const { LENDER_SPLIT, LOAN_PARAMS } = require('../config')

// ═══════════════════════════════════════════════════════════════
//  Loan Allocation — Overlender (LP tokens) + Underlender (RLUSD)
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate loan allocation across overlenders and underlender.
 *
 * - Underlender provides 100% of RLUSD capital to the borrower.
 * - Overlenders provide LP tokens as overcollateralization.
 * - The 50/50 split determines risk allocation & interest calculation.
 *
 * @param {number} loanAmount - RLUSD loan amount
 * @param {Array} overlenderWallets - [{ wallet, name, lpBalance }]
 * @param {{ wallet, name }} underlender
 * @returns {{ allocations, weightedRate }}
 */
function calculateLoanAllocation(loanAmount, overlenderWallets, underlender) {
  const demoYears = LOAN_PARAMS.MATURITY_SECONDS / (365 * 24 * 3600)
  const allocations = []

  // Overlender allocations — each provides LP tokens as collateral backing
  const totalOverlenderBacking = loanAmount * LENDER_SPLIT.OVERLENDER_SHARE
  const perOverlenderBacking = totalOverlenderBacking / overlenderWallets.length

  for (const ol of overlenderWallets) {
    let interest = perOverlenderBacking * LOAN_PARAMS.OVERLENDER_RATE * demoYears
    if (interest < 0.5) interest = 0.5
    interest = Math.round(interest * 1000000) / 1000000

    allocations.push({
      name: ol.name,
      wallet: ol.wallet,
      type: 'overlender',
      lpTokenAmount: ol.lpBalance,
      backingValue: perOverlenderBacking,
      rate: LOAN_PARAMS.OVERLENDER_RATE,
      interest,
      totalOwed: interest, // Overlender: interest only (LP tokens returned separately)
    })
  }

  // Underlender allocation — provides direct RLUSD capital
  let underlenderInterest = loanAmount * LOAN_PARAMS.UNDERLENDER_RATE * demoYears
  if (underlenderInterest < 1) underlenderInterest = 1
  underlenderInterest = Math.round(underlenderInterest * 1000000) / 1000000

  allocations.push({
    name: underlender.name,
    wallet: underlender.wallet,
    type: 'underlender',
    principal: loanAmount,
    rate: LOAN_PARAMS.UNDERLENDER_RATE,
    interest: underlenderInterest,
    totalOwed: Math.round((loanAmount + underlenderInterest) * 1000000) / 1000000,
  })

  const weightedRate = LOAN_PARAMS.OVERLENDER_RATE * LENDER_SPLIT.OVERLENDER_SHARE +
                       LOAN_PARAMS.UNDERLENDER_RATE * LENDER_SPLIT.UNDERLENDER_SHARE

  return { allocations, weightedRate }
}

/**
 * Display loan allocation table.
 */
function formatLoanAllocation(allocations, weightedRate, loanAmount) {
  const lines = []
  lines.push('')
  lines.push('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  lines.push('\u2551     LOAN ALLOCATION \u2014 OVERLENDER/UNDERLENDER SPLIT                 \u2551')
  lines.push('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  lines.push('')
  lines.push('  Lender           | Type        | Rate  | Backing/Capital | Interest   | Total Owed')
  lines.push('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500')

  for (const a of allocations) {
    const name = a.name.padEnd(18)
    const type = (a.type === 'overlender' ? 'LP Collateral' : 'RLUSD Direct').padEnd(11)
    const rate = `${(a.rate * 100).toFixed(1)}%`.padStart(5)
    const backing = a.type === 'overlender'
      ? `${a.backingValue} RLUSD`.padStart(15)
      : `${a.principal} RLUSD`.padStart(15)
    const interest = `${a.interest} RLUSD`.padStart(10)
    const total = `${a.totalOwed} RLUSD`.padStart(10)
    lines.push(`  ${name} | ${type} | ${rate} | ${backing} | ${interest} | ${total}`)
  }

  const totalRepayment = allocations.reduce((s, a) => s + a.totalOwed, 0)
  lines.push('')
  lines.push(`  Loan Amount (RLUSD):   ${loanAmount}`)
  lines.push(`  Weighted Avg Rate:     ${(weightedRate * 100).toFixed(2)}% APR`)
  lines.push(`  Total Repayment:       ${totalRepayment.toFixed(6)} RLUSD`)
  lines.push('')
  return lines.join('\n')
}

module.exports = { calculateLoanAllocation, formatLoanAllocation }
