import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE } from '../constants'
import { enrichListing } from '../utils/format'
import { sleep } from '../utils/velocity'

const CONCURRENT       = 3
const BATCH_DELAY      = 200       // ms between page batches
const REFRESH_INTERVAL = 60_000   // 60 seconds — price refresh
const FETCH_URL        = (page) =>
  `${API_BASE}/listings.json?type=mlb_card&page=${page}&sort=best_sell_price&order=desc`

/** Fetch all pages and return deduplicated enriched listings */
async function fetchAllPages(onProgress, shouldAbort) {
  const seen = new Map()

  const addListings = (listings) => {
    for (const l of listings) {
      const uuid = l?.item?.uuid
      if (uuid && !seen.has(uuid)) seen.set(uuid, l)
    }
  }

  const res = await fetch(FETCH_URL(1))
  if (!res.ok) throw new Error(`listings fetch failed: ${res.status}`)
  const data = await res.json()
  const totalPages = data.total_pages || 1
  addListings(data.listings || [])
  onProgress?.({ page: 1, total: totalPages })

  for (let i = 2; i <= totalPages && !shouldAbort?.(); i += CONCURRENT) {
    const batch = []
    for (let j = i; j < i + CONCURRENT && j <= totalPages; j++) {
      batch.push(
        fetch(FETCH_URL(j))
          .then(r => r.ok ? r.json() : { listings: [] })
          .then(d => d.listings || [])
          .catch(() => [])
      )
    }
    const results = await Promise.all(batch)
    if (shouldAbort?.()) return null
    results.forEach(ls => addListings(ls))
    onProgress?.({ page: Math.min(i + CONCURRENT - 1, totalPages), total: totalPages })
    if (i + CONCURRENT <= totalPages) await sleep(BATCH_DELAY)
  }

  return Array.from(seen.values()).map(enrichListing)
}

/**
 * useAutoMarket
 *
 * Fetches ALL mlb_card pages on mount (initial scan).
 * After the scan completes, silently refreshes prices every 60 seconds.
 * Pauses when the browser tab is hidden or the user explicitly pauses.
 *
 * Returns:
 *   allListings   – enriched listing array
 *   isScanning    – true during the initial full scan
 *   isFullData    – true once the initial scan is complete
 *   scanProgress  – { page, total } for the loading bar
 *   isRefreshing  – true during a background price refresh
 *   lastUpdated   – Date.now() timestamp of last successful refresh
 *   isPaused      – whether auto-refresh is user-paused
 *   togglePause   – function to toggle isPaused
 */
export function useAutoMarket() {
  const [allListings,  setAllListings]  = useState([])
  const [isScanning,   setIsScanning]   = useState(false)
  const [isFullData,   setIsFullData]   = useState(false)
  const [scanProgress, setScanProgress] = useState({ page: 0, total: 0 })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated,  setLastUpdated]  = useState(null)
  const [isPaused,     setIsPaused]     = useState(false)

  const cancelledRef     = useRef(false)
  const isPausedRef      = useRef(false)
  const isRefreshingRef  = useRef(false)
  const isFullDataRef    = useRef(false)

  // Keep refs in sync so interval callbacks don't go stale
  useEffect(() => { isPausedRef.current   = isPaused   }, [isPaused])
  useEffect(() => { isFullDataRef.current = isFullData }, [isFullData])

  const togglePause = useCallback(() => setIsPaused(p => !p), [])

  // ── Background price refresh (silent) ──────────────────────────────────────
  const doRefresh = useCallback(async () => {
    if (isRefreshingRef.current || !isFullDataRef.current) return
    isRefreshingRef.current = true
    setIsRefreshing(true)
    try {
      const enriched = await fetchAllPages(
        null,                            // no progress updates during silent refresh
        () => isPausedRef.current || document.hidden
      )
      if (enriched) {
        setAllListings(enriched)
        setLastUpdated(Date.now())
      }
    } catch {
      // silently skip failed refreshes
    } finally {
      isRefreshingRef.current = false
      setIsRefreshing(false)
    }
  }, [])

  // ── Initial full scan on mount ─────────────────────────────────────────────
  useEffect(() => {
    cancelledRef.current = false

    async function initialScan() {
      setIsScanning(true)
      setIsFullData(false)
      setAllListings([])
      setScanProgress({ page: 0, total: 0 })

      try {
        const enriched = await fetchAllPages(
          setScanProgress,
          () => cancelledRef.current
        )
        if (!cancelledRef.current && enriched) {
          setAllListings(enriched)
          setLastUpdated(Date.now())
          setIsFullData(true)
          setScanProgress(prev => ({ ...prev, page: prev.total }))
        }
      } catch {
        // scan failed — will retry on next manual action
      } finally {
        if (!cancelledRef.current) setIsScanning(false)
      }
    }

    initialScan()
    return () => { cancelledRef.current = true }
  }, []) // mount only

  // ── Auto-refresh interval — starts after initial scan completes ───────────
  useEffect(() => {
    if (!isFullData) return

    const id = setInterval(() => {
      // Skip if user paused OR tab is not visible
      if (isPausedRef.current || document.hidden) return
      doRefresh()
    }, REFRESH_INTERVAL)

    return () => clearInterval(id)
  }, [isFullData, doRefresh])

  // ── Resume refresh when tab becomes visible again ─────────────────────────
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden && isFullDataRef.current && !isPausedRef.current) {
        // Came back to tab — trigger an immediate refresh to get fresh prices
        doRefresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [doRefresh])

  return {
    allListings,
    isScanning,
    isFullData,
    scanProgress,
    isRefreshing,
    lastUpdated,
    isPaused,
    togglePause,
  }
}
