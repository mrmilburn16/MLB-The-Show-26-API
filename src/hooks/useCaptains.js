import { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../constants'

const LS_KEY  = 'cap_data_v1'
const CACHE_TTL = 60 * 60 * 1000   // 1 hour — captain data is mostly static

// ── Normalise a raw captain entry from the API ─────────────────────
//
// The SDS /apis/captains.json structure (as discovered):
//   captain.name / captain.img / captain.baked_img / captain.ovr
//   captain.display_position / captain.team
//   captain.ability_name / captain.ability_desc
//   captain.tiers = [{ name_abbrev, requirement, boosts: [{name, delta}] }]
//
// We normalise defensively to handle any shape variation.

export function normaliseCaptain(c) {
  // Flatten tiers into a predictable array of { label, req, boosts: [{attr, delta}] }
  const rawTiers = Array.isArray(c.tiers) ? c.tiers : []

  const tiers = rawTiers.map((t, i) => {
    // boosts may be an object or array depending on SDS API version
    let boosts = []
    if (Array.isArray(t.boosts)) {
      boosts = t.boosts.map(b => ({
        attr:  b.name  ?? b.attribute_name  ?? b.attr  ?? String(b),
        delta: b.delta ?? b.attribute_value ?? b.value ?? 0,
      }))
    } else if (t.boosts && typeof t.boosts === 'object') {
      boosts = Object.entries(t.boosts).map(([attr, delta]) => ({ attr, delta }))
    }

    // requirement may be a string or { count, description }
    const req = typeof t.requirement === 'string'
      ? t.requirement
      : t.requirement?.description ?? t.requirement?.count ?? `Tier ${i + 1}`

    return {
      label: t.name_abbreviation ?? t.name ?? t.label ?? `T${i + 1}`,
      req,
      boosts,
      rawRequirement: t.requirement,
    }
  })

  // Collect all boosted attribute names for filter indexing
  const allBoostedAttrs = [...new Set(
    tiers.flatMap(t => t.boosts.map(b => b.attr.toLowerCase()))
  )]

  // Sum of all Tier 3 boosts (for sorting)
  const tier3Sum = tiers.length >= 3
    ? tiers[2].boosts.reduce((s, b) => s + (b.delta || 0), 0)
    : tiers[tiers.length - 1]?.boosts.reduce((s, b) => s + (b.delta || 0), 0) ?? 0

  return {
    uuid:          c.uuid             ?? c.item?.uuid ?? '',
    name:          c.name             ?? c.item?.name ?? '—',
    ovr:           c.ovr              ?? c.item?.ovr  ?? null,
    position:      c.display_position ?? c.item?.display_position ?? '—',
    team:          c.team             ?? c.item?.team ?? '—',
    img:           c.baked_img        ?? c.img        ?? c.item?.baked_img ?? c.item?.img ?? null,
    abilityName:   c.ability_name     ?? c.captain_ability?.name ?? '—',
    abilityDesc:   c.ability_desc     ?? c.captain_ability?.description ?? '',
    tiers,
    allBoostedAttrs,
    tier3Sum,
    // Keep the raw payload for debugging / squad builder deep-dives
    _raw: c,
  }
}

// ── Fetch all captains pages ───────────────────────────────────────

async function fetchAllCaptains(onProgress) {
  const page1Res  = await fetch(`${API_BASE}/captains.json?page=1`)
  if (!page1Res.ok) throw new Error(`HTTP ${page1Res.status}`)
  const page1Data = await page1Res.json()

  // The API may return the list under various keys
  const extractList = (data) =>
    data.captains ?? data.captain_items ?? data.items ?? data.results ?? []

  const totalPages = page1Data.total_pages ?? 3
  const all = [...extractList(page1Data)]
  onProgress?.(all.length)

  for (let p = 2; p <= totalPages; p++) {
    const res  = await fetch(`${API_BASE}/captains.json?page=${p}`)
    if (!res.ok) continue
    const data = await res.json()
    all.push(...extractList(data))
    onProgress?.(all.length)
  }

  return all.map(normaliseCaptain)
}

// ── Hook ──────────────────────────────────────────────────────────

export function useCaptains() {
  const [captains,   setCaptains]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [progress,   setProgress]   = useState(0)
  const abortRef = useRef(false)

  useEffect(() => {
    abortRef.current = false

    // Check localStorage cache first
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const { timestamp, data } = JSON.parse(raw)
        if (data?.length && Date.now() - timestamp < CACHE_TTL) {
          setCaptains(data)
          setLoading(false)
          setProgress(data.length)
          return
        }
      }
    } catch { /* ignore */ }

    fetchAllCaptains((count) => {
      if (!abortRef.current) setProgress(count)
    })
      .then(data => {
        if (abortRef.current) return
        setCaptains(data)
        setLoading(false)
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({ timestamp: Date.now(), data }))
        } catch { /* quota */ }
      })
      .catch(e => {
        if (abortRef.current) return
        setError(!navigator.onLine ? 'No internet connection' : e.message)
        setLoading(false)
      })

    return () => { abortRef.current = true }
  }, [])

  function refresh() {
    localStorage.removeItem(LS_KEY)
    setLoading(true)
    setError(null)
    setProgress(0)
    setCaptains([])

    fetchAllCaptains((count) => setProgress(count))
      .then(data => {
        setCaptains(data)
        setLoading(false)
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({ timestamp: Date.now(), data }))
        } catch { /* quota */ }
      })
      .catch(e => {
        setError(!navigator.onLine ? 'No internet connection' : e.message)
        setLoading(false)
      })
  }

  return { captains, loading, error, progress, refresh }
}
