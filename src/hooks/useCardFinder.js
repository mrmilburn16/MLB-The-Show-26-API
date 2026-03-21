import { useState, useCallback, useRef } from 'react'
import { pitchArsenalStats, hasPitchType } from '../utils/pitches'
import { loadCatalog, getCachedCatalog, CATALOG_TTL } from '../store/catalog'

// ── Module-level caches (survive component remounts) ──────────────
const attrStore  = new Map()   // uuid → full item.json payload
const ATTR_TTL   = 60 * 60 * 1000   // 1 hr  — attributes are stable

const CONCURRENT     = 3
const BATCH_DELAY    = 120   // ms between batches
const MAX_CANDIDATES = 300   // safety cap before fetching attributes

// ── Helpers ────────────────────────────────────────────────────────
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

/** Fetch item.json for a single uuid, with cache awareness */
async function fetchAttr(uuid) {
  const cached = attrStore.get(uuid)
  if (cached && Date.now() - cached._fetchedAt < ATTR_TTL) return cached

  try {
    const res  = await fetch(`${API_BASE}/item.json?uuid=${uuid}`)
    if (!res.ok) return null
    const data = await res.json()
    const entry = { ...data, _fetchedAt: Date.now() }
    attrStore.set(uuid, entry)
    return entry
  } catch {
    return null
  }
}

/** Apply attribute threshold filters to a fetched item.json payload */
export function matchesAttrFilters(attrs, filters) {
  if (!attrs) return false
  const check    = (val, min) => min === '' || min == null || (val != null && val >= +min)
  const checkMax = (val, max) => max === '' || max == null || (val != null && val <= +max)

  // Hitting
  if (!check(attrs.contact_right,    filters.minContactR))       return false
  if (!check(attrs.contact_left,     filters.minContactL))       return false
  if (!check(attrs.power_right,      filters.minPowerR))         return false
  if (!check(attrs.power_left,       filters.minPowerL))         return false
  if (!check(attrs.plate_vision,     filters.minVision))         return false
  if (!check(attrs.plate_discipline, filters.minDiscipline))     return false
  if (!check(attrs.batting_clutch,   filters.minBattingClutch))  return false
  if (!check(attrs.speed,            filters.minSpeed))          return false

  // Pitching
  if (!check(attrs.k_per_bf,         filters.minKper9))          return false
  if (!checkMax(attrs.bb_per_bf,     filters.maxBBper9))         return false
  if (!checkMax(attrs.hits_per_bf,   filters.maxHper9))          return false
  if (!checkMax(attrs.hr_per_bf,     filters.maxHRper9))         return false
  if (!check(attrs.pitch_velocity,   filters.minVelocity))       return false
  if (!check(attrs.pitch_control,    filters.minControl))        return false
  if (!check(attrs.pitch_movement,   filters.minMovement))       return false
  if (!check(attrs.stamina,          filters.minStamina))        return false
  if (!check(attrs.pitching_clutch,  filters.minPitchingClutch)) return false

  // Fielding
  if (!check(attrs.fielding_ability, filters.minFielding))       return false
  if (!check(attrs.arm_strength,     filters.minArmStrength))    return false
  if (!check(attrs.reaction_time,    filters.minReaction))       return false

  // Bats/Throws
  if (filters.batHand   && attrs.bat_hand   !== filters.batHand)   return false
  if (filters.throwHand && attrs.throw_hand !== filters.throwHand) return false

  // Arsenal filters (operate on pitches array)
  const pitches = attrs.pitches || []
  if (filters.pitchType && !hasPitchType(pitches, filters.pitchType))    return false
  if (filters.minPitchCount !== '' && filters.minPitchCount != null &&
      pitches.length < +filters.minPitchCount)                             return false
  if (filters.minSpeedRange !== '' && filters.minSpeedRange != null) {
    const s = pitchArsenalStats(pitches)
    if (!s || s.speedRange < +filters.minSpeedRange)                      return false
  }

  return true
}

