import { useState, useCallback, useRef } from 'react'
import { API_BASE, MARKET_TAX } from '../constants'
import { calcVelocity, sleep } from '../utils/velocity'
import { computeSnipeStats } from '../utils/snipe'

const CACHE_TTL   = 5 * 60 * 1000  // 5 minutes
const BATCH_SIZE  = 3               // max concurrent fetches
const BATCH_DELAY = 200             // ms between batches
const RETRY_DELAY = 2_000           // ms after a 429
const MAX_RETRIES = 3

/**
 * Lazy, queue-based velocity fetcher.
 *
 * Call requestUuid(uuid) from row-visibility events or click handlers.
 * The hook:
 *   1. Deduplicates: ignores UUIDs already queued, in-flight, or fresh in cache.
 *   2. Staggered batches: 3 concurrent requests, 200 ms gap between batches.
 *   3. 429 handling: exponential back-off up to MAX_RETRIES times.
 *   4. TTL cache: results stored in a Map; re-fetched only after 5 minutes.
 *
 * Returns:
 *   velocityMap   { [uuid]: { salesPerMin, profitPerMin, completedOrders, priceHistory } }
 *   pendingCount  number — items in queue + in-flight (drives the banner)
 *   requestUuid   fn(uuid: string) => void
 */
export function useVelocity() {
  // ── Persistent refs (survive re-renders, mutations don't trigger re-render) ──
  const cacheRef    = useRef(new Map())  // uuid → { ...data, fetchedAt }
  const queueRef    = useRef([])         // ordered array of uuids to fetch
  const queueSetRef = useRef(new Set())  // O(1) duplicate guard for queue
  const inFlightRef = useRef(new Set())  // uuids currently being fetched
  const runningRef  = useRef(false)      // is the processor loop active?

  // ── React state (drives re-renders) ──
  const [velocityMap,  setVelocityMap]  = useState({})
  const [pendingCount, setPendingCount] = useState(0)

  // Keep a ref to the processor so the async loop can re-invoke itself
  // without capturing a stale closure.
  const runProcessorRef = useRef(null)

  // ── Core fetch for a single UUID (with 429 retry) ──
  const fetchOne = useCallback(async (uuid, attempt = 0) => {
    try {
      const res = await fetch(`${API_BASE}/listing.json?uuid=${uuid}`)

      if (res.status === 429) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY * (attempt + 1))  // 2s, 4s, 6s
          return fetchOne(uuid, attempt + 1)
        }
        throw new Error('rate-limited')
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()

      // Recompute profit from the detail endpoint's live prices so we're consistent
      const sell = typeof data.best_sell_price === 'number' ? data.best_sell_price : null
      const buy  = typeof data.best_buy_price  === 'number' ? data.best_buy_price  : null
      const profitAfterTax = sell != null && buy != null
        ? Math.floor(sell * (1 - MARKET_TAX)) - buy
        : null

      const listingName = data.listing_name || data.item?.name || uuid
      const vel   = calcVelocity(data.completed_orders, profitAfterTax, listingName)
      // Snipe/spread/volatility stats — uses the live prices from the detail endpoint
      const snipe = computeSnipeStats(data.completed_orders, buy, sell)

      const entry = {
        ...vel,
        ...snipe,
        completedOrders: data.completed_orders || [],
        priceHistory:    data.price_history    || [],
        fetchedAt: Date.now(),
      }

      cacheRef.current.set(uuid, entry)
      setVelocityMap(prev => ({ ...prev, [uuid]: entry }))

    } catch {
      // Cache a stub so we don't hammer a broken/missing listing repeatedly
      const stub = {
        salesPerMin: 0, profitPerMin: 0,
        completedOrders: [], priceHistory: [],
        fetchedAt: Date.now(),
      }
      cacheRef.current.set(uuid, stub)
      // Don't expose stub to velocityMap so callers know there's no real data
    }
  }, [])

  // ── Queue processor: drain in staggered batches of BATCH_SIZE ──
  const runProcessor = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true

    while (queueRef.current.length > 0) {
      // Grab next batch, removing from queue
      const batch = queueRef.current.splice(0, BATCH_SIZE)
      batch.forEach(uuid => {
        queueSetRef.current.delete(uuid)
        inFlightRef.current.add(uuid)
      })
      setPendingCount(queueRef.current.length + inFlightRef.current.size)

      // Fetch batch in parallel
      await Promise.all(batch.map(uuid => fetchOne(uuid)))

      batch.forEach(uuid => inFlightRef.current.delete(uuid))
      setPendingCount(queueRef.current.length + inFlightRef.current.size)

      // Stagger: wait before pulling the next batch
      if (queueRef.current.length > 0) {
        await sleep(BATCH_DELAY)
      }
    }

    runningRef.current = false
  }, [fetchOne])

  // Stable ref so runProcessor can call itself without stale-closure issues
  runProcessorRef.current = runProcessor

  // ── Public API: request velocity data for a UUID ──
  const requestUuid = useCallback((uuid) => {
    if (!uuid) return

    // Already being handled
    if (queueSetRef.current.has(uuid) || inFlightRef.current.has(uuid)) return

    // Cache hit: fresh entry
    const cached = cacheRef.current.get(uuid)
    if (cached && Date.now() - cached.fetchedAt <= CACHE_TTL) {
      // Hydrate state if not already there (e.g. after a hard refresh of the hook)
      setVelocityMap(prev => (prev[uuid] ? prev : { ...prev, [uuid]: cached }))
      return
    }

    // Enqueue and wake processor
    queueRef.current.push(uuid)
    queueSetRef.current.add(uuid)
    setPendingCount(queueRef.current.length + inFlightRef.current.size)

    if (!runningRef.current) {
      runProcessorRef.current()
    }
  }, [])

  return { velocityMap, pendingCount, requestUuid }
}
