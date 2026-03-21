/**
 * Shared items.json catalog store.
 *
 * Persistence layers (fastest → slowest):
 *   1. Module-level memory  — survives re-renders, lost on page reload
 *   2. localStorage         — survives page reload, 30-min TTL
 *   3. Network fetch        — always fresh, slow (77+ pages)
 *
 * Both CardFinder and CollectionTracker use this — the catalog is fetched
 * once per session and reused by all consumers. Concurrent callers share
 * the same in-flight Promise so the network is only hit once.
 */
import { API_BASE } from '../constants'

const CONCURRENT  = 3
const BATCH_DELAY = 200
export const CATALOG_TTL      = 30 * 60 * 1000   // 30 min (was 10 min)
const CATALOG_CACHE_KEY = 'stubflipper_catalog_cache'

// ── localStorage helpers ─────────────────────────────────────────
// We slim the payload: only store fields needed for team matching, rarity
// grouping, and market cross-reference. Card art URLs are included since
// they're small strings (no binary).

function slimItem(item) {
  return {
    uuid:             item.uuid,
    name:             item.name,
    listing_name:     item.listing_name,
    rarity:           item.rarity,
    ovr:              item.ovr,
    team:             item.team,
    team_short_name:  item.team_short_name,
    display_position: item.display_position,
    series:           item.series,
    series_id:        item.series_id,
    set_name:         item.set_name,
    img:              item.img,
    baked_img:        item.baked_img,
  }
}

function saveCatalogCache(items) {
  try {
    localStorage.setItem(
      CATALOG_CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), items: items.map(slimItem) })
    )
  } catch (e) {
    console.warn('Catalog cache write failed (quota?):', e.message)
  }
}

function loadCatalogCache() {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY)
    if (!raw) return null
    const { timestamp, items } = JSON.parse(raw)
    if (!items?.length || Date.now() - timestamp > CATALOG_TTL) return null
    return items
  } catch {
    return null
  }
}

// ── In-memory store ──────────────────────────────────────────────
const store = {
  items:     null,
  loadedAt:  0,
  _inflight: null,
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

/**
 * Returns the catalog if the in-memory copy is still fresh.
 * On first call after a page reload, checks localStorage instead.
 */
export function getCachedCatalog() {
  // In-memory hit
  if (store.items && Date.now() - store.loadedAt < CATALOG_TTL) {
    return store.items
  }
  // localStorage hit — populate in-memory so next call is instant
  const persisted = loadCatalogCache()
  if (persisted) {
    store.items    = persisted
    store.loadedAt = Date.now()
    return persisted
  }
  return null
}

/**
 * Ensures the catalog is loaded and returns it.
 * @param {function} onProgress  Called with { page, total } while fetching.
 */
export async function loadCatalog(onProgress) {
  const cached = getCachedCatalog()
  if (cached) return cached

  if (store._inflight) return store._inflight

  store._inflight = _fetchAll(onProgress)
    .then(items => {
      store.items     = items
      store.loadedAt  = Date.now()
      store._inflight = null
      saveCatalogCache(items)   // persist for next page load
      return items
    })
    .catch(e => {
      store._inflight = null
      throw e
    })

  return store._inflight
}

async function _fetchAll(onProgress) {
  const res = await fetch(`${API_BASE}/items.json?type=mlb_card&page=1`)
  if (!res.ok) {
    const offline = !navigator.onLine
    throw new Error(offline ? 'No internet connection' : `items.json → HTTP ${res.status}`)
  }
  const data  = await res.json()
  const total = data.total_pages || 1
  const all   = [...(data.items || [])]
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
