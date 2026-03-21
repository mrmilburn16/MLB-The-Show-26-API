import { useState, useCallback, useEffect } from 'react'
import { API_BASE } from '../constants'

const LIST_TTL   = 60 * 60 * 1000        // 1 hr  — list changes rarely mid-session
const DETAIL_TTL = 24 * 60 * 60 * 1000  // 24 hr — released update data never changes

// Module-level caches
let listCache = { data: null, loadedAt: 0 }
const detailCache = new Map()   // id → { data, loadedAt }

// ── Rarity inference from OVR (Live Series thresholds) ──────────
// Used when the API doesn't explicitly return old_rarity / new_rarity.
const RARITY_RANK = { Common: 0, Bronze: 1, Silver: 2, Gold: 3, Diamond: 4 }

export function ovrToRarity(ovr) {
  if (ovr == null) return null
  if (ovr >= 85) return 'Diamond'
  if (ovr >= 80) return 'Gold'
  if (ovr >= 75) return 'Silver'
  if (ovr >= 65) return 'Bronze'
  return 'Common'
}

// ── Field-name aliases ───────────────────────────────────────────
// Attribute change entries may use a variety of field names depending
// on the game year. We normalise to a single shape here.

function normaliseAttrChange(a) {
  return {
    name:  a.attribute || a.name || a.attribute_name || '',
    old:   a.old ?? a.old_value ?? a.before ?? 0,
    new:   a.new ?? a.new_value ?? a.after  ?? 0,
    delta: a.delta ?? a.change  ?? ((a.new ?? a.new_value ?? a.after ?? 0)
                                  - (a.old ?? a.old_value ?? a.before ?? 0)),
  }
}

function parseAttrChange(p) {
  const oldOvr    = p.old_ovr ?? p.old_ovr_value ?? null
  const newOvr    = p.new_ovr ?? p.new_ovr_value ?? p.ovr ?? null
  const ovrDelta  = newOvr != null && oldOvr != null ? newOvr - oldOvr : null

  const oldRarity = p.old_rarity ?? (oldOvr != null ? ovrToRarity(oldOvr) : null)
  const newRarity = p.new_rarity ?? p.rarity ?? (newOvr != null ? ovrToRarity(newOvr) : null)
  const tierDelta = (RARITY_RANK[newRarity] ?? 0) - (RARITY_RANK[oldRarity] ?? 0)

  const attrChanges = (p.attribute_changes ?? p.changes ?? p.attributes ?? [])
    .map(normaliseAttrChange)

  return {
    uuid:        p.uuid        ?? null,
    name:        p.listing_name ?? p.name ?? p.player_name ?? 'Unknown Player',
    img:         p.baked_img   ?? p.img  ?? p.image ?? '',
    team:        p.team        ?? p.team_name ?? '',
    position:    p.display_position ?? p.position ?? '',
    seriesId:    p.series_id   ?? null,
    // OVR
    oldOvr, newOvr, ovrDelta,
    // Rarity / tier
    oldRarity, newRarity,
    tierUp:   tierDelta > 0,
    tierDown: tierDelta < 0,
    // Attribute-level changes
    attrChanges,
  }
}

function parsePosChange(p) {
  return {
    uuid:        p.uuid ?? null,
    name:        p.listing_name ?? p.name ?? p.player_name ?? 'Unknown Player',
    img:         p.baked_img ?? p.img ?? p.image ?? '',
    team:        p.team ?? '',
    ovr:         p.ovr ?? null,
    rarity:      p.rarity ?? null,
    oldPosition: p.old_display_position ?? p.old_position ?? p.from ?? '',
    newPosition: p.new_display_position ?? p.new_position ?? p.to   ?? '',
  }
}

function parseNewlyAdded(p) {
  const item = p.item ?? p
  return {
    uuid:     item.uuid        ?? null,
    name:     item.listing_name ?? item.name ?? 'New Player',
    img:      item.baked_img   ?? item.img   ?? item.image ?? '',
    team:     item.team        ?? '',
    position: item.display_position ?? item.position ?? '',
    ovr:      item.ovr ?? null,
    rarity:   item.rarity ?? null,
    seriesId: item.series_id ?? null,
  }
}

/**
 * Parses the raw JSON from roster_update.json?id=N.
 *
 * Returns `null` when the update has not been released yet
 * (the API may respond with null, {}, or an object with all-empty arrays).
 */
