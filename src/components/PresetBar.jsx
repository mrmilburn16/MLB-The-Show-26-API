import { useState, useRef, useEffect } from 'react'
import { MAX_PRESETS } from '../utils/presets'

export default function PresetBar({
  presets,
  activeId,
  activePreset,
  isModified,
  presetError,
  onSelect,      // (id | null) → void
  onSaveNew,     // (name: string) → void
  onUpdate,      // () → void (overwrite active preset)
  onDelete,      // (id) → void
}) {
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [saveName,      setSaveName]      = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const inputRef = useRef(null)

  // Auto-focus save input when it appears
  useEffect(() => {
    if (showSaveInput) inputRef.current?.focus()
  }, [showSaveInput])

  // Reset delete confirmation when active preset changes
  useEffect(() => { setDeleteConfirm(false) }, [activeId])

  function handleSelectChange(e) {
    const id = e.target.value
    onSelect(id || null)
    setShowSaveInput(false)
    setDeleteConfirm(false)
  }

  function handleSave() {
    const name = saveName.trim()
    if (!name) return
    onSaveNew(name)
    setSaveName('')
    setShowSaveInput(false)
  }

  function handleDeleteClick() {
    if (!deleteConfirm) {
      setDeleteConfirm(true)
      return
    }
    onDelete(activeId)
    setDeleteConfirm(false)
  }

  function openSaveInput() {
    setSaveName('')
    setShowSaveInput(true)
  }

  return (
    <div className="preset-bar">
      <div className="preset-bar-inner">

        {/* ── Selector ── */}
        <div className="preset-selector-group">
          <span className="preset-label-tag">PRESETS</span>
          <select
            className="preset-select"
            value={activeId ?? ''}
            onChange={handleSelectChange}
          >
            <option value="">— Select —</option>
            {presets.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Delete button (with two-click confirmation) */}
          {activeId && !showSaveInput && (
            <button
              className={`preset-icon-btn${deleteConfirm ? ' preset-icon-btn--danger' : ''}`}
              onClick={handleDeleteClick}
              onBlur={() => setDeleteConfirm(false)}
              title={deleteConfirm ? 'Click again to confirm delete' : 'Delete this preset'}
            >
              {deleteConfirm ? '✓ Confirm' : '🗑'}
            </button>
          )}
        </div>

        {/* ── Active preset indicator ── */}
        {activePreset && !showSaveInput && (
          <div className="preset-active">
            <span className="preset-active-dot" />
            <span className="preset-active-name">{activePreset.name}</span>
            {isModified && (
              <span className="preset-modified-pill">modified</span>
            )}
          </div>
        )}

        {/* ── Right-side actions ── */}
        <div className="preset-actions">
          {/* Overwrite active when there's drift */}
          {activePreset && isModified && !showSaveInput && (
            <button
              className="preset-btn preset-btn--update"
              onClick={onUpdate}
              title="Save current filters over this preset"
            >
              ↻ Update
            </button>
          )}

          {/* Inline save input */}
          {showSaveInput ? (
            <div className="preset-save-group">
              <input
                ref={inputRef}
                className="preset-name-input"
                placeholder="Name this preset…"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  handleSave()
                  if (e.key === 'Escape') { setShowSaveInput(false); setSaveName('') }
                }}
                maxLength={40}
              />
              <button
                className="preset-btn preset-btn--confirm"
                onClick={handleSave}
                disabled={!saveName.trim()}
              >
                ✓ Save
              </button>
              <button
                className="preset-btn preset-btn--cancel"
                onClick={() => { setShowSaveInput(false); setSaveName('') }}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              className="preset-btn preset-btn--new"
              onClick={openSaveInput}
              title={presets.length >= MAX_PRESETS ? `Max ${MAX_PRESETS} presets reached` : 'Save current filters as a preset'}
              disabled={presets.length >= MAX_PRESETS}
            >
              + Save Current
            </button>
          )}
        </div>

        {/* ── Errors / warnings ── */}
        {presetError === 'MAX_PRESETS' && (
          <span className="preset-error">
            Max {MAX_PRESETS} presets — delete one to save more
          </span>
        )}

      </div>
    </div>
  )
}
