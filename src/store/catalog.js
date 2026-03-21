/**
 * Shared items.json catalog store.
 *
 * Both CardFinder and CollectionTracker use this — the catalog is fetched
 * once per session and reused by all consumers. Concurrent callers receive
 * the same in-flight Promise so the network is only hit once.
 */
import { API_BASE } from '../constants'

const CONCURRENT  = 3
const BATCH_DELAY = 200   // ms between page batches
export const CATALOG_TTL = 10 * 60 * 1000   // 10 min

const store = {
  items:      null,   // Array | null
  loadedAt:   0,
  _inflight:  null,   // Promise | null  — deduplicates concurrent loads
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

/** Returns the cached catalog if it is still fresh, or null. */
export function getCachedCatalog() {
  return store.items && Date.now() - store.loadedAt < CATALOG_TTL
    ? store.items
    : null
}

/**
 * Ensures the catalog is loaded and returns it.
 *
 * @param {function} onProgress  - Called with { page, total } during loading.
 *                                 Only the first concurrent caller gets updates.
 * @returns {Promise<Array>}
 */
export async function loadCatalog(onProgress) {
  const cached = getCachedCatalog()
  if (cached) return cached

  // Deduplicate: if a fetch is already in flight, join it
  if (store._inflight) return store._inflight

  store._inflight = _fetchAll(onProgress)
    .then(items => {
      store.items    = items
      store.loadedAt = Date.now()
      store._inflight = null
      return items
    })
    .catch(e => {
      store._inflight = null
      throw e
    })

  return store._inflight
}

async function _fetchAll(onProgress) {
  const firstRes  = await fetch(`${API_BASE}/items.json?type=mlb_card&page=1`)
  if (!firstRes.ok) throw new Error(`items.json → HTTP ${firstRes.status}`)
  const firstData = await firstRes.json()
  const total     = firstData.total_pages || 1
  const all       = [...(firstData.items || [])]
  onProgress?.({ page: 1, total })

  for (let i = 2; i <= total; i += CONCURRENT) {
    const batch = []
    for (let j = i; j < i + CONCURRENT && j <= total; j++) {
      batch.push(
        fetch(`${API_BASE}/items.json?type=mlb_card&page=${j}`)
          .then(r => r.ok ? r.json() : { items: [] })
          .then(d => d.items || [])
          .catch(() => [])
      )
    }
    const pages = await Promise.all(batch)
    pages.forEach(p => all.push(...p))
    onProgress?.({ page: Math.min(i + CONCURRENT - 1, total), total })
    if (i + CONCURRENT <= total) await sleep(BATCH_DELAY)
  }
  return all
}
