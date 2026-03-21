import { useState, useMemo, useCallback } from 'react'
import { useCardFinder, hasAttrFilters } from '../hooks/useCardFinder'
import { RARITIES, POSITIONS } from '../constants'
import { fmt, rarityColors } from '../utils/format'
import { PITCH_TYPE_OPTIONS, pitchTypeInfo, pitchArsenalStats } from '../utils/pitches'

// ── Default filter state ─────────────────────────────────────────
const DEFAULT_FILTERS = {
  // General
  rarity: '', position: '', minOvr: '', maxOvr: '',
  batHand: '', throwHand: '',
  // Hitting
  minContactR: '', minContactL: '',
  minPowerR:   '', minPowerL:   '',
  minVision: '', minDiscipline: '', minBattingClutch: '',
  minSpeed: '',
  // Pitching
  minKper9: '', maxBBper9: '', maxHper9: '', maxHRper9: '',
  minVelocity: '', minControl: '', minMovement: '',
  minStamina: '', minPitchingClutch: '',
  // Fielding
  minFielding: '', minArmStrength: '', minReaction: '',
  // Arsenal (pitcher-specific)
  pitchType: '', minPitchCount: '', minSpeedRange: '',
}

// ── Quick presets ────────────────────────────────────────────────
const PRESETS = [
  {
    label: '💪 Power Hitters',
    filters: { ...DEFAULT_FILTERS, minPowerR: '90', minPowerL: '80' },
  },
  {
    label: '👁 Contact Kings',
    filters: { ...DEFAULT_FILTERS, minContactR: '95', minContactL: '90', minVision: '80' },
  },
  {
    label: '🔥 Flamethrowers',
    filters: { ...DEFAULT_FILTERS, minVelocity: '95', minKper9: '80' },
  },
  {
    label: '⚡ Speedsters',
    filters: { ...DEFAULT_FILTERS, minSpeed: '85' },
  },
  {
    label: '💛 Gold Gems',
    filters: { ...DEFAULT_FILTERS, rarity: 'Gold', minContactR: '90' },
  },
  {
    label: '🎯 Cutter Specialists',
    filters: { ...DEFAULT_FILTERS, pitchType: 'cutter', minPitchCount: '4' },
  },
  {
    label: '🌀 Deep Arsenals',
    filters: { ...DEFAULT_FILTERS, minPitchCount: '5', minSpeedRange: '15' },
  },
  {
    label: '💥 Big Tunnelers',
    filters: { ...DEFAULT_FILTERS, minSpeedRange: '20' },
  },
]

// ── Attribute column definitions ─────────────────────────────────
// Maps filter key → { label, attrKey }
const ATTR_COLS = {
  minContactR:       { label: 'CON R',  attrKey: 'contact_right'         },
  minContactL:       { label: 'CON L',  attrKey: 'contact_left'          },
  minPowerR:         { label: 'PWR R',  attrKey: 'power_right'           },
  minPowerL:         { label: 'PWR L',  attrKey: 'power_left'            },
  minVision:         { label: 'VIS',    attrKey: 'plate_vision'          },
  minDiscipline:     { label: 'DISC',   attrKey: 'plate_discipline'      },
  minBattingClutch:  { label: 'BCLCH',  attrKey: 'batting_clutch'        },
  minSpeed:          { label: 'SPD',    attrKey: 'speed'                 },
  minKper9:          { label: 'K/9',    attrKey: 'k_per_bf'             },
  maxBBper9:         { label: 'BB/9',   attrKey: 'bb_per_bf'            },
  maxHper9:          { label: 'H/9',    attrKey: 'hits_per_bf'          },
  maxHRper9:         { label: 'HR/9',   attrKey: 'hr_per_bf'            },
  minVelocity:       { label: 'VEL',    attrKey: 'pitch_velocity'        },
  minControl:        { label: 'CTRL',   attrKey: 'pitch_control'         },
  minMovement:       { label: 'MOV',    attrKey: 'pitch_movement'        },
  minStamina:        { label: 'STA',    attrKey: 'stamina'               },
  minPitchingClutch: { label: 'PCLCH',  attrKey: 'pitching_clutch'      },
  minFielding:       { label: 'FLD',    attrKey: 'fielding_ability'      },
  minArmStrength:    { label: 'ARM',    attrKey: 'arm_strength'          },
  minReaction:       { label: 'REA',    attrKey: 'reaction_time'         },
}

