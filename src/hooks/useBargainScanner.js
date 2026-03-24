import { useState, useCallback, useRef } from 'react'
import { API_BASE, MARKET_TAX } from '../constants'
import { calcSalesPerMinute, sleep } from '../utils/velocity'
import { parsePrice } from '../utils/snipe'

const CACHE_TTL   = 5 * 60 * 1000
const CONCURRENT  = 3
const BATCH_DELAY = 200
const RETRY_DELAY = 2_000
const MAX_RETRIES = 3

// ── Metric computation ────────────────────────────────────────
// Always computes BOTH flip metrics (profitPerMin) and bargain metrics
// (dealDiscount vs average). Returns null only if prices are unusable.
// The calling component filters by its own threshold — no filtering here.

function computeAllMetrics(listing, detail, avgMethod) {
  const bestSell = typeof listing.best_sell_price === 'number' ? listing.best_sell_price : null
  const bestBuy  = typeof listing.best_buy_price  === 'number' ? listing.best_buy_price  : null
  if (!bestSell || bestSell <= 0 || !bestBuy || bestBuy <= 0) return null

  const orders = detail.completed_orders || []
  const history = detail.price_history   || []

  // ── Flip metrics ───────────────────────────────────────────
  const profitAfterTax = Math.floor(bestSell * (1 - MARKET_TAX)) - bestBuy
  const { rate: salesPerMin } = calcSalesPerMinute(orders)
  const profitPerMin   = profitAfterTax > 0 && salesPerMin > 0
    ? profitAfterTax * salesPerMin
    : 0

  // ── Bargain metrics (vs historical average) ────────────────
  const prices    = orders.map(o => parsePrice(o.price)).filter(v => Number.isFinite(v) && v > 0)
  const recentAvg = prices.length > 0
    ? prices.reduce((a, b) => a + b, 0) / prices.length
    : null

  const dailyMids = history
    .filter(d => d.best_sell_price > 0 && d.best_buy_price > 0)
    .map(d => (d.best_buy_price + d.best_sell_price) / 2)
  const weekAvg = dailyMids.length > 0
    ? dailyMids.reduce((a, b) => a + b, 0) / dailyMids.length
    : null

  const refAvg = avgMethod === 'weekly'
    ? (weekAvg  ?? recentAvg)
    : (recentAvg ?? weekAvg)

  // dealDiscount is allowed to be negative (card priced above average = no bargain)
  const dealDiscount = refAvg && refAvg > 0
    ? ((refAvg - bestSell) / refAvg) * 100
    : null

  // estProfit only makes sense when there IS a positive discount
  const estProfit = dealDiscount != null && dealDiscount > 0 && refAvg
    ? Math.floor(refAvg * (1 - MARKET_TAX)) - bestSell
    : null

  return {
    ...listing,
    _recentAvg:      recentAvg,
    _weekAvg:        weekAvg,
    _dealDiscount:   dealDiscount,   // null or ±%
    _estProfit:      estProfit,
    _salesPerMin:    salesPerMin,
    _profitAfterTax: profitAfterTax,
    _profitPerMin:   profitPerMin,
  }
}

// ── Hook ──────────────────────────────────────────────────────
/**
 * useBargainScanner
 *
 * Pass 1: Page scan — collects spread candidates from the listings API.
 * Pass 2: Deep fetch — gets completed_orders and computes all metrics
 *         for each candidate.
 *
 * The hook returns ALL candidates that have computable prices.
 * Threshold filtering (minDealDiscount, minProfitPerMin) is done in the
 * component so we can show "near deals" when nothing meets the cutoff.
 */
