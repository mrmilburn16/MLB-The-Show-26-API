import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE } from '../constants'
import { enrichListing } from '../utils/format'
import { sleep } from '../utils/velocity'

const CONCURRENT       = 3
const BATCH_DELAY      = 200
const REFRESH_INTERVAL = 60_000
const FETCH_URL        = (page) =>
  `${API_BASE}/listings.json?type=mlb_card&page=${page}&sort=best_sell_price&order=desc`

// ── localStorage cache ────────────────────────────────────────────
const CACHE_KEY = 'stubflipper_market_cache'
const CACHE_TTL = 30 * 60 * 1000   // 30 min

// Only the fields needed to re-enrich and display listings.
// We deliberately skip velocity / completedOrders — those are re-fetched on demand.
function slimListing(l) {
  return {
    listing_name:    l.listing_name,
    best_sell_price: l.best_sell_price,
    best_buy_price:  l.best_buy_price,
    item: {
      uuid:             l.item?.uuid,
      name:             l.item?.name,
      listing_name:     l.item?.listing_name,
      rarity:           l.item?.rarity,
      team:             l.item?.team,
      team_short_name:  l.item?.team_short_name,
      ovr:              l.item?.ovr,
      series:           l.item?.series,
      series_id:        l.item?.series_id,
      display_position: l.item?.display_position,
      img:              l.item?.img,
      baked_img:        l.item?.baked_img,
    },
  }
}

function saveMarketCache(listings) {
  try {
    const payload = JSON.stringify({ timestamp: Date.now(), listings: listings.map(slimListing) })
    localStorage.setItem(CACHE_KEY, payload)
  } catch (e) {
    // Quota exceeded — silently skip; fresh data is still in state
    console.warn('Market cache write failed (quota?):', e.message)
  }
}

function loadMarketCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { timestamp, listings } = JSON.parse(raw)
    if (!listings?.length || Date.now() - timestamp > CACHE_TTL) return null
    return { listings, timestamp }
  } catch {
    return null
  }
}

// ── Better error classification ────────────────────────────────────
// Don't show "offline" unless the browser is actually offline.
function classifyFetchError(e) {
  if (!navigator.onLine) return 'No internet connection'
  if (e?.message?.includes('429') || e?.status === 429) return 'Rate limited by API — retrying shortly'
  if (e?.message?.includes('timeout') || e?.name === 'TimeoutError') return 'Request timed out — retrying'
  return e?.message || 'Fetch failed — retrying'
}

// ── Core fetch routine ────────────────────────────────────────────
async function fetchAllPages(onProgress, shouldAbort) {
  const seen = new Map()

  function addListings(listings) {
    for (const l of listings) {
      const uuid = l?.item?.uuid
      if (uuid && !seen.has(uuid)) seen.set(uuid, l)
    }
  }

  const res = await fetch(FETCH_URL(1))
  if (!res.ok) throw Object.assign(new Error(`listings.json → HTTP ${res.status}`), { status: res.status })
  const data       = await res.json()
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
          .catch(() => [])   // individual page failure: skip, not abort
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

// ── Hook ─────────────────────────────────────────────────────────
export function useAutoMarket() {
  // Initialise from cache so data appears instantly on page reload
  const _cached = loadMarketCache()
  const [allListings,  setAllListings]  = useState(() =>
    _cached ? _cached.listings.map(enrichListing) : []
  )
  const [isScanning,   setIsScanning]   = useState(false)
  const [isFullData,   setIsFullData]   = useState(() => !!_cached)
  const [isFromCache,  setIsFromCache]  = useState(() => !!_cached)
  const [scanProgress, setScanProgress] = useState({ page: 0, total: 0 })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated,  setLastUpdated]  = useState(() => _cached?.timestamp ?? null)
  const [isPaused,     setIsPaused]     = useState(false)
  const [fetchError,   setFetchError]   = useState(null)

  const cancelledRef    = useRef(false)
  const isPausedRef     = useRef(false)
  const isRefreshingRef = useRef(false)
  const isFullDataRef   = useRef(!!_cached)

  useEffect(() => { isPausedRef.current   = isPaused   }, [isPaused])
  useEffect(() => { isFullDataRef.current = isFullData }, [isFullData])

  const togglePause = useCallback(() => setIsPaused(p => !p), [])

  // ── Background price refresh (silent) ──────────────────────────
  const doRefresh = useCallback(async () => {
    if (isRefreshingRef.current || !isFullDataRef.current) return
    isRefreshingRef.current = true
    setIsRefreshing(true)
    try {
      const enriched = await fetchAllPages(
        null,
        () => isPausedRef.current || document.hidden
      )
      if (enriched) {
        setAllListings(enriched)
        setLastUpdated(Date.now())
        setIsFromCache(false)
        setFetchError(null)
        saveMarketCache(enriched)
      }
    } catch (e) {
      // Silent refresh failure — keep existing data, log the real reason
      console.warn('Market refresh failed:', classifyFetchError(e))
    } finally {
      isRefreshingRef.current = false
      setIsRefreshing(false)
    }
  }, [])

  // ── Initial scan on mount ──────────────────────────────────────
  useEffect(() => {
    cancelledRef.current = false

    async function initialScan() {
      // If we loaded from cache, do a background refresh instead of a full re-scan.
      // This gives the user instant data while we quietly fetch updated prices.
      if (_cached) {
        setIsFromCache(true)
        // Small delay so the UI renders the cached data first
        await sleep(500)
        if (!cancelledRef.current) doRefresh()
        return
      }

      // No cache — full scan from scratch
      setIsScanning(true)
      setIsFullData(false)
      setAllListings([])
      setScanProgress({ page: 0, total: 0 })
      setFetchError(null)

      try {
        const enriched = await fetchAllPages(
          setScanProgress,
          () => cancelledRef.current
        )
        if (!cancelledRef.current && enriched) {
          setAllListings(enriched)
          setLastUpdated(Date.now())
          setIsFullData(true)
          setIsFromCache(false)
          setScanProgress(prev => ({ ...prev, page: prev.total }))
          saveMarketCache(enriched)
        }
      } catch (e) {
        if (!cancelledRef.current) {
          setFetchError(classifyFetchError(e))
        }
      } finally {
        if (!cancelledRef.current) setIsScanning(false)
      }
    }

    initialScan()
    return () => { cancelledRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])   // mount only — _cached is evaluated once at hook init

  // ── Auto-refresh interval ─────────────────────────────────────
  useEffect(() => {
    if (!isFullData) return
    const id = setInterval(() => {
      if (isPausedRef.current || document.hidden) return
      doRefresh()
    }, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [isFullData, doRefresh])

  // ── Resume refresh when tab becomes visible ───────────────────
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden && isFullDataRef.current && !isPausedRef.current) doRefresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [doRefresh])

  return {
    allListings,
    isScanning,
    isFullData,
    isFromCache,    // true while showing cached data before the refresh completes
    fetchError,     // non-null only if the initial scan itself fails (no cache fallback)
    scanProgress,
    isRefreshing,
    lastUpdated,
    isPaused,
    togglePause,
  }
}