function attrColor(v) {
  if (v == null) return '#3a5a7a'
  if (v >= 80)   return '#4ade80'
  if (v >= 60)   return '#fbbf24'
  if (v >= 40)   return '#fb923c'
  return '#f87171'
}

// ── Sub-components ───────────────────────────────────────────────

function AttrInput({ label, filterKey, value, onChange, isMax }) {
  return (
    <div className="cf-attr-field">
      <label className="cf-field-label">{isMax ? '≤ ' : '≥ '}{label}</label>
      <input
        type="number"
        className="cf-num-input"
        placeholder="—"
        value={value}
        min={0}
        max={99}
        onChange={e => onChange(filterKey, e.target.value)}
      />
    </div>
  )
}

function FilterSection({ title, children, badge }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="cf-filter-section">
      <button className="cf-section-toggle" onClick={() => setOpen(o => !o)}>
        <span>{open ? '▾' : '▸'} {title}</span>
        {badge > 0 && <span className="cf-section-badge">{badge}</span>}
      </button>
      {open && <div className="cf-section-body">{children}</div>}
    </div>
  )
}

function ProgressBar({ done, total }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="cf-progress-wrap">
      <div className="cf-progress-bar-outer">
        <div className="cf-progress-bar-inner" style={{ width: `${pct}%` }} />
      </div>
      <span className="cf-progress-label">
        Loading attributes… {done.toLocaleString()} / {total.toLocaleString()} cards ({pct}%)
      </span>
    </div>
  )
}

function ResultRow({ row, activeCols, showArsenalCol, rank }) {
  const { item, attrs, listing } = row
  const r       = rarityColors(item.rarity)
  const imgSrc  = item.baked_img || item.img || ''
  const ovr     = typeof item.ovr === 'number' ? item.ovr : parseInt(item.ovr, 10)

  // Arsenal summary for this card
  const pitches  = attrs?.pitches || []
  const arsenal  = pitches.length ? pitchArsenalStats(pitches) : null

  return (
    <tr className="cf-row">
      <td className="cf-td cf-td--rank">{rank}</td>
      <td className="cf-td" style={{ textAlign: 'left', minWidth: 220 }}>
        <div className="card-cell">
          {imgSrc && (
            <img className="card-img" src={imgSrc} alt=""
                 onError={e => { e.currentTarget.style.display = 'none' }} />
          )}
          <div>
            <div className="card-name" style={{ color: '#e8eef5' }}>
              {item.listing_name || item.name || '—'}
            </div>
            <div className="card-meta">
              <span className="rarity-badge" style={{ background: r.badge, color: r.text }}>
                {(item.rarity || '').toUpperCase()}
              </span>
              {item.team && <span className="team-name">{item.team}</span>}
              {item.series && <span className="series-name">{item.series}</span>}
            </div>
          </div>
        </div>
      </td>
      <td className="cf-td mono" style={{ fontWeight: 700, color: r.glow, fontSize: 16 }}>
        {isNaN(ovr) ? '—' : ovr}
      </td>
      <td className="cf-td" style={{ color: '#aab' }}>{item.display_position || '—'}</td>

      {/* Active attribute columns */}
      {activeCols.map(({ filterKey, attrKey }) => {
        const v = attrs?.[attrKey] ?? null
        return (
          <td key={filterKey} className="cf-td cf-attr-td">
            {v != null ? (
              <div className="cf-attr-cell">
                <span style={{ color: attrColor(v), fontWeight: 700 }}>{v}</span>
                <div className="cf-mini-bar-outer">
                  <div className="cf-mini-bar-inner"
                       style={{ width: `${Math.min(100, (v / 99) * 100)}%`, background: attrColor(v) }} />
                </div>
              </div>
            ) : <span className="muted">—</span>}
          </td>
        )
      })}

      {/* Arsenal column */}
      {showArsenalCol && (
        <td className="cf-td cf-arsenal-td">
          {arsenal ? (
            <div className="cf-arsenal-cell">
              <div className="cf-arsenal-line">
                <span className="cf-arsenal-count">{arsenal.count}P</span>
                {arsenal.speedRange > 0 && (
                  <span className="cf-arsenal-range"
                        style={{ color: arsenal.speedRange >= 15 ? '#4ade80' : '#fbbf24' }}>
                    ⚡{arsenal.speedRange}mph
                  </span>
                )}
              </div>
              {/* Pitch type dots */}
              <div className="cf-arsenal-dots">
                {pitches.slice(0, 6).map((p, pi) => {
                  const { color } = pitchTypeInfo(p.name)
                  return (
                    <span key={pi} className="cf-pitch-dot" title={`${p.name} ${p.speed ?? ''}mph`}
                          style={{ background: color }} />
                  )
                })}
              </div>
            </div>
          ) : <span className="muted">—</span>}
        </td>
      )}

      {/* Market prices */}
      <td className="cf-td mono buy-color" style={{ fontWeight: 600 }}>
        {listing ? fmt(listing.best_buy_price) : <span className="muted">—</span>}
      </td>
      <td className="cf-td mono sell-color" style={{ fontWeight: 600 }}>
        {listing ? fmt(listing.best_sell_price) : <span className="muted">—</span>}
      </td>
    </tr>
  )
}

