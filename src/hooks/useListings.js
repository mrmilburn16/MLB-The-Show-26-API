import { useState, useCallback, useRef } from 'react'
import { API_BASE } from '../constants'
import { enrichListing } from '../utils/format'
import { sleep } from '../utils/velocity'

// Equipment/stadium/etc have ≤20 pages — always auto-scan those.
// MLB cards have 67+ pages — only scan when the user explicitly requests it.
const AUTO_SCAN_THRESHOLD = 20
const BATCH_SIZE  = 3
const BATCH_DELAY = 200

// ── Shared param builder ───────────────────────────────────────
function buildParams(pg, sort, order, filters) {
  const p = new URLSearchParams({
    type: filters.type || 'mlb_card',
    page: pg, sort, order,
  })
  if (filters.rarity)              p.set('rarity',             filters.rarity)
  if (filters.position)            p.set('display_position',   filters.position)
  if (filters.team)                p.set('team',               filters.team)
  if (filters.name)                p.set('name',               filters.name)
  if (filters.series)              p.set('series_id',          filters.series)
  if (filters.set)                 p.set('set',                filters.set)
  if (filters.brand)               p.set('brand_id',           filters.brand)
  if (filters.minBuyPrice  !== '') p.set('min_best_buy_price',  filters.minBuyPrice)
  if (filters.maxBuyPrice  !== '') p.set('max_best_buy_price',  filters.maxBuyPrice)
  if (filters.minSellPrice !== '') p.set('min_best_sell_price', filters.minSellPrice)
  if (filters.maxSellPrice !== '') p.set('max_best_sell_price', filters.maxSellPrice)
  if (filters.minRank      !== '') p.set('min_rank',            filters.minRank)
  if (filters.maxRank      !== '') p.set('max_rank',            filters.maxRank)
  return p
}

// ── Hook ──────────────────────────────────────────────────────
export function useListings() {
  const [listings,     setListings]     = useState([])
  const [totalPages,   setTotalPages]   = useState(1)
  const [loading,      setLoading]      = useState(false)
  const [scanning,     setScanning]     = useState(false)
  const [isFullData,   setIsFullData]   = useState(false)
  const [scanProgress, setScanProgress] = useState({ page: 0, total: 0 })
  const [error,        setError]        = useState(null)
  const abortRef = useRef(null)

  // ── Normal paginated fetch (page N) ───────────────────────────
  const fetchListings = useCallback(async ({ page, sort, order, filters }) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setLoading(true)
    setScanning(false)
    setIsFullData(false)
    setScanProgress({ page: 0, total: 0 })
    setError(null)

    try {
      const res = await fetch(
        `${API_BASE}/listings.json?${buildParams(page, sort, order, filters)}`,
        { signal }
      )
      if (!res.ok) throw new Error(`API returned ${res.status} ${res.statusText}`)
      const data = await res.json()

      const total      = data.total_pages || 1
      const firstBatch = (data.listings || []).map(enrichListing)

      setListings(firstBatch)
      setLoading(false)

      // ── Auto-scan when total pages is small (equipment/stadium/etc) ──
      if (total <= AUTO_SCAN_THRESHOLD && total > 1) {
        setScanning(true)
        setTotalPages(total)
        setScanProgress({ page: 1, total })

        const all   = [...firstBatch]
        const pages = Array.from({ length: total - 1 }, (_, i) => i + 2)

        for (let i = 0; i < pages.length; i += BATCH_SIZE) {
          if (signal.aborted) return

          const batch   = pages.slice(i, i + BATCH_SIZE)
          const results = await Promise.all(batch.map(async pg => {
            try {
              const r = await fetch(
                `${API_BASE}/listings.json?${buildParams(pg, sort, order, filters)}`,
                { signal }
              )
              if (!r.ok || signal.aborted) return []
              const d = await r.json()
              return (d.listings || []).map(enrichListing)
            } catch { return [] }
          }))

          if (signal.aborted) return
          results.forEach(ls => all.push(...ls))
          setListings([...all])
          setScanProgress({ page: Math.min(1 + i + BATCH_SIZE, total), total })

          if (i + BATCH_SIZE < pages.length) await sleep(BATCH_DELAY)
        }

        if (!signal.aborted) {
          setTotalPages(1)
          setScanning(false)
          setIsFullData(true)
          setScanProgress(prev => ({ ...prev, page: total }))
        }
      } else {
        // Normal paginated mode (mlb_card 67+ pages)
        setTotalPages(total)
        setIsFullData(total === 1)
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
      setLoading(false)
      setScanning(false)
    }
  }, [])

  // ── Full market scan: fetch ALL pages regardless of count ──────
  // Called from the Market tab when the user clicks "Scan Now" on a
  // calculated column sort (profit/min, snipe%) for mlb_card type.
  const scanAllPages = useCallback(async ({ sort, order, filters }) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setLoading(true)
    setScanning(false)
    setIsFullData(false)
    setScanProgress({ page: 0, total: 0 })
    setError(null)

    try {
      // Page 1: discover total_pages
      const res = await fetch(
        `${API_BASE}/listings.json?${buildParams(1, sort, order, filters)}`,
        { signal }
      )
      if (!res.ok) throw new Error(`API returned ${res.status} ${res.statusText}`)
      const data = await res.json()

      const total      = data.total_pages || 1
      const firstBatch = (data.listings || []).map(enrichListing)

      setTotalPages(total)
      setListings(firstBatch)
      setLoading(false)
      setScanProgress({ page: 1, total })

      if (total === 1) {
        setIsFullData(true)
        return
      }

      // Pages 2..N in parallel batches
      setScanning(true)
      const all   = [...firstBatch]
      const pages = Array.from({ length: total - 1 }, (_, i) => i + 2)

      for (let i = 0; i < pages.length; i += BATCH_SIZE) {
        if (signal.aborted) return

        const batch   = pages.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(batch.map(async pg => {
          try {
            const r = await fetch(
              `${API_BASE}/listings.json?${buildParams(pg, sort, order, filters)}`,
              { signal }
            )
            if (!r.ok || signal.aborted) return []
            const d = await r.json()
            return (d.listings || []).map(enrichListing)
          } catch { return [] }
        }))

        if (signal.aborted) return
        results.forEach(ls => all.push(...ls))
        setListings([...all])
        setScanProgress({ page: Math.min(1 + i + BATCH_SIZE, total), total })

        if (i + BATCH_SIZE < pages.length) await sleep(BATCH_DELAY)
      }

      if (!signal.aborted) {
        setTotalPages(1)   // hide pagination — full dataset loaded
        setScanning(false)
        setIsFullData(true)
        setScanProgress({ page: total, total })
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
      setLoading(false)
      setScanning(false)
    }
  }, [])

  return {
    listings, totalPages, loading, scanning, isFullData,
    scanProgress, error, fetchListings, scanAllPages,
  }
}
