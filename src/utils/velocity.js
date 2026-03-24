export const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/**
 * Calculate sales per minute using a windowed approach:
 *   - Primary:  last 1 hour  (needs ≥ 3 orders) — most accurate for hot cards
 *   - Fallback: last 24 hours (needs ≥ 1 order)  — covers medium-velocity cards
 *   - Zero if no sales in the last 24 hours
 *
 * Returns { rate, window } where window is '1h', '24h', or null.
 */
export function calcSalesPerMinute(completedOrders) {
  if (!completedOrders || completedOrders.length < 1) return { rate: 0, window: null }

  const now              = Date.now()
  const oneHourAgo       = now - 60 * 60 * 1000
  const twentyFourHrsAgo = now - 24 * 60 * 60 * 1000

  const allTimes = completedOrders
    .map(o => new Date(o.date).getTime())
    .filter(t => Number.isFinite(t))

  // Primary: 1-hour window (≥ 3 orders required for a stable rate)
  const lastHour = allTimes.filter(t => t >= oneHourAgo)
  if (lastHour.length >= 3) {
    return { rate: lastHour.length / 60, window: '1h' }
  }

  // Fallback: 24-hour window
  const last24h = allTimes.filter(t => t >= twentyFourHrsAgo)
  if (last24h.length >= 1) {
    return { rate: last24h.length / 1440, window: '24h' }
  }

  return { rate: 0, window: null }
}

/**
 * Compute { salesPerMin, profitPerMin, velocityWindow } for a listing.
 *
 * velocityWindow: '1h' | '24h' | null — which time window was used.
 */
export function calcVelocity(completedOrders, profitAfterTax, listingName) {
  const { rate: salesPerMin, window: velocityWindow } = calcSalesPerMinute(completedOrders)

  const profitPerMin =
    profitAfterTax != null && profitAfterTax > 0 && salesPerMin > 0
      ? profitAfterTax * salesPerMin
      : 0

  return { salesPerMin, profitPerMin, velocityWindow }
}
