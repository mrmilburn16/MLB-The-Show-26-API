import { useEffect } from 'react'
import { RARITY_COLORS } from '../constants'
import { fmt, fmtProfit, profitClass } from '../utils/format'
import { pitchTypeInfo, pitchArsenalStats } from '../utils/pitches'

// ── Helpers ─────────────────────────────────────────────────────
const BAR_MAX = 125  // scale for attribute bars (99 fills ~79%)

function attrColor(v) {
  if (v == null) return '#3a5a7a'
  if (v >= 80)   return '#4ade80'
  if (v >= 60)   return '#fbbf24'
  if (v >= 40)   return '#fb923c'
  return '#f87171'
}

function fmtProfMin(n) {
  if (n == null || n === 0) return '—'
  return `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString()}`
}

function fmtSalesMin(n) {
  if (n == null) return '—'
  return n < 0.01 ? '<0.01' : n.toFixed(2)
}

/** Find the index of the best (max) value in an array, ignoring nulls */
function bestIdx(vals) {
  let best = null, bestI = -1
  vals.forEach((v, i) => {
    if (v != null && (best === null || v > best)) { best = v; bestI = i }
  })
  return bestI
}

// ── Sub-components ───────────────────────────────────────────────

function MiniBar({ value, maxVal = BAR_MAX }) {
  if (value == null) return null
  const pct   = Math.min(100, (value / maxVal) * 100)
  const color = attrColor(value)
  return (
    <div className="cmp-bar-outer">
      <div className="cmp-bar-inner" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function AttrCell({ value, isBest, showBar = true }) {
  if (value == null) return <td className="cmp-td cmp-td--null">—</td>
  const color = attrColor(value)
  return (
    <td className={`cmp-td ${isBest ? 'cmp-td--best' : ''}`}>
      <div className="cmp-attr-cell">
        <span className="cmp-attr-num" style={{ color }}>{value}</span>
        {showBar && <MiniBar value={value} />}
      </div>
    </td>
  )
}

function MarketCell({ value, children, isBest, cls }) {
  return (
    <td className={`cmp-td ${isBest ? 'cmp-td--best' : ''} mono ${cls || ''}`}>
      {children ?? (value != null ? value : '—')}
    </td>
  )
}

function SectionRow({ label, colCount }) {
  return (
    <tr className="cmp-section-row">
      <td colSpan={colCount + 1} className="cmp-section-label">{label}</td>
    </tr>
  )
}

function AttrRow({ label, values }) {
  const bi = bestIdx(values)
  return (
    <tr className="cmp-attr-row">
      <td className="cmp-td cmp-td--label">{label}</td>
      {values.map((v, i) => <AttrCell key={i} value={v} isBest={i === bi && v != null} />)}
    </tr>
  )
}

// ── Card Header ──────────────────────────────────────────────────

function CardHeader({ uuid, listing, itemData }) {
  const item    = itemData || listing.item || {}
  const rarity  = item.rarity || listing.item?.rarity || 'Common'
  const colors  = RARITY_COLORS[rarity] || RARITY_COLORS.Common
  const imgSrc  = item.baked_img || item.img || listing.item?.baked_img || listing.item?.img || ''
  const name    = listing.listing_name || item.name || uuid
  const pos     = item.display_position || listing.item?.display_position || ''
  const ovr     = item.ovr ?? listing.item?.ovr
  const team    = item.team || listing.item?.team || ''

  return (
    <th className="cmp-card-header" style={{ '--rarity-glow': colors.glow }}>
      {imgSrc && (
        <img src={imgSrc} alt="" className="cmp-card-img"
             style={{ boxShadow: `0 0 16px ${colors.glow}44` }}
             onError={e => { e.currentTarget.style.display = 'none' }} />
      )}
      <div className="cmp-card-name">{name}</div>
      <div className="cmp-card-meta">
        <span className="rarity-badge" style={{ background: colors.badge, color: colors.text }}>
          {rarity}
        </span>
        {pos  && <span className="cmp-card-pos">{pos}</span>}
        {ovr  && <span className="cmp-card-ovr" style={{ color: colors.glow }}>OVR {ovr}</span>}
        {team && <span className="cmp-card-team">{team}</span>}
      </div>
    </th>
  )
}

// ── Main Modal ───────────────────────────────────────────────────

export default function ComparisonModal({
  tray,
  isOpen,
  onClose,
  itemMap,
  requestItem,
  velocityMap,
}) {
  const n = tray.length

  // Fetch item data for all tray cards when modal opens
  useEffect(() => {
    if (!isOpen) return
    tray.forEach(({ uuid }) => {
      if (!itemMap[uuid]) requestItem(uuid)
    })
  }, [isOpen, tray, itemMap, requestItem])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Lock body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen || n < 2) return null

  const colCount = n

  // Build per-card data
  const cards = tray.map(({ uuid, listing }) => {
    const item     = itemMap[uuid] || listing.item || {}
    const vel      = velocityMap?.[uuid]
    const pos      = (item.display_position || listing.item?.display_position || '').toUpperCase()
    const isPitch  = ['SP', 'RP', 'CP'].includes(pos) || (item.stamina > 0)
    const isHitter = item.is_hitter ?? !isPitch
    return { uuid, listing, item, vel, isPitch, isHitter }
  })

  const anyHitter  = cards.some(c => c.isHitter)
  const anyPitcher = cards.some(c => c.isPitch)

  // Determine whether an attribute section has any data at all
  const hasBattingData  = anyHitter && cards.some(c => c.item.contact_left > 0 || c.item.contact_right > 0)
  const hasPitchingData = anyPitcher && cards.some(c => c.item.stamina > 0 || c.item.pitch_velocity > 0)
  const hasFieldingData = cards.some(c => c.item.fielding_ability > 0 || c.item.speed > 0)

  // Pitch arsenal union — collect all unique pitch names
  const allPitchNames = [...new Set(
    cards.flatMap(c => (c.item.pitches || []).map(p => p.name)).filter(Boolean)
  )]

  // Quirks — collect all quirk names with counts
  const quirkCounts = {}
  cards.forEach(c => {
    ;(c.item.quirks || []).forEach(q => {
      quirkCounts[q.name] = (quirkCounts[q.name] || 0) + 1
    })
  })

  function getV(c, key) { return c.item[key] ?? null }
  function getVels(key)  { return cards.map(c => c.vel?.[key] ?? null) }
  function getAttrs(key) { return cards.map(c => getV(c, key)) }

  return (
    <div className="cmp-overlay" onClick={onClose}>
      <div className="cmp-modal" onClick={e => e.stopPropagation()}>

        {/* ── Modal header ── */}
        <div className="cmp-modal-header">
          <span className="cmp-modal-title">
            ⚡ Comparing {n} Cards
          </span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="cmp-modal-body">
          <div className="cmp-table-wrap">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th className="cmp-td cmp-td--label cmp-label-header">Attribute</th>
                  {cards.map(({ uuid, listing, item }) => (
                    <CardHeader key={uuid} uuid={uuid} listing={listing} itemData={item} />
                  ))}
                </tr>
              </thead>

              <tbody>

                {/* ── Market Data ── */}
                <SectionRow label="💰 Market Data" colCount={colCount} />

                <tr className="cmp-attr-row">
                  <td className="cmp-td cmp-td--label">Buy Price</td>
                  {cards.map(({ uuid, listing }) => {
                    const vals = cards.map(c => c.listing.best_buy_price)
                    const bi   = bestIdx(vals.map(v => v ? -v : null)) // lower = better buy
                    return (
                      <MarketCell key={uuid} cls="buy-color"
                                  isBest={cards.findIndex(c => c.uuid === uuid) === bi}>
                        {fmt(listing.best_buy_price)}
                      </MarketCell>
                    )
                  })}
                </tr>

                <tr className="cmp-attr-row">
                  <td className="cmp-td cmp-td--label">Sell Price</td>
                  {cards.map(({ uuid, listing }) => {
                    const vals = cards.map(c => c.listing.best_sell_price)
                    const bi   = bestIdx(vals)
                    return (
                      <MarketCell key={uuid} cls="sell-color"
                                  isBest={cards.findIndex(c => c.uuid === uuid) === bi}>
                        {fmt(listing.best_sell_price)}
                      </MarketCell>
                    )
                  })}
                </tr>

                <tr className="cmp-attr-row">
                  <td className="cmp-td cmp-td--label">Profit After Tax</td>
                  {cards.map(({ uuid, listing }) => {
                    const vals = cards.map(c => c.listing._profitAfterTax)
                    const bi   = bestIdx(vals)
                    const pc   = profitClass(listing._profitAfterTax)
                    return (
                      <MarketCell key={uuid} cls={pc}
                                  isBest={cards.findIndex(c => c.uuid === uuid) === bi}>
                        {fmtProfit(listing._profitAfterTax)}
                      </MarketCell>
                    )
                  })}
                </tr>

                <tr className="cmp-attr-row">
                  <td className="cmp-td cmp-td--label">Profit / Min</td>
                  {(() => {
                    const vals = getVels('profitPerMin')
                    const bi   = bestIdx(vals)
                    return cards.map(({ uuid }, i) => (
                      <MarketCell key={uuid} isBest={i === bi}>
                        {fmtProfMin(vals[i])}
                      </MarketCell>
                    ))
                  })()}
                </tr>

                <tr className="cmp-attr-row">
                  <td className="cmp-td cmp-td--label">Sales / Min</td>
                  {(() => {
                    const vals = getVels('salesPerMin')
                    const bi   = bestIdx(vals)
                    return cards.map(({ uuid }, i) => (
                      <MarketCell key={uuid} isBest={i === bi}>
                        {fmtSalesMin(vals[i])}
                      </MarketCell>
                    ))
                  })()}
                </tr>

                {/* ── Batting ── */}
                {hasBattingData && (
                  <>
                    <SectionRow label="🏏 Batting" colCount={colCount} />
                    {[
                      ['Contact vs L',  'contact_left'],
                      ['Contact vs R',  'contact_right'],
                      ['Power vs L',    'power_left'],
                      ['Power vs R',    'power_right'],
                      ['Vision',        'plate_vision'],
                      ['Discipline',    'plate_discipline'],
                      ['Clutch',        'batting_clutch'],
                    ].map(([label, key]) => (
                      <AttrRow key={key} label={label} values={getAttrs(key)} />
                    ))}
                  </>
                )}

                {/* ── Pitching ── */}
                {hasPitchingData && (
                  <>
                    <SectionRow label="⚾ Pitching" colCount={colCount} />
                    {[
                      ['Stamina',   'stamina'],
                      ['Velocity',  'pitch_velocity'],
                      ['Control',   'pitch_control'],
                      ['Movement',  'pitch_movement'],
                      ['H/9',       'hits_per_bf'],
                      ['K/9',       'k_per_bf'],
                      ['BB/9',      'bb_per_bf'],
                      ['HR/9',      'hr_per_bf'],
                      ['Clutch',    'pitching_clutch'],
                    ].map(([label, key]) => (
                      <AttrRow key={key} label={label} values={getAttrs(key)} />
                    ))}
                  </>
                )}

                {/* ── Fielding ── */}
                {hasFieldingData && (
                  <>
                    <SectionRow label="🧤 Fielding" colCount={colCount} />
                    {[
                      ['Fielding',     'fielding_ability'],
                      ['Arm Strength', 'arm_strength'],
                      ['Arm Accuracy', 'arm_accuracy'],
                      ['Reaction',     'reaction_time'],
                      ['Speed',        'speed'],
                      ['Baserunning',  'baserunning_ability'],
                      ['Aggression',   'baserunning_aggressive'],
                    ].map(([label, key]) => (
                      <AttrRow key={key} label={label} values={getAttrs(key)} />
                    ))}
                  </>
                )}

                {/* ── Pitch Arsenal ── */}
                {allPitchNames.length > 0 && (
                  <>
                    <SectionRow label="🎯 Pitch Arsenal" colCount={colCount} />
                    {allPitchNames.map(pitchName => {
                      const { color: typeColor } = pitchTypeInfo(pitchName)
                      const pitches    = cards.map(c =>
                        (c.item.pitches || []).find(p => p.name === pitchName) ?? null
                      )
                      const speedVals  = pitches.map(p => p?.speed   ?? null)
                      const ctrlVals   = pitches.map(p => p?.control  ?? null)
                      const movVals    = pitches.map(p => p?.movement ?? null)
                      const bestSpeed  = bestIdx(speedVals)
                      const bestCtrl   = bestIdx(ctrlVals)
                      const bestMov    = bestIdx(movVals)

                      return (
                        <tr key={pitchName} className="cmp-attr-row">
                          <td className="cmp-td cmp-td--label cmp-pitch-label"
                              style={{ borderLeft: `3px solid ${typeColor}` }}>
                            {pitchName}
                          </td>
                          {pitches.map((p, i) => (
                            <td key={i} className="cmp-td">
                              {p ? (
                                <div className="cmp-pitch-cell">
                                  <span className={`cmp-pitch-stat ${i === bestSpeed ? 'cmp-best-text' : ''}`}
                                        style={{ color: i === bestSpeed ? '#4ade80' : typeColor }}>
                                    <span className="cmp-pitch-key">SPD</span> {p.speed ?? '—'}
                                  </span>
                                  <div className="cmp-pitch-bars">
                                    <div className="cmp-pitch-bar-row">
                                      <span className={`cmp-pitch-key ${i === bestCtrl ? 'cmp-best-text' : ''}`}>CTRL</span>
                                      <span style={{ color: attrColor(p.control) }}>{p.control ?? '—'}</span>
                                      {p.control != null && <MiniBar value={p.control} />}
                                    </div>
                                    <div className="cmp-pitch-bar-row">
                                      <span className={`cmp-pitch-key ${i === bestMov ? 'cmp-best-text' : ''}`}>MOV</span>
                                      <span style={{ color: attrColor(p.movement) }}>{p.movement ?? '—'}</span>
                                      {p.movement != null && <MiniBar value={p.movement} />}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <span className="cmp-no-pitch">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      )
                    })}

                    {/* Speed Range row — shows each pitcher's speed differential */}
                    <tr className="cmp-attr-row">
                      <td className="cmp-td cmp-td--label cmp-pitch-label"
                          title="Fastest − slowest pitch speed. Larger = harder to time.">
                        ⚡ Speed Range
                      </td>
                      {cards.map(({ uuid, item }) => {
                        const s = pitchArsenalStats(item.pitches)
                        const vals = cards.map(c => pitchArsenalStats(c.item.pitches)?.speedRange ?? null)
                        const bi   = bestIdx(vals)
                        const i    = cards.findIndex(c => c.uuid === uuid)
                        const range = s?.speedRange ?? null
                        return (
                          <td key={uuid} className={`cmp-td ${i === bi && range != null ? 'cmp-td--best' : ''}`}>
                            {range != null && range > 0 ? (
                              <span style={{ color: range >= 15 ? '#4ade80' : '#fbbf24', fontWeight: 700,
                                             fontFamily: "'Space Mono', monospace", fontSize: 13 }}>
                                {range} MPH
                              </span>
                            ) : (
                              <span className="cmp-no-pitch">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  </>
                )}

                {/* ── Quirks ── */}
                {cards.some(c => c.item.quirks?.length > 0) && (
                  <>
                    <SectionRow label="✨ Quirks" colCount={colCount} />
                    <tr className="cmp-attr-row cmp-quirks-row">
                      <td className="cmp-td cmp-td--label">Quirks</td>
                      {cards.map(({ uuid, item }) => (
                        <td key={uuid} className="cmp-td">
                          <div className="cmp-quirks-list">
                            {(item.quirks || []).length === 0
                              ? <span className="cmp-no-pitch">None</span>
                              : (item.quirks || []).map((q, qi) => {
                                  const isShared = quirkCounts[q.name] > 1
                                  return (
                                    <div key={qi}
                                         className={`cmp-quirk-chip ${isShared ? 'cmp-quirk-chip--shared' : ''}`}
                                         title={q.description || ''}>
                                      {q.img && (
                                        <img src={q.img} alt="" className="cmp-quirk-icon"
                                             onError={e => { e.currentTarget.style.display = 'none' }} />
                                      )}
                                      <span>{q.name}</span>
                                      {isShared && <span className="cmp-shared-badge">Shared</span>}
                                    </div>
                                  )
                                })
                            }
                          </div>
                        </td>
                      ))}
                    </tr>
                  </>
                )}

              </tbody>
            </table>
          </div>

          {/* ── Legend ── */}
          <div className="cmp-legend">
            <span className="cmp-legend-item"><span className="cmp-legend-dot" style={{ background: '#4ade80' }} />80+ (Elite)</span>
            <span className="cmp-legend-item"><span className="cmp-legend-dot" style={{ background: '#fbbf24' }} />60–79 (Good)</span>
            <span className="cmp-legend-item"><span className="cmp-legend-dot" style={{ background: '#fb923c' }} />40–59 (Average)</span>
            <span className="cmp-legend-item"><span className="cmp-legend-dot" style={{ background: '#f87171' }} />&lt;40 (Poor)</span>
            <span className="cmp-legend-item cmp-legend-best">★ Green cell = best in category</span>
          </div>
        </div>
      </div>
    </div>
  )
}
