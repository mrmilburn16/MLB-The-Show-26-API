import { useState, useCallback, useRef } from 'react'
import { API_BASE } from '../constants'

const CACHE_TTL = 30 * 60 * 1000  // 30 minutes — card attributes rarely change

/**
 * Lazy item-data fetcher.
 *
 * Fetches /apis/item.json?uuid= on demand (when a card row is clicked).
 * Results are cached for 30 minutes. Only one UUID is tracked as "loading"
 * at a time since the panel can only show one card at once.
 *
 * Returns:
 *   itemMap      { [uuid]: full item.json payload }
 *   loadingUuid  string | null — the uuid currently being fetched
 *   requestItem  fn(uuid: string) => void
 */
export function useItemData() {
  const cacheRef = useRef(new Map())

  const [itemMap,     setItemMap]     = useState({})
  const [loadingUuid, setLoadingUuid] = useState(null)

  const requestItem = useCallback(async (uuid) => {
    if (!uuid) return

    // Cache hit — hydrate state and return immediately
    const cached = cacheRef.current.get(uuid)
    if (cached && Date.now() - cached.fetchedAt <= CACHE_TTL) {
      setItemMap(prev => prev[uuid] ? prev : { ...prev, [uuid]: cached })
      return
    }

    setLoadingUuid(uuid)
    try {
      const res = await fetch(`${API_BASE}/item.json?uuid=${uuid}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const entry = { ...data, fetchedAt: Date.now() }
      cacheRef.current.set(uuid, entry)
      setItemMap(prev => ({ ...prev, [uuid]: entry }))
    } catch {
      // Item data is supplementary — silently fail, panel degrades gracefully
    } finally {
      setLoadingUuid(prev => (prev === uuid ? null : prev))
    }
  }, [])

  return { itemMap, loadingUuid, requestItem }
}
