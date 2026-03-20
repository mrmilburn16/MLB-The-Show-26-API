/**
 * Parse a price value that may be a number or a comma-formatted string ("558,144").
 */
export function parsePrice(raw) {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') return Number(raw.replace(/,/g, ''))
  return NaN
}

/**
 * Compute all snipe / market-analysis statistics for a listing.
 *
 * @param {Array}  completedOrders  — raw completed_orders from listing.json
 * @param {number} bestBuy          — listing.best_buy_price  (highest bid)
 * @param {number} bestSell         — listing.best_sell_price (lowest ask)
 *
 * Returns:
 *   snipeDiscount   % — how far the current ask is BELOW the historical median.
 *                       Positive = ask is cheap vs history → snipe opportunity.
 *   spreadPct       % — (ask - bid) / bid.  Wide spread = illiquid / flip room.
 *   volatilityPct   % — coefficient of variation (stdDev / avg).
 *   median              median completed price
 *   avg                 mean completed price
 *   stdDev              standard deviation
 */
export function computeSnipeStats(completedOrders, bestBuy, bestSell) {
  const EMPTY = {
    snipeDiscount: null, spreadPct: null, volatilityPct: null,
    median: null, avg: null, stdDev: null,
  }

  if (!completedOrders?.length) return EMPTY

  const prices = completedOrders
    .map(o => parsePrice(o.price))
    .filter(v => Number.isFinite(v) && v > 0)

  if (prices.length < 2) return EMPTY

  const sorted = [...prices].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const avg    = prices.reduce((a, b) => a + b, 0) / prices.length
  const stdDev = Math.sqrt(
    prices.reduce((sum, p) => sum + (p - avg) ** 2, 0) / prices.length,
  )
  const volatilityPct = avg > 0 ? (stdDev / avg) * 100 : null

  // Positive → ask is below historical median (potential snipe)
  // Negative → ask is above median (overpriced)
  const snipeDiscount =
    median > 0 && bestSell != null
      ? ((median - bestSell) / median) * 100
      : null

  // Width of the current bid/ask gap
  const spreadPct =
    bestBuy != null && bestBuy > 0 && bestSell != null
      ? ((bestSell - bestBuy) / bestBuy) * 100
      : null

  return { snipeDiscount, spreadPct, volatilityPct, median, avg, stdDev }
}

/**
 * Given an array of spread values, return the median.
 * Used by the wide-spread detector to find the per-rarity baseline.
 */
export function medianOf(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
