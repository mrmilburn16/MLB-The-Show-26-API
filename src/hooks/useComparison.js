import { useState, useCallback } from 'react'

const MAX_TRAY    = 3
const MAX_HISTORY = 10
const LS_KEY      = 'stubflipper_cmp_history'

function loadHistory() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveHistory(entries) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY))) } catch {}
}

/**
 * useComparison
 *
 * Manages the comparison tray (up to 3 listings), modal open state,
 * and localStorage-persisted comparison history.
 *
 * Returns:
 *   tray          { uuid, listing }[]  — cards queued for comparison
 *   isModalOpen   bool
 *   history       { id, timestamp, cards: [{uuid,name,rarity,position,ovr}] }[]
 *   addToTray     fn(listing) → void
 *   removeFromTray fn(uuid) → void
 *   clearTray     fn() → void
 *   openModal     fn() → void
 *   closeModal    fn() → void
 *   isInTray      fn(uuid) → bool
 *   isTrayFull    bool
 */
export function useComparison() {
  const [tray,        setTray]        = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [history,     setHistory]     = useState(loadHistory)

  const isInTray  = useCallback((uuid) => tray.some(t => t.uuid === uuid), [tray])
  const isTrayFull = tray.length >= MAX_TRAY

  const addToTray = useCallback((listing) => {
    const uuid = listing?.uuid || listing?.item?.uuid
    if (!uuid) return
    setTray(prev => {
      if (prev.some(t => t.uuid === uuid)) return prev // already in tray
      if (prev.length >= MAX_TRAY) return prev          // full
      return [...prev, { uuid, listing }]
    })
  }, [])

  const removeFromTray = useCallback((uuid) => {
    setTray(prev => prev.filter(t => t.uuid !== uuid))
  }, [])

  const clearTray = useCallback(() => setTray([]), [])

  const openModal = useCallback(() => {
    setTray(prev => {
      if (prev.length < 2) return prev // don't open with < 2 cards

      // Save to history
      const entry = {
        id:        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        cards: prev.map(({ uuid, listing }) => ({
          uuid,
          name:     listing.listing_name || listing.item?.name || uuid,
          rarity:   listing.item?.rarity || '',
          position: listing.item?.display_position || '',
          ovr:      listing.item?.ovr ?? null,
          team:     listing.item?.team || '',
        })),
      }

      setHistory(h => {
        const next = [entry, ...h.filter(e => e.id !== entry.id)].slice(0, MAX_HISTORY)
        saveHistory(next)
        return next
      })

      return prev
    })
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => setIsModalOpen(false), [])

  const clearHistory = useCallback(() => {
    setHistory([])
    saveHistory([])
  }, [])

  return {
    tray,
    isModalOpen,
    history,
    addToTray,
    removeFromTray,
    clearTray,
    openModal,
    closeModal,
    clearHistory,
    isInTray,
    isTrayFull,
  }
}