// ── Main Component ───────────────────────────────────────────────

export default function CardFinder({ allListings }) {
  const [filters,     setFilters]     = useState(DEFAULT_FILTERS)
  const [showResults, setShowResults] = useState(false)

  const {
    search, cancel, isSearching,
    catalogStatus, fetchProgress,
    results, tooManyCandidates, error,
  } = useCardFinder()

  // Build O(1) listing lookup map from allListings
  const listingMap = useMemo(() => {
    const m = new Map()
    if (!allListings?.length) return m
    allListings.forEach(l => {
      const uuid = l.uuid || l.item?.uuid
      if (uuid) m.set(uuid, l)
    })
    return m
  }, [allListings])

  const setF = useCallback((key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }))
  }, [])

  function handleSearch() {
    setShowResults(true)
    search(filters, listingMap)
  }

  function handlePreset(preset) {
    setFilters(preset.filters)
    setShowResults(true)
    search(preset.filters, listingMap)
  }

  function handleClear() {
    setFilters(DEFAULT_FILTERS)
    setShowResults(false)
  }

  // Which attribute columns to show based on active filters
  const activeCols = useMemo(() =>
    Object.entries(ATTR_COLS)
      .filter(([fk]) => filters[fk] !== '' && filters[fk] != null)
      .map(([filterKey, def]) => ({ filterKey, ...def })),
    [filters]
  )

  // Count active filters per section for badges
  const hitCount      = ['minContactR','minContactL','minPowerR','minPowerL','minVision','minDiscipline','minBattingClutch','minSpeed'].filter(k => filters[k] !== '').length
  const pitchCount    = ['minKper9','maxBBper9','maxHper9','maxHRper9','minVelocity','minControl','minMovement','minStamina','minPitchingClutch'].filter(k => filters[k] !== '').length
  const fldCount      = ['minFielding','minArmStrength','minReaction'].filter(k => filters[k] !== '').length
  const arsenalCount  = ['pitchType','minPitchCount','minSpeedRange'].filter(k => filters[k] !== '' && filters[k] != null).length

  // Whether to show the arsenal summary column
  const showArsenalCol = arsenalCount > 0

  const needsAttrFetch = hasAttrFilters(filters)

  return (
    <div className="cf-wrap">

      {/* ── Quick Presets ── */}
      <div className="cf-presets">
        <span className="cf-presets-label">Quick Presets</span>
        {PRESETS.map(p => (
          <button key={p.label} className="cf-preset-btn" onClick={() => handlePreset(p)}>
            {p.label}
          </button>
        ))}
        <button className="cf-preset-btn cf-preset-btn--clear" onClick={handleClear}>
          ✕ Clear
        </button>
      </div>

      <div className="cf-layout">

        {/* ── Filter sidebar ── */}
        <div className="cf-sidebar">

          {/* General */}
          <FilterSection title="General" badge={['rarity','position','minOvr','maxOvr','batHand','throwHand'].filter(k => filters[k] !== '').length}>
            <div className="cf-field-row">
              <div className="cf-field">
                <label className="cf-field-label">Rarity</label>
                <select className="cf-select" value={filters.rarity} onChange={e => setF('rarity', e.target.value)}>
                  <option value="">All</option>
                  {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="cf-field">
                <label className="cf-field-label">Position</label>
                <select className="cf-select" value={filters.position} onChange={e => setF('position', e.target.value)}>
                  <option value="">All</option>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="cf-field-row">
              <div className="cf-field">
                <label className="cf-field-label">Min OVR</label>
                <input type="number" className="cf-num-input" placeholder="e.g. 85"
                       value={filters.minOvr} min={1} max={99}
                       onChange={e => setF('minOvr', e.target.value)} />
              </div>
              <div className="cf-field">
                <label className="cf-field-label">Max OVR</label>
                <input type="number" className="cf-num-input" placeholder="e.g. 99"
                       value={filters.maxOvr} min={1} max={99}
                       onChange={e => setF('maxOvr', e.target.value)} />
              </div>
            </div>

            <div className="cf-field-row">
              <div className="cf-field">
                <label className="cf-field-label">Bats</label>
                <select className="cf-select" value={filters.batHand} onChange={e => setF('batHand', e.target.value)}>
                  <option value="">Any</option>
                  <option value="L">Left</option>
                  <option value="R">Right</option>
                  <option value="S">Switch</option>
                </select>
              </div>
              <div className="cf-field">
                <label className="cf-field-label">Throws</label>
                <select className="cf-select" value={filters.throwHand} onChange={e => setF('throwHand', e.target.value)}>
                  <option value="">Any</option>
                  <option value="L">Left</option>
                  <option value="R">Right</option>
                </select>
              </div>
            </div>
          </FilterSection>

          {/* Hitting */}
          <FilterSection title="🏏 Hitting" badge={hitCount}>
            <div className="cf-attr-grid">
              <AttrInput label="Contact R" filterKey="minContactR" value={filters.minContactR} onChange={setF} />
              <AttrInput label="Contact L" filterKey="minContactL" value={filters.minContactL} onChange={setF} />
              <AttrInput label="Power R"   filterKey="minPowerR"   value={filters.minPowerR}   onChange={setF} />
              <AttrInput label="Power L"   filterKey="minPowerL"   value={filters.minPowerL}   onChange={setF} />
              <AttrInput label="Vision"    filterKey="minVision"   value={filters.minVision}   onChange={setF} />
              <AttrInput label="Discipline"filterKey="minDiscipline" value={filters.minDiscipline} onChange={setF} />
              <AttrInput label="Clutch"    filterKey="minBattingClutch" value={filters.minBattingClutch} onChange={setF} />
              <AttrInput label="Speed"     filterKey="minSpeed"    value={filters.minSpeed}    onChange={setF} />
            </div>
          </FilterSection>

          {/* Pitching */}
          <FilterSection title="⚾ Pitching" badge={pitchCount}>
            <div className="cf-attr-grid">
              <AttrInput label="Velocity" filterKey="minVelocity"  value={filters.minVelocity} onChange={setF} />
              <AttrInput label="Control"  filterKey="minControl"   value={filters.minControl}  onChange={setF} />
              <AttrInput label="Movement" filterKey="minMovement"  value={filters.minMovement} onChange={setF} />
              <AttrInput label="Stamina"  filterKey="minStamina"   value={filters.minStamina}  onChange={setF} />
              <AttrInput label="K/9"      filterKey="minKper9"     value={filters.minKper9}    onChange={setF} />
              <AttrInput label="BB/9"     filterKey="maxBBper9"    value={filters.maxBBper9}   onChange={setF} isMax />
              <AttrInput label="H/9"      filterKey="maxHper9"     value={filters.maxHper9}    onChange={setF} isMax />
              <AttrInput label="HR/9"     filterKey="maxHRper9"    value={filters.maxHRper9}   onChange={setF} isMax />
              <AttrInput label="Clutch"   filterKey="minPitchingClutch" value={filters.minPitchingClutch} onChange={setF} />
            </div>
          </FilterSection>

          {/* Fielding */}
          <FilterSection title="🧤 Fielding" badge={fldCount}>
            <div className="cf-attr-grid">
              <AttrInput label="Fielding"     filterKey="minFielding"    value={filters.minFielding}    onChange={setF} />
              <AttrInput label="Arm Strength" filterKey="minArmStrength" value={filters.minArmStrength} onChange={setF} />
              <AttrInput label="Reaction"     filterKey="minReaction"    value={filters.minReaction}    onChange={setF} />
            </div>
          </FilterSection>

          {/* Arsenal */}
          <FilterSection title="🎯 Pitch Arsenal" badge={arsenalCount}>
            <div className="cf-field" style={{ marginBottom: 8 }}>
              <label className="cf-field-label">Must have pitch type</label>
              <select className="cf-select" value={filters.pitchType}
                      onChange={e => setF('pitchType', e.target.value)}>
                {PITCH_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="cf-field-row">
              <div className="cf-attr-field">
                <label className="cf-field-label">≥ Pitch count</label>
                <input type="number" className="cf-num-input" placeholder="e.g. 5"
                       value={filters.minPitchCount} min={1} max={10}
                       onChange={e => setF('minPitchCount', e.target.value)} />
              </div>
              <div className="cf-attr-field">
                <label className="cf-field-label">≥ Speed range (MPH)</label>
                <input type="number" className="cf-num-input" placeholder="e.g. 20"
                       value={filters.minSpeedRange} min={0} max={40}
                       onChange={e => setF('minSpeedRange', e.target.value)} />
              </div>
            </div>
            <p className="cf-attr-note" style={{ marginTop: 6 }}>
              Speed range = fastest − slowest pitch. Larger = better tunneling.
            </p>
          </FilterSection>

          {/* Search / Cancel */}
          <div className="cf-search-bar">
            {isSearching ? (
              <button className="cf-cancel-btn" onClick={cancel}>⬛ Cancel</button>
            ) : (
              <button className="cf-search-btn" onClick={handleSearch}>
                🔍 Search
              </button>
            )}
            {needsAttrFetch && !isSearching && (
              <p className="cf-attr-note">
                Attribute filters require fetching individual card data — may take a moment.
              </p>
            )}
          </div>
        </div>

        {/* ── Results area ── */}
        <div className="cf-results">

          {/* Catalog loading progress */}
          {catalogStatus.loading && (
            <div className="cf-status-banner">
              <span className="auto-scan-dots"><span/><span/><span/></span>
              <span>
                Building card catalog…{' '}
                <strong>{catalogStatus.progress.page}</strong>
                {catalogStatus.progress.total > 0 && <> / {catalogStatus.progress.total} pages</>}
              </span>
            </div>
          )}

          {/* Attribute fetch progress */}
          {isSearching && fetchProgress.total > 0 && (
            <ProgressBar done={fetchProgress.done} total={fetchProgress.total} />
          )}

          {/* Error */}
          {error && (
            <div className="gh-error"><span>⚠</span><span>{error}</span></div>
          )}

          {/* Too many candidates warning */}
          {tooManyCandidates && !isSearching && (
            <div className="cf-warning">
              ⚠ More than {(300).toLocaleString()} cards matched your basic filters.
              Showing attributes for the first 300 — add more filters to narrow results.
            </div>
          )}

          {/* Results table */}
          {showResults && !isSearching && results.length > 0 && (
            <>
              <div className="cf-results-header">
                <span className="cf-results-count">
                  <strong>{results.length.toLocaleString()}</strong> card{results.length !== 1 ? 's' : ''} found
                </span>
                {listingMap.size === 0 && (
                  <span className="cf-market-note">Market prices load once the Market tab finishes scanning</span>
                )}
              </div>

              <div className="cf-table-wrap">
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th className="cf-th">#</th>
                      <th className="cf-th" style={{ textAlign: 'left', minWidth: 220 }}>Card</th>
                      <th className="cf-th">OVR</th>
                      <th className="cf-th">POS</th>
                      {activeCols.map(c => (
                        <th key={c.filterKey} className="cf-th cf-attr-th">{c.label}</th>
                      ))}
                      {showArsenalCol && <th className="cf-th cf-attr-th">ARSENAL</th>}
                      <th className="cf-th">BUY</th>
                      <th className="cf-th">SELL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 250).map((row, i) => (
                      <ResultRow
                        key={row.item.uuid || i}
                        row={row}
                        activeCols={activeCols}
                        showArsenalCol={showArsenalCol}
                        rank={i + 1}
                      />
                    ))}
                  </tbody>
                </table>
                {results.length > 250 && (
                  <div className="cf-table-overflow">
                    Showing first 250 of {results.length.toLocaleString()} results — refine your filters to see more specific cards.
                  </div>
                )}
              </div>
            </>
          )}

          {/* Empty state */}
          {showResults && !isSearching && !error && results.length === 0 && (
            <div className="gh-empty">
              <div className="gh-empty-icon">🔍</div>
              <div className="gh-empty-title">No cards found</div>
              <div className="gh-empty-sub">Try relaxing your attribute thresholds or changing the rarity / position filter.</div>
            </div>
          )}

          {/* Idle state */}
          {!showResults && !isSearching && (
            <div className="gh-idle">
              <div className="gh-idle-icon">🃏</div>
              <div className="gh-idle-title">Card Attribute Finder</div>
              <div className="gh-idle-sub">
                Set attribute minimums in the filter panel, choose a quick preset, or hit <strong>Search</strong> to find cards matching your criteria.
                Market buy/sell prices are cross-referenced automatically once the Market tab has finished loading.
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
