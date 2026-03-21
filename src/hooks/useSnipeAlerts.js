import { useState, useCallback, useRef, useMemo } from 'react'
import { MARKET_TAX } from '../constants'

const MAX_HISTORY = 100

// ── Filter persistence ────────────────────────────────────────────
const LS_FILTERS_KEY = 'snipe_tab_filters'

const ALL_RARITIES = ['Diamond', 'Gold', 'Silver', 'Bronze', 'Common']

export const DEFAULT_SNIPE_FILTERS = {
  minBuyNow:   1000,   // skip cheap commons
  maxBuyNow:   '',
  minDiscount: 20,
  rarities:    [...ALL_RARITIES],
}

function loadFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_FILTERS_KEY) || '{}')
    return { ...DEFAULT_SNIPE_FILTERS, ...saved }
  } catch {
    return { ...DEFAULT_SNIPE_FILTERS }
  }
}

function saveFilters(f) {
  try { localStorage.setItem(LS_FILTERS_KEY, JSON.stringify(f)) } catch {}
}

// ── Core snipe math (exported so tests / other hooks can use it) ──
export function checkForSnipe(listing, velocityData, threshold) {
  const currentBuyNow = listing.best_sell_price
  if (!currentBuyNow || currentBuyNow <= 0) return null

  const orders = velocityData?.completedOrders
  if (!orders || orders.length < 10) return null

  const prices = orders
    .map(o => (typeof o.price === 'number' ? o.price : Number(String(o.price).replace(/,/g, ''))))
    .filter(v => Number.isFinite(v) && v > 0)

  if (prices.length < 10) return null

  const avg      = prices.reduce((a, b) => a + b, 0) / prices.length
  const discount = ((avg - currentBuyNow) / avg) * 100

  if (discount < threshold) return null

  const estProfit = Math.floor(avg * (1 - MARKET_TAX)) - currentBuyNow

  return { discount, avg, currentBuyNow, estProfit }
}

// ── Hook ─────────────────────────────────────────────────────────
export function useSnipeAlerts() {
  const [alerts,       setAlerts]       = useState([])
  const [history,      setHistory]      = useState([])
  const [filters,      setFiltersState] = useState(loadFilters)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [historyOpen,  setHistoryOpen]  = useState(false)

  // Back-compat: threshold is now derived from filters.minDiscount
  const threshold    = filters.minDiscount
  const setThreshold = useCallback((v) => {
    setFiltersState(prev => {
      const next = { ...prev, minDiscount: Number(v) }
      saveFilters(next)
      return next
    })
  }, [])

  const setFilters = useCallback((updater) => {
    setFiltersState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      saveFilters(next)
      return next
    })
  }, [])

  // Dedup key so same card at same price only fires once per session
  const seenKeysRef     = useRef(new Set())
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
      osc.frequency.setValueAtTime(1046, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(523, ctx.currentTime + 0.25)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch { /* AudioContext not available */ }
  }

  // ── Run snipe detection on every auto-refresh ─────────────────
  const runSnipeCheck = useCallback((enrichedListings, velocityMap, currentThreshold) => {
    const newAlerts = []

    for (const listing of enrichedListings) {
      const uuid = listing.uuid || listing.item?.uuid
      if (!uuid) continue

      const velData = velocityMap[uuid]
      if (!velData) continue

      const result = checkForSnipe(listing, velData, currentThreshold)
      if (!result) continue

      const key = `${uuid}:${listing.best_sell_price}`
      if (seenKeysRef.current.has(key)) continue
      seenKeysRef.current.add(key)

      newAlerts.push({
        id:             `${uuid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        uuid,
        listing,
        ...result,
        detectedAt:     Date.now(),
        stillAvailable: true,
      })
    }

    if (newAlerts.length === 0) return

    const reversed = [...newAlerts].reverse()
    setAlerts(prev => [...reversed, ...prev])
    setHistory(prev => [...newAlerts, ...prev].slice(0, MAX_HISTORY))

    if (soundEnabledRef.current) playPing()
  }, [])

  // ── Update "still available" status after each refresh ────────
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

  // ── Apply display filters (client-side, sorted by profit) ─────
  const filteredAlerts = useMemo(() => {
    return alerts
      .filter(a => {
        const price  = a.currentBuyNow
        const rarity = a.listing?.item?.rarity || 'Common'
        if (filters.minBuyNow !== '' && price < +filters.minBuyNow)   return false
        if (filters.maxBuyNow !== '' && price > +filters.maxBuyNow)   return false
        if (a.discount < +filters.minDiscount)                         return false
        if (filters.rarities.length > 0 && !filters.rarities.includes(rarity)) return false
        return true
      })
      .sort((a, b) => b.estProfit - a.estProfit)
  }, [alerts, filters])

  const dismissAlert = useCallback((id) => setAlerts(prev => prev.filter(a => a.id !== id)), [])
  const dismissAll   = useCallback(() => setAlerts([]), [])
  const clearHistory = useCallback(() => {
    setHistory([])
    seenKeysRef.current.clear()
  }, [])

  return {
    // raw alerts (for total badge count including pre-filter)
    alerts,
    // filtered + sorted (what the tab actually shows)
    filteredAlerts,
    history,
    historyOpen, setHistoryOpen,
    // filters
    filters, setFilters,
    // back-compat aliases still used by App.jsx
    threshold, setThreshold,
    soundEnabled, setSoundEnabled,
    // actions
    runSnipeCheck,
    updateAvailability,
    dismissAlert,
    dismissAll,
    clearHistory,
  }
}