/** Determine if a filter object has any attribute-level filters set */
export function hasAttrFilters(filters) {
  const attrKeys = [
    'minContactR','minContactL','minPowerR','minPowerL','minVision',
    'minDiscipline','minBattingClutch','minSpeed',
    'minKper9','maxBBper9','maxHper9','maxHRper9',
    'minVelocity','minControl','minMovement','minStamina','minPitchingClutch',
    'minFielding','minArmStrength','minReaction',
    'batHand','throwHand',
    // Arsenal
    'pitchType','minPitchCount','minSpeedRange',
  ]
  return attrKeys.some(k => filters[k] !== '' && filters[k] != null)
}

/**
 * useCardFinder
 *
 * Manages the full Card Finder search pipeline:
 *   1. Load & cache the items.json catalog
 *   2. Apply basic filters (rarity, position, OVR) → candidate set
 *   3. Throttled fetch of item.json for each candidate (if attr filters set)
 *   4. Apply attribute filters client-side
 *   5. Cross-reference with market listings for buy/sell price
 *
 * Returns:
 *   search(filters, listingMap) → runs the pipeline
 *   cancel()                   → aborts the current run
 *   isSearching                bool
 *   catalogStatus              { loading, loaded, progress }
 *   fetchProgress              { done, total }
 *   results                    enriched result objects
 *   tooManyCandidates          bool — true when basic filter returned > MAX_CANDIDATES
 *   error                      string | null
 */