function parseDetail(rawData, updateId) {
  // Treat null / bare null JSON as "not yet released"
  if (rawData == null) return null

  const ru = rawData.roster_update ?? rawData

  // An empty object or an object with no recognisable data also means "not released"
  if (!ru || typeof ru !== 'object') return null

  const attrChanges   = (ru.attribute_changes  ?? []).map(parseAttrChange)
  const posChanges    = (ru.position_changes   ?? []).map(parsePosChange)
  const newlyAdded    = (ru.newly_added        ?? ru.new_players ?? []).map(parseNewlyAdded)

  // If all three arrays are empty AND there's nothing else meaningful, treat as unreleased
  if (attrChanges.length === 0 && posChanges.length === 0 && newlyAdded.length === 0) {
    return null
  }

  const upgraded   = attrChanges.filter(p => (p.ovrDelta ?? 0) > 0)
  const downgraded = attrChanges.filter(p => (p.ovrDelta ?? 0) < 0)
  const tierUps    = attrChanges.filter(p => p.tierUp)
  const tierDowns  = attrChanges.filter(p => p.tierDown)

  return {
    id:          updateId,
    name:        ru.name ?? '',
    date:        ru.date ?? '',
    attrChanges,
    posChanges,
    newlyAdded,
    // Derived groups
    upgraded, downgraded, tierUps, tierDowns,
    totalChanged: attrChanges.length,
  }
}

// ── Countdown helper ─────────────────────────────────────────────

/** Parse "April 15, 2026" or an ISO string into a Date, or return null. */
export function parseUpdateDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

/** Days until `targetDate` from now (negative means past). */
export function daysUntil(targetDate) {
  if (!targetDate) return null
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.ceil((targetDate.getTime() - Date.now()) / msPerDay)
}

// ── Hook ─────────────────────────────────────────────────────────

export function useRosterUpdates() {
  const [updateList,    setUpdateList]    = useState(listCache.data)
  const [loadingList,   setLoadingList]   = useState(false)
  const [selectedId,    setSelectedId]    = useState(null)
  // detail = parsed object (released) | null (unreleased) | undefined (not fetched yet)
  const [detail,        setDetail]        = useState(undefined)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error,         setError]         = useState(null)

  // ── Fetch the update list ──────────────────────────────────────
  const fetchList = useCallback(async () => {
    if (listCache.data && Date.now() - listCache.loadedAt < LIST_TTL) {
      setUpdateList(listCache.data)
      return listCache.data
    }
    setLoadingList(true)
    setError(null)
    try {
      const res  = await fetch(`${API_BASE}/roster_updates.json`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const list = (data.roster_updates ?? data.updates ?? [])
        .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))   // newest first
      listCache = { data: list, loadedAt: Date.now() }
      setUpdateList(list)
      return list
    } catch (e) {
      setError(e.message || 'Failed to load roster update list')
      return null
    } finally {
      setLoadingList(false)
    }
  }, [])

  // ── Fetch one update's full detail ────────────────────────────
  const fetchDetail = useCallback(async (id) => {
    if (id == null) return
    setSelectedId(id)

    // Check module-level cache first (survives remounts)
    const cached = detailCache.get(id)
    if (cached && Date.now() - cached.loadedAt < DETAIL_TTL) {
      setDetail(cached.data)    // may be null (unreleased)
      return
    }

    setLoadingDetail(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/roster_update.json?id=${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      let raw
      const text = await res.text()
      try { raw = JSON.parse(text) } catch { raw = null }

      const parsed = parseDetail(raw, id)

      // Cache forever for released updates; re-check in 5 min for unreleased
      const ttl = parsed ? DETAIL_TTL : 5 * 60 * 1000
      detailCache.set(id, { data: parsed, loadedAt: Date.now(), ttl })
      setDetail(parsed)
    } catch (e) {
      setError(e.message || `Failed to load roster update #${id}`)
      setDetail(undefined)
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  // ── Auto-load on mount ─────────────────────────────────────────
  useEffect(() => {
    fetchList().then(list => {
      if (list?.length > 0) fetchDetail(list[0].id)
    })
  }, [fetchList, fetchDetail])

  return {
    updateList, loadingList,
    selectedId, detail, loadingDetail,
    error,
    selectUpdate: fetchDetail,
  }
}

// ── Watch List localStorage helpers ──────────────────────────────

const WL_KEY = 'stubflipper_watch_list'
export function loadWatchList()       { try { return JSON.parse(localStorage.getItem(WL_KEY) || '[]') } catch { return [] } }
export function saveWatchList(list)   { try { localStorage.setItem(WL_KEY, JSON.stringify(list)) } catch {} }
