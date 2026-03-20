import { useState, useMemo, useRef } from 'react'
import {
  MAX_PRESETS,
  loadPresetsOrDefaults,
  savePresets,
  getLastActiveId,
  setLastActiveId,
} from '../utils/presets'

/**
 * usePresets
 *
 * Manages the saved-preset list and which preset is currently "active."
 *
 * Receives the live filter state from App so it can:
 *  - compute isModified (drift from saved values)
 *  - snapshot current state when saving / updating
 *
 * Returns the preset list + CRUD functions. App.jsx calls the returned
 * selectPreset(id) which gives back the preset object; App then applies
 * the filters itself so it controls all state updates in one place.
 */
export function usePresets({ filters, advFilters, uiSort, uiOrder }) {
  // Compute initial values synchronously once, before any render
  const initRef = useRef(null)
  if (initRef.current === null) {
    const presets = loadPresetsOrDefaults()
    const lastId  = getLastActiveId()
    initRef.current = {
      presets,
      activeId: presets.find(p => p.id === lastId) ? lastId : null,
    }
  }

  const [presets,  setPresetsState] = useState(initRef.current.presets)
  const [activeId, setActiveId]     = useState(initRef.current.activeId)
  const [presetError, setPresetError] = useState(null)

  const activePreset = presets.find(p => p.id === activeId) ?? null

  // ── Modified indicator ─────────────────────────────────────
  // Show "modified" when any filter/sort drifts from the loaded preset.
  // Tab switch alone is excluded — switching tabs shouldn't mark a preset dirty.
  const isModified = useMemo(() => {
    if (!activePreset) return false
    return JSON.stringify({
      filters:    activePreset.filters,
      advFilters: activePreset.advFilters,
      sort:       activePreset.uiSort,
      order:      activePreset.uiOrder,
    }) !== JSON.stringify({
      filters,
      advFilters,
      sort:  uiSort,
      order: uiOrder,
    })
  }, [activePreset, filters, advFilters, uiSort, uiOrder])

  // ── Internal helper ────────────────────────────────────────
  function _persist(next) {
    setPresetsState(next)
    savePresets(next)
    setPresetError(null)
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Select (activate) a preset by ID.
   * Returns the preset object so App.jsx can apply its filters.
   * Pass null to deselect.
   */
  function selectPreset(id) {
    const preset = id ? (presets.find(p => p.id === id) ?? null) : null
    setActiveId(id ?? null)
    setLastActiveId(id)
    return preset
  }

  /** Save the current filter state as a new named preset. */
  function saveAsNew(name) {
    if (presets.length >= MAX_PRESETS) {
      setPresetError('MAX_PRESETS')
      return null
    }
    const preset = {
      id:         crypto.randomUUID(),
      name:       name.trim(),
      createdAt:  Date.now(),
      filters:    { ...filters },
      advFilters: { ...advFilters },
      uiSort,
      uiOrder,
    }
    const next = [...presets, preset]
    _persist(next)
    setActiveId(preset.id)
    setLastActiveId(preset.id)
    return preset
  }

  /** Overwrite the active preset with the current filter state. */
  function updateActive() {
    if (!activeId) return
    const next = presets.map(p =>
      p.id === activeId
        ? { ...p, filters: { ...filters }, advFilters: { ...advFilters }, uiSort, uiOrder }
        : p
    )
    _persist(next)
  }

  /** Permanently delete a preset by ID. */
  function deleteById(id) {
    const next = presets.filter(p => p.id !== id)
    _persist(next)
    if (activeId === id) {
      setActiveId(null)
      setLastActiveId(null)
    }
  }

  return {
    presets,
    activeId,
    activePreset,
    isModified,
    presetError,
    selectPreset,
    saveAsNew,
    updateActive,
    deleteById,
  }
}
