import { useState, useCallback, useRef } from 'react'
import { API_BASE, MARKET_TAX } from '../constants'
import { calcVelocity, sleep } from '../utils/velocity'
import { computeSnipeStats } from '../utils/snipe'

const CONCURRENT   = 3
const BATCH_DELAY  = 200
const CACHE_TTL    = 5 * 60 * 1000
const RETRY_DELAY  = 2_000
const MAX_RETRIES  = 3
export const DETAIL_COUNT = 50  // always enrich top 50 with velocity

const EMPTY_PROGRESS = {
  phase: '', listingPage: 0, listingTotal: 0,
  listingCount: 0, detailDone: 0, detailTotal: 0,
}

function listingParams(filters, page) {
  const p = new URLSearchParams({
    type: filters.type || 'mlb_card', page,
    sort: 'best_sell_price', order: 'desc',
  })
  if (filters.rarity)              p.set('rarity',             filters.rarity)
  if (filters.position)            p.set('display_position',   filters.position)
  if (filters.team)                p.set('team',               filters.team)
  if (filters.name)                p.set('name',               filters.name)
  if (filters.series)              p.set('series',             filters.series)
  if (filters.set)                 p.set('set',                filters.set)
  if (filters.minBuyPrice  !== '') p.set('min_best_buy_price',  filters.minBuyPrice)
  if (filters.maxBuyPrice  !== '') p.set('max_best_buy_price',  filters.maxBuyPrice)
  if (filters.minSellPrice !== '') p.set('min_best_sell_price', filters.minSellPrice)
  if (filters.maxSellPrice !== '') p.set('max_best_sell_price', filters.maxSellPrice)
  if (filters.minRank      !== '') p.set('min_rank',            filters.minRank)
  if (filters.maxRank      !== '') p.set('max_rank',            filters.maxRank)
  return p.toString()
}

/**
 * useMarketScan
 *
 * Phase 1: Bulk-fetch all listing pages → sets allListings immediately
 *          so the table is visible as soon as listings are done.
 *
 * Phase 2: Fetch velocity detail for top DETAIL_COUNT cards.
 *          Updates velocityMap entry-by-entry so the table re-sorts live.
 *
 * The component merges allListings + velocityMap with useMemo.
 */
