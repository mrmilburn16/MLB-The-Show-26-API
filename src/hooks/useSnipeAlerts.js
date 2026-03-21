import { useState, useCallback, useRef } from 'react'
import { MARKET_TAX } from '../constants'

const MAX_HISTORY = 100

/**
 * Pure function — check a single listing against its cached velocity data.
 * Returns a snipe result object if the current buy-now is `threshold`% or more
 * below the historical average, otherwise null.
 */
export function checkForSnipe(listing, velocityData, threshold) {
  const currentBuyNow = listing.best_sell_price
  if (!currentBuyNow || currentBuyNow <= 0) return null

  const orders = velocityData?.completedOrders
  if (!orders || orders.length < 10) return null

  const prices = orders
    .map(o => (typeof o.price === 'number' ? o.price : Number(String(o.price).replace(/,/g, ''))))
    .filter(v => Number.isFinite(v) && v > 0)

  if (prices.length < 10) return null

  const avg = prices.reduce((a, b) => a + b, 0) / prices.length
  const discount = ((avg - currentBuyNow) / avg) * 100

  if (discount < threshold) return null

  const estProfit = Math.floor(avg * (1 - MARKET_TAX)) - currentBuyNow

  return { discount, avg, currentBuyNow, estProfit }
}

/**
 * useSnipeAlerts
 *
 * Manages all snipe alert state: active alerts, session history,
 * user-configurable threshold, and sound notification toggle.
 *
 * Call runSnipeCheck(enrichedListings, velocityMap) on every auto-refresh.
 */
export function useSnipeAlerts() {
  const [alerts,      setAlerts]      = useState([])
  const [history,     setHistory]     = useState([])
  const [threshold,   setThreshold]   = useState(20)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [historyOpen,  setHistoryOpen]  = useState(false)

  // Dedup key: uuid + price, so the same card at the same price only fires once per session
  const seenKeysRef    = useRef(new Set())
  const soundEnabledRef = useRef(false)
  soundEnabledRef.current = soundEnabled

  const audioCtxRef = useRef(null)

  function playPing() {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      const ctx  = audioCtxRef.current
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1046, ctx.currentTime)         // C6
      osc.frequency.exponentialRampToValueAtTime(523, ctx.currentTime + 0.25) // C5
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch {
      // AudioContext not available — silently skip
    }
  }

  /**
   * Run snipe detection across the full enriched listings using cached velocity data.
   * New snipe opportunities are pushed to alerts (newest first) and logged to history.
   */
  const runSnipeCheck = useCallback((enrichedListings, velocityMap, currentThreshold) => {
    const newAlerts = []

    for (const listing of enrichedListings) {
      const uuid = listing.uuid || listing.item?.uuid
      if (!uuid) continue

      const velData = velocityMap[uuid]
      if (!velData) continue

      const result = checkForSnipe(listing, velData, currentThreshold)
      if (!result) continue

      // Dedup: same card at same price fires only once per session
      const key = `${uuid}:${listing.best_sell_price}`
      if (seenKeysRef.current.has(key)) continue
      seenKeysRef.current.add(key)

      newAlerts.push({
        id:         `${uuid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        uuid,
        listing,
        ...result,
        detectedAt: Date.now(),
        stillAvailable: true,
      })
    }

    if (newAlerts.length === 0) return

    // Newest on top
    const reversed = [...newAlerts].reverse()
    setAlerts(prev => [...reversed, ...prev])
    setHistory(prev => [...newAlerts, ...prev].slice(0, MAX_HISTORY))

    if (soundEnabledRef.current) playPing()
  }, [])

  /**
   * After a refresh, update "still available" status in history for existing entries.
   * An alert is still available if the card's current best_sell_price <= alert's price.
   */
  const updateAvailability = useCallback((enrichedListings) => {
    const priceByUuid = {}
    enrichedListings.forEach(l => {
      const uuid = l.uuid || l.item?.uuid
      if (uuid) priceByUuid[uuid] = l.best_sell_price
    })

    setHistory(prev => prev.map(entry => ({
      ...entry,
      stillAvailable: (priceByUuid[entry.uuid] ?? Infinity) <= entry.currentBuyNow,
    })))
  }, [])

  const dismissAlert = useCallback((id) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }, [])

  const dismissAll = useCallback(() => {
    setAlerts([])
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    seenKeysRef.current.clear()
  }, [])

  return {
    alerts,
    history,
    historyOpen,
    setHistoryOpen,
    threshold,
    setThreshold,
    soundEnabled,
    setSoundEnabled,
    runSnipeCheck,
    updateAvailability,
    dismissAlert,
    dismissAll,
    clearHistory,
  }
}
