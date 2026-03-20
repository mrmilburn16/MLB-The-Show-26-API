// ── Constants ──────────────────────────────────────────────────
export const STORAGE_KEY    = 'stubflipper_presets'
export const LAST_KEY       = 'stubflipper_last_preset'
export const MAX_PRESETS    = 20
const        MAX_PRESET_BYTES = 50_000   // ~50 KB — a preset is only filter settings, never API data

// ── Emergency cleanup (runs at module load, before anything reads storage) ──
// Guards against a QuotaExceededError if a past bug stored API data in presets.
;(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && raw.length > MAX_PRESET_BYTES) {
      console.warn(`[presets] Storage bloated (${raw.length} bytes) — clearing.`)
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(LAST_KEY)
    }
  } catch { /* ignore read errors */ }
})()

// ── Default filter shapes (single source of truth for App.jsx too) ──
export const DEFAULT_FILTERS = {
  type: 'mlb_card',
  rarity: '', position: '', team: '', name: '', series: '',
  set: '', brand: '',
  minBuyPrice: '', maxBuyPrice: '',
  minSellPrice: '', maxSellPrice: '',
  minRank: '', maxRank: '',
}

export const DEFAULT_ADV = {
  minProfit: '', maxProfit: '',
  minROI: '',    maxROI: '',
  minProfitPerMin: '', maxProfitPerMin: '',
  minSnipeDiscount: '',
  minSalesPerMin: '',
  minSpreadPct: '',
  maxPremiumPctOverQS: '',  // Near-QS filter: only show cards within X% of quicksell
  hideNoBids: true,
}

// ── localStorage helpers ───────────────────────────────────────
export function loadPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch { /* fall through */ }
  return null
}

export function savePresets(presets) {
  // Strip any accidentally-attached API data before persisting.
  // A preset should only hold filter settings — never listings, completed_orders, etc.
  const slim = presets.map(({ id, name, createdAt, filters, advFilters, uiSort, uiOrder }) => ({
    id, name, createdAt, filters, advFilters, uiSort, uiOrder,
  }))
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
  } catch (e) {
    console.warn('[presets] Failed to save presets:', e.message)
  }
}

export function getLastActiveId() {
  return localStorage.getItem(LAST_KEY) || null
}

export function setLastActiveId(id) {
  if (id) localStorage.setItem(LAST_KEY, id)
  else     localStorage.removeItem(LAST_KEY)
}

// ── Built-in presets (seeded on first visit) ───────────────────
const uid = () => crypto.randomUUID()

export const BUILTIN_PRESETS = [
  {
    id: uid(), name: 'Budget Flips', createdAt: Date.now(),
    filters:    { ...DEFAULT_FILTERS, rarity: 'Gold', minBuyPrice: '500', maxBuyPrice: '5000' },
    advFilters: { ...DEFAULT_ADV,     minProfit: '100', minSalesPerMin: '0.05' },
    uiSort: 'profit_per_min', uiOrder: 'desc',
  },
  {
    id: uid(), name: 'Diamond Snipes', createdAt: Date.now(),
    filters:    { ...DEFAULT_FILTERS, rarity: 'Diamond' },
    advFilters: { ...DEFAULT_ADV, minSnipeDiscount: '10' },
    uiSort: 'snipe_discount', uiOrder: 'desc',
  },
  {
    id: uid(), name: 'High Volume', createdAt: Date.now(),
    filters:    { ...DEFAULT_FILTERS },
    advFilters: { ...DEFAULT_ADV, minSalesPerMin: '0.5' },
    uiSort: 'profit_per_min', uiOrder: 'desc',
  },
  {
    id: uid(), name: 'Wide Spreads', createdAt: Date.now(),
    filters:    { ...DEFAULT_FILTERS },
    advFilters: { ...DEFAULT_ADV, minSpreadPct: '15' },
    uiSort: 'profit_per_min', uiOrder: 'desc',
  },
]

// ── Initialization helper ──────────────────────────────────────
// Call once on app startup to get the preset that should be active on load.
// Caches result so repeated calls are cheap (avoids multiple localStorage reads).
let _initCache = undefined

export function getInitialActivePreset() {
  if (_initCache !== undefined) return _initCache

  let presets = loadPresets()
  if (!presets) {
    presets = BUILTIN_PRESETS
    savePresets(presets)
  }

  const lastId = getLastActiveId()
  _initCache = lastId ? (presets.find(p => p.id === lastId) ?? null) : null
  return _initCache
}

export function loadPresetsOrDefaults() {
  const saved = loadPresets()
  if (saved) return saved
  savePresets(BUILTIN_PRESETS)
  return BUILTIN_PRESETS
}

// ── Working filter auto-save ───────────────────────────────────
// Separate from named presets — auto-saved on every change, auto-restored on load.
// Priority on load: working filters > last active preset > defaults.
export const FILTERS_KEY = 'stubflipper_filters'

export function saveWorkingFilters({ filters, advFilters, uiSort, uiOrder, activeTab }) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify({
      filters, advFilters, uiSort, uiOrder, activeTab,
    }))
  } catch { /* quota exceeded — silently skip */ }
}

export function loadWorkingFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.filters) return parsed
  } catch { /* corrupt data */ }
  return null
}

/**
 * Returns the full initial state object for App.jsx.
 * Priority: saved working filters → last active preset → hard-coded defaults.
 * Spreads over DEFAULT_FILTERS / DEFAULT_ADV so any new keys get their defaults.
 */
export function loadInitialState() {
  const wf = loadWorkingFilters()
  if (wf) {
    return {
      filters:   { ...DEFAULT_FILTERS, ...wf.filters },
      advFilters: { ...DEFAULT_ADV,    ...wf.advFilters },
      uiSort:    wf.uiSort    ?? 'profit_per_min',
      uiOrder:   wf.uiOrder   ?? 'desc',
      activeTab: wf.activeTab ?? 'market',
    }
  }
  const p = getInitialActivePreset()
  if (p) {
    return {
      filters:    { ...DEFAULT_FILTERS, ...p.filters },
      advFilters: { ...DEFAULT_ADV,     ...p.advFilters },
      uiSort:     p.uiSort  ?? 'profit_per_min',
      uiOrder:    p.uiOrder ?? 'desc',
      activeTab:  'market',
    }
  }
  return {
    filters:    DEFAULT_FILTERS,
    advFilters: DEFAULT_ADV,
    uiSort:     'profit_per_min',
    uiOrder:    'desc',
    activeTab:  'market',
  }
}