export function useMarketScan() {
  const cacheRef       = useRef(new Map())
  const abortRef       = useRef(null)
  const hasListingsRef = useRef(false)   // true once Phase 1 sets allListings

  const [status,        setStatus]        = useState('idle')
  const [progress,      setProgress]      = useState(EMPTY_PROGRESS)
  const [allListings,   setAllListings]   = useState([])   // set at end of Phase 1
  const [velocityMap,   setVelocityMap]   = useState({})   // grows during Phase 2
  const [scanTimestamp, setScanTimestamp] = useState(null)
  const [scanFilters,   setScanFilters]   = useState(null)
  const [error,         setError]         = useState(null)

  const scan = useCallback(async ({ filters }) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setStatus('listing-pages')
    setAllListings([])
    setVelocityMap({})
    setError(null)
    setScanFilters({ ...filters })
    setScanTimestamp(null)
    hasListingsRef.current = false
    setProgress({
      ...EMPTY_PROGRESS,
      phase: 'listing-pages',
    })

    // ── Phase 1: page 1 to learn total_pages ──────────────────
    let totalPages = 1
    const rawListings = []

    try {
      const res  = await fetch(`${API_BASE}/listings.json?${listingParams(filters, 1)}`, { signal })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()
      totalPages = data.total_pages || 1
      rawListings.push(...(data.listings || []))
      setProgress({
        phase: 'listing-pages',
        listingPage: 1, listingTotal: totalPages,
        listingCount: rawListings.length, detailDone: 0, detailTotal: 0,
      })
    } catch (e) {
      if (e.name === 'AbortError') return
      setError(e.message)
      setStatus('error')
      return
    }

    // ── Phase 1: remaining pages ───────────────────────────────
    const remaining = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
    let pagesDone = 1

    for (let i = 0; i < remaining.length && !signal.aborted; i += CONCURRENT) {
      const batch   = remaining.slice(i, i + CONCURRENT)
      const results = await Promise.all(batch.map(async pg => {
        try {
          const res  = await fetch(`${API_BASE}/listings.json?${listingParams(filters, pg)}`, { signal })
          if (!res.ok || signal.aborted) return []
          const data = await res.json()
          return data.listings || []
        } catch { return [] }
      }))

      if (signal.aborted) return
      results.forEach(ls => rawListings.push(...ls))
      pagesDone += batch.length
      setProgress({
        phase: 'listing-pages',
        listingPage: Math.min(pagesDone, totalPages), listingTotal: totalPages,
        listingCount: rawListings.length, detailDone: 0, detailTotal: 0,
      })

      if (i + CONCURRENT < remaining.length) await sleep(BATCH_DELAY)
    }

    if (signal.aborted) return

    // ── Phase 1 → 2: enrich with basic metrics, sort by profit ─
    const withBasic = rawListings
      .map(l => {
        const buy  = typeof l.best_buy_price  === 'number' ? l.best_buy_price  : 0
        const sell = typeof l.best_sell_price === 'number' ? l.best_sell_price : 0
        const pat  = buy > 0 && sell > 0 ? Math.floor(sell * (1 - MARKET_TAX)) - buy : null
        const roi  = pat != null && buy > 0 ? (pat / buy) * 100 : null
        const spr  = sell > 0 && buy > 0 ? ((sell - buy) / buy) * 100 : null
        return { ...l, _profitAfterTax: pat, _roi: roi, _spreadPct: spr }
      })
      .filter(l => l._profitAfterTax != null && l._profitAfterTax > 0)
      .sort((a, b) => (b._profitAfterTax ?? 0) - (a._profitAfterTax ?? 0))

    // Make Phase 1 results visible immediately
    setAllListings(withBasic)
    hasListingsRef.current = true

    // ── Phase 2: velocity for top DETAIL_COUNT ────────────────
    const topN = withBasic.slice(0, DETAIL_COUNT)

    setStatus('detail-fetch')
    setProgress(prev => ({
      ...prev,
      phase: 'detail-fetch',
      detailDone: 0, detailTotal: topN.length,
    }))

    let detailDone = 0
    let idx = 0

    async function fetchDetail(uuid, attempt = 0) {
      const res = await fetch(`${API_BASE}/listing.json?uuid=${uuid}`, { signal })
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY * (attempt + 1))
        return fetchDetail(uuid, attempt + 1)
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    while (idx < topN.length && !signal.aborted) {
      const batch = topN.slice(idx, idx + CONCURRENT)
      idx += batch.length

      await Promise.all(batch.map(async listing => {
        if (signal.aborted) return
        const uuid = listing.uuid || listing.item?.uuid
        if (!uuid) { detailDone++; return }

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
          const buy  = listing.best_buy_price  ?? null
          const sell = listing.best_sell_price ?? null
          const pat  = buy != null && sell != null ? Math.floor(sell * (1 - MARKET_TAX)) - buy : null
          const listingName = listing.listing_name || listing.item?.name || uuid
          const velData = {
            ...calcVelocity(detail.completed_orders || [], pat, listingName),
            ...computeSnipeStats(detail.completed_orders || [], buy, sell),
          }
          setVelocityMap(prev => ({ ...prev, [uuid]: velData }))
        }

        detailDone++
        if (!signal.aborted) setProgress(prev => ({ ...prev, detailDone }))
      }))

      if (idx < topN.length && !signal.aborted) await sleep(BATCH_DELAY)
    }

    if (signal.aborted) return

    setScanTimestamp(Date.now())
    setStatus('done')
    setProgress(prev => ({ ...prev, phase: 'done' }))
  }, [])

  // Abort: if Phase 1 was done, keep results visible (status → done)
  const abort = useCallback(() => {
    abortRef.current?.abort()
    if (hasListingsRef.current) {
      setScanTimestamp(Date.now())
      setStatus('done')
      setProgress(prev => ({ ...prev, phase: 'done' }))
    } else {
      setStatus('idle')
      setProgress(EMPTY_PROGRESS)
    }
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    hasListingsRef.current = false
    setStatus('idle')
    setAllListings([])
    setVelocityMap({})
    setScanTimestamp(null)
    setScanFilters(null)
    setError(null)
    setProgress(EMPTY_PROGRESS)
  }, [])

  return {
    status, progress, allListings, velocityMap,
    scanTimestamp, scanFilters, error, scan, abort, reset,
  }
}
