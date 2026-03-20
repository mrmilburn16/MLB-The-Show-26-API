import { RARITY_COLORS, MARKET_TAX, getQuicksellFloor } from '../constants'

export function fmt(n) {
  if (n == null || n === '-' || n === 0) return '—'
  return Number(n).toLocaleString()
}

export function fmtProfit(n) {
  if (n == null) return '—'
  return (n > 0 ? '+' : '') + Number(n).toLocaleString()
}

export function rarityColors(r) {
  return RARITY_COLORS[r] || RARITY_COLORS.Common
}

export function profitClass(n) {
  return n > 0 ? 'green' : n < 0 ? 'red' : 'muted'
}

export function marginColor(pct) {
  if (pct > 20) return '#4ade80'
  if (pct > 5)  return '#fbbf24'
  return '#f87171'
}

export function enrichListing(l) {
  // Treat 0 as "no active order". API can also return the string "-".
  const buy  = typeof l.best_buy_price  === 'number' && l.best_buy_price  > 0 ? l.best_buy_price  : null
  const sell = typeof l.best_sell_price === 'number' && l.best_sell_price > 0 ? l.best_sell_price : null

  const item           = l.item || {}
  const isLive         = String(item.series_id) === '1337' || item.series === 'Live'
  const ovr            = typeof item.ovr === 'number' ? item.ovr : parseInt(item.ovr, 10)
  const quicksellFloor = getQuicksellFloor(ovr, isLive)

  // When there's no active bid, use the quicksell floor as the worst-case buy price.
  // This gives a realistic profit estimate: you can never pay less than QS for a card.
  const effectiveBuy = buy ?? quicksellFloor
  const buyIsQS      = buy == null && quicksellFloor != null

  // Flag: bid is below quicksell — shouldn't be possible (data error or stale)
  const bidBelowQS = buy != null && quicksellFloor != null && buy < quicksellFloor

  const sellAfterTax   = sell != null ? Math.floor(sell * (1 - MARKET_TAX)) : null
  const profit         = effectiveBuy != null && sell != null ? sell - effectiveBuy : null
  const margin         = effectiveBuy != null && sell != null ? ((sell - effectiveBuy) / effectiveBuy) * 100 : null
  const profitAfterTax = effectiveBuy != null && sell != null ? (sellAfterTax ?? 0) - effectiveBuy : null

  // How much better is flipping vs just quickselling the card immediately?
  const profitAboveQS = sell != null && quicksellFloor != null
    ? (sellAfterTax ?? 0) - quicksellFloor
    : null

  // How close is the current buy-now price (best_sell_price) to the quicksell floor?
  // Low premiumPct = near risk-free buy (worst case: quicksell for tiny loss)
  const premiumOverQS = sell != null && quicksellFloor != null ? sell - quicksellFloor : null
  const premiumPct    = premiumOverQS != null && quicksellFloor > 0
    ? (premiumOverQS / quicksellFloor) * 100
    : null

  return {
    ...l,
    _effectiveBuy:   effectiveBuy,
    _buyIsQS:        buyIsQS,
    _bidBelowQS:     bidBelowQS,
    _profit:         profit,
    _margin:         margin,
    _profitAfterTax: profitAfterTax,
    _sellAfterTax:   sellAfterTax,
    _quicksellFloor: quicksellFloor,
    _profitAboveQS:  profitAboveQS,
    _premiumOverQS:  premiumOverQS,
    _premiumPct:     premiumPct,
    _isLive:         isLive,
  }
}