export function useCardFinder() {
  const [isSearching,        setIsSearching]        = useState(false)
  const [catalogStatus,      setCatalogStatus]      = useState({ loading: false, loaded: !!getCachedCatalog(), progress: { page: 0, total: 0 } })
  const [fetchProgress,      setFetchProgress]      = useState({ done: 0, total: 0 })
  const [results,            setResults]            = useState([])
  const [tooManyCandidates,  setTooManyCandidates]  = useState(false)
  const [error,              setError]              = useState(null)

  const cancelRef = useRef(false)

  const cancel = useCallback(() => {
    cancelRef.current = true
    setIsSearching(false)
  }, [])

  const search = useCallback(async (filters, listingMap) => {
    cancelRef.current = false
    setIsSearching(true)
    setResults([])
    setError(null)
    setTooManyCandidates(false)
    setFetchProgress({ done: 0, total: 0 })

    try {
      // ── Step 1: Ensure catalog is loaded (shared store) ───────
      const alreadyCached = !!getCachedCatalog()
      if (!alreadyCached) {
        setCatalogStatus({ loading: true, loaded: false, progress: { page: 0, total: 0 } })
      }

      let catalog
      try {
        catalog = await loadCatalog(
          prog => setCatalogStatus({ loading: true, loaded: false, progress: prog })
        )
      } catch (e) {
        throw new Error(`Failed to load card catalog: ${e.message}`)
      }

      if (cancelRef.current || !catalog) { setIsSearching(false); return }
      setCatalogStatus({ loading: false, loaded: true, progress: { page: catalog.length, total: catalog.length } })

      // ── Step 2: Basic filters ──────────────────────────────────
      const candidates = catalog.filter(item => {
        if (filters.rarity   && item.rarity            !== filters.rarity)   return false
        if (filters.position && item.display_position  !== filters.position) return false
        const ovr = typeof item.ovr === 'number' ? item.ovr : parseInt(item.ovr, 10)
        if (filters.minOvr !== '' && (isNaN(ovr) || ovr < +filters.minOvr)) return false
        if (filters.maxOvr !== '' && (isNaN(ovr) || ovr > +filters.maxOvr)) return false
        return true
      })

      // ── Step 3: Attribute fetching (only if attr filters set) ──
      const needsAttrs = hasAttrFilters(filters)

      if (!needsAttrs) {
        // No attribute filters — show catalog results immediately
        const res = buildResults(candidates.slice(0, 500), {}, listingMap, filters)
        setResults(res)
        setIsSearching(false)
        return
      }

      // Safety cap
      if (candidates.length > MAX_CANDIDATES) {
        setTooManyCandidates(true)
      }
      const limited = candidates.slice(0, MAX_CANDIDATES)
      setFetchProgress({ done: 0, total: limited.length })

      // Throttled batch fetch
      const attrResults = {}
      let done = 0

      for (let i = 0; i < limited.length && !cancelRef.current; i += CONCURRENT) {
        const batch = limited.slice(i, i + CONCURRENT)
        const fetched = await Promise.all(batch.map(item => fetchAttr(item.uuid)))
        if (cancelRef.current) break
        batch.forEach((item, bi) => {
          if (fetched[bi]) attrResults[item.uuid] = fetched[bi]
        })
        done += batch.length
        setFetchProgress({ done, total: limited.total })
        setFetchProgress(prev => ({ ...prev, done }))
        if (i + CONCURRENT < limited.length) await sleep(BATCH_DELAY)
      }

      if (cancelRef.current) { setIsSearching(false); return }

      // ── Step 4: Attribute filter + results ─────────────────────
      const matched = limited.filter(item => matchesAttrFilters(attrResults[item.uuid], filters))
      const res = buildResults(matched, attrResults, listingMap, filters)
      setResults(res)

    } catch (e) {
      setError(e.message || 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }, [])

  return {
    search, cancel,
    isSearching, catalogStatus, fetchProgress,
    results, tooManyCandidates, error,
  }
}

/** Build final result rows with merged catalog, attr, and listing data */
function buildResults(items, attrResults, listingMap, filters) {
  const rows = items.map(item => {
    const attrs   = attrResults[item.uuid] || null
    const listing = listingMap?.get(item.uuid) || null
    // Pre-compute arsenal stats so sort can use them
    const arsenal = attrs?.pitches ? pitchArsenalStats(attrs.pitches) : null
    return { item, attrs, listing, arsenal }
  })

  rows.sort((a, b) => {
    // Arsenal sort keys take priority if those filters are active
    if (filters.minSpeedRange !== '' && filters.minSpeedRange != null) {
      const av = a.arsenal?.speedRange ?? 0
      const bv = b.arsenal?.speedRange ?? 0
      if (bv !== av) return bv - av
    }
    if (filters.minPitchCount !== '' && filters.minPitchCount != null) {
      const av = a.arsenal?.count ?? 0
      const bv = b.arsenal?.count ?? 0
      if (bv !== av) return bv - av
    }

    // Then by primary attribute filter
    const primaryAttr = getPrimaryAttr(filters)
    if (primaryAttr && a.attrs && b.attrs) {
      const av = a.attrs[primaryAttr] ?? 0
      const bv = b.attrs[primaryAttr] ?? 0
      if (bv !== av) return bv - av
    }

    // Fallback: OVR descending
    const ao = typeof a.item.ovr === 'number' ? a.item.ovr : parseInt(a.item.ovr, 10)
    const bo = typeof b.item.ovr === 'number' ? b.item.ovr : parseInt(b.item.ovr, 10)
    return (bo || 0) - (ao || 0)
  })

  return rows
}

const ATTR_FILTER_PRIORITY = [
  ['minContactR',       'contact_right'   ],
  ['minContactL',       'contact_left'    ],
  ['minPowerR',         'power_right'     ],
  ['minPowerL',         'power_left'      ],
  ['minVision',         'plate_vision'    ],
  ['minDiscipline',     'plate_discipline'],
  ['minBattingClutch',  'batting_clutch'  ],
  ['minSpeed',          'speed'           ],
  ['minKper9',          'k_per_bf'        ],
  ['minVelocity',       'pitch_velocity'  ],
  ['minControl',        'pitch_control'   ],
  ['minMovement',       'pitch_movement'  ],
  ['minStamina',        'stamina'         ],
  ['minFielding',       'fielding_ability'],
  ['minArmStrength',    'arm_strength'    ],
  ['minReaction',       'reaction_time'   ],
]
function getPrimaryAttr(filters) {
  for (const [fk, attrKey] of ATTR_FILTER_PRIORITY) {
    if (filters[fk] !== '' && filters[fk] != null) return attrKey
  }
  return null
}
