export const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/**
 * Calculate sales per minute using the FULL window of completed orders.
 *
 * Formula: count / (newest_ts - oldest_ts) in minutes
 * Requires at least 2 orders with parseable dates to produce a non-zero rate.
 *
 * Example: 180 orders spanning 1,161 min → 0.155 sales/min
 */
export function calcSalesPerMinute(completedOrders) {
  if (!completedOrders || completedOrders.length < 2) return 0

  const times = completedOrders
    .map(o => new Date(o.date).getTime())
    .filter(t => Number.isFinite(t))

  if (times.length < 2) return 0

  const newest = Math.max(...times)
  const oldest = Math.min(...times)
  const minutesSpan = (newest - oldest) / 60_000

  if (minutesSpan <= 0) return 0
  return times.length / minutesSpan
}

/**
 * Compute { salesPerMin, profitPerMin } for a listing.
 *
 * profitPerMin = profitAfterTax × salesPerMin
 * Only positive when both profit and velocity are positive.
 */
export function calcVelocity(completedOrders, profitAfterTax, listingName) {
  const salesPerMin = calcSalesPerMinute(completedOrders)

  const profitPerMin =
    profitAfterTax != null && profitAfterTax > 0 && salesPerMin > 0
      ? profitAfterTax * salesPerMin
      : 0

  return { salesPerMin, profitPerMin }
}