export function useBargainScanner() {
  const cacheRef = useRef(new Map())
  const abortRef = useRef(null)

  const [status,   setStatus]   = useState('idle')
  const [progress, setProgress] = useState({
    phase: '', p1Page: 0, p1Total: 0,
    p2Done: 0, p2Total: 0, candidates: 0,
  })
  const [results, setResults] = useState([])
  const [error,   setError]   = useState(null)

  const scan = useCallback(async (config) => {
    const { minPrice, maxPrice, rarities, pagesToScan, minSpread, avgMethod } = config

    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setStatus('scanning')
    setResults([])
    setError(null)

    // ─── PASS 1: page scan ────────────────────────────────────
    const candidates = []

    for (let page = 1; page <= pagesToScan; page++) {
      if (signal.aborted) return

      setProgress({
        phase: 'pass1', p1Page: page, p1Total: pagesToScan,
        p2Done: 0, p2Total: 0, candidates: candidates.length,
      })

      try {
        const params = new URLSearchParams({
          type: 'mlb_card', page,
          sort: 'best_sell_price', order: 'desc',
        })
        if (minPrice) params.set('min_best_buy_price', minPrice)
        if (maxPrice) params.set('max_best_buy_price', maxPrice)

        const res  = await fetch(`${API_BASE}/listings.json?${params}`, { signal })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const data = await res.json()

        for (const l of (data.listings || [])) {
          if (signal.aborted) break
          const rarity = (l.item?.rarity || '').toLowerCase()
          if (rarities.length > 0 && !rarities.includes(rarity)) continue

          const buy  = l.best_buy_price
          const sell = l.best_sell_price
          if (!buy || !sell || sell <= buy) continue

          const spreadPct = ((sell - buy) / buy) * 100
          if (spreadPct >= minSpread) {
            candidates.push({ ...l, _spreadPct: spreadPct })
          }
        }
      } catch (e) {
        if (e.name === 'AbortError') return
      }
    }

    if (signal.aborted) return

    if (candidates.length === 0) {
      setStatus('done')
      setProgress(prev => ({ ...prev, phase: 'done' }))
      return
    }

    // ─── PASS 2: deep fetch ───────────────────────────────────
    let p2Done = 0
    let idx    = 0

    setProgress({
      phase: 'pass2', p1Page: pagesToScan, p1Total: pagesToScan,
      p2Done: 0, p2Total: candidates.length, candidates: candidates.length,
    })

    async function fetchDetail(uuid, attempt = 0) {
      const res = await fetch(`${API_BASE}/listing.json?uuid=${uuid}`, { signal })
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY * (attempt + 1))
        return fetchDetail(uuid, attempt + 1)
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    while (idx < candidates.length && !signal.aborted) {
      const batch = candidates.slice(idx, idx + CONCURRENT)
      idx += batch.length

      await Promise.all(batch.map(async (listing) => {
        if (signal.aborted) return
        const uuid = listing.uuid || listing.item?.uuid
        if (!uuid) { p2Done++; return }

        let detail
        const cached = cacheRef.current.get(uuid)
        if (cached && Date.now() - cached.fetchedAt <= CACHE_TTL) {
          detail = cached.data
        } else {
          try {
            detail = await fetchDetail(uuid)
            cacheRef.current.set(uuid, { data: detail, fetchedAt: Date.now() })
          } catch (e) {
            if (e.name === 'AbortError') return
          }
        }

        if (detail && !signal.aborted) {
          const result = computeAllMetrics(listing, detail, avgMethod)
          // Add ALL computable results — component handles threshold filtering
          if (result) setResults(prev => [...prev, result])
        }

        p2Done++
        if (!signal.aborted) {
          setProgress({
            phase: 'pass2', p1Page: pagesToScan, p1Total: pagesToScan,
            p2Done, p2Total: candidates.length, candidates: candidates.length,
          })
        }
      }))

      if (idx < candidates.length && !signal.aborted) await sleep(BATCH_DELAY)
    }

    if (!signal.aborted) {
      setStatus('done')
      setProgress(prev => ({ ...prev, phase: 'done' }))
    }
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    setStatus('done')
    setProgress(prev => ({ ...prev, phase: 'done' }))
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setStatus('idle')
    setResults([])
    setError(null)
    setProgress({ phase: '', p1Page: 0, p1Total: 0, p2Done: 0, p2Total: 0, candidates: 0 })
  }, [])

  return { status, progress, results, error, scan, abort, reset }
}
