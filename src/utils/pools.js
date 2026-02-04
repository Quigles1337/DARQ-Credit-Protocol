'use strict'

// ═══════════════════════════════════════════════════════════════
//  Pool Matching & Weighted Average Calculation
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate pro-rata pool allocation across lending tiers.
 * @param {number} requestedAmount - XRP loan amount requested
 * @param {Array} pools - Array of { name, wallet, rate, available }
 * @returns {{ allocations, weightedRate, totalAvailable }}
 */
function calculatePoolAllocation(requestedAmount, pools) {
  const totalAvailable = pools.reduce((sum, p) => sum + p.available, 0)

  if (requestedAmount > totalAvailable) {
    throw new Error(`Insufficient liquidity: requested ${requestedAmount} XRP, available ${totalAvailable} XRP`)
  }

  // Pro-rata allocation: each pool contributes proportionally
  const allocations = pools.map(pool => {
    const share = pool.available / totalAvailable
    const amount = Math.round(requestedAmount * share * 100) / 100
    return { ...pool, allocated: amount }
  })

  // Adjust rounding to match exact requested amount
  const totalAllocated = allocations.reduce((sum, a) => sum + a.allocated, 0)
  const diff = Math.round((requestedAmount - totalAllocated) * 100) / 100
  if (diff !== 0) {
    // Adjust the largest allocation
    const largest = allocations.reduce((max, a) => a.allocated > max.allocated ? a : max, allocations[0])
    largest.allocated = Math.round((largest.allocated + diff) * 100) / 100
  }

  // Calculate weighted average rate
  const weightedRate = allocations.reduce((sum, a) => sum + (a.allocated * a.rate), 0) / requestedAmount

  // Calculate per-lender interest
  // For testnet demo with short loan: use annualized rate * amount * (duration/year)
  // We'll use a minimum interest of 0.01 XRP per lender to make it visible
  const DEMO_DURATION_YEARS = 90 / (365 * 24 * 3600) // 90 seconds as fraction of year
  allocations.forEach(a => {
    let interest = Math.round(a.allocated * a.rate * DEMO_DURATION_YEARS * 1000000) / 1000000
    // Minimum visible interest for demo purposes
    if (interest < 0.01) interest = 0.01
    a.interest = interest
    a.totalOwed = Math.round((a.allocated + a.interest) * 1000000) / 1000000
  })

  return { allocations, weightedRate, totalAvailable }
}

/**
 * Display pool allocation table
 */
function formatPoolAllocation(allocations, weightedRate, requestedAmount) {
  const lines = []
  lines.push('')
  lines.push('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557')
  lines.push('\u2551          POOL MATCHING \u2014 PRO-RATA ALLOCATION                      \u2551')
  lines.push('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D')
  lines.push('')
  lines.push('  Pool             | Rate  | Available | Allocated | Interest | Total Owed')
  lines.push('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500')

  for (const a of allocations) {
    const name = a.name.padEnd(16)
    const rate = `${(a.rate * 100).toFixed(1)}%`.padStart(5)
    const avail = `${a.available} XRP`.padStart(9)
    const alloc = `${a.allocated} XRP`.padStart(9)
    const interest = `${a.interest} XRP`.padStart(8)
    const total = `${a.totalOwed} XRP`.padStart(10)
    lines.push(`  ${name} | ${rate} | ${avail} | ${alloc} | ${interest} | ${total}`)
  }

  lines.push('')
  lines.push(`  Loan Amount:         ${requestedAmount} XRP`)
  lines.push(`  Weighted Avg Rate:   ${(weightedRate * 100).toFixed(2)}% APR`)
  lines.push(`  Total Repayment:     ${allocations.reduce((s, a) => s + a.totalOwed, 0).toFixed(6)} XRP`)
  lines.push('')
  return lines.join('\n')
}

module.exports = { calculatePoolAllocation, formatPoolAllocation }
