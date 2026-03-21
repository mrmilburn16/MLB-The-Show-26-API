import { useEffect } from 'react'
import { fmt, fmtProfit, profitClass } from '../utils/format'
import { parsePrice } from '../utils/snipe'
import { RARITY_COLORS } from '../constants'
import { pitchTypeInfo, pitchArsenalStats, speedBarPct } from '../utils/pitches'
import PriceChart from './PriceChart'

// ── Formatting helpers ───────────────────────────────────────────
function fmtRate(n)      { return n == null || n === 0 ? '—' : n < 0.01 ? '<0.01/min' : `${n.toFixed(2)}/min` }
function fmtProfitMin(n) { return n == null || n === 0 ? '—' : `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString()}/min` }
function fmtPct(n, decimals = 1) { return n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(decimals)}%` }

// ── Attribute colour based on value ─────────────────────────────
function attrColor(v) {
  if (v == null || v === 0) return '#3a5a7a'
  if (v >= 80) return '#4ade80'
  if (v >= 60) return '#fbbf24'
  return '#f87171'
}

// ── Sub-components ───────────────────────────────────────────────

function StatTile({ label, value, cls, style, skeleton }) {
  return (
    <div className="detail-stat">
      <div className="detail-stat-label">{label}</div>
      {skeleton
        ? <div className="vel-skeleton" />
        : <div className={`detail-stat-value mono ${cls || ''}`} style={style}>{value}</div>
      }
    </div>
  )
}

function SectionTitle({ children, count }) {
  return (
    <div className="hist-section-title">
      {children}
      {count != null && <span className="hist-section-count">{count}</span>}
    </div>
  )
}

/** Single attribute row: label | number | coloured bar */
function AttrRow({ label, value, maxVal = 99 }) {
  if (value == null || value === 0) return null
  const pct   = Math.min(100, Math.max(0, (value / maxVal) * 100))
  const color = attrColor(value)
  return (
    <div className="attr-row">
      <span className="attr-label">{label}</span>
      <span className="attr-val" style={{ color }}>{value}</span>
      <div className="attr-bar-outer">
        <div className="attr-bar-inner" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

/** Section of attribute rows with a heading */
function AttrGroup({ title, rows }) {
  const visible = rows.filter(r => r.value != null && r.value !== 0)
  if (!visible.length) return null
  return (
    <div className="attr-group">
      <div className="attr-group-title">{title}</div>
      {visible.map(r => (
        <AttrRow key={r.label} label={r.label} value={r.value} maxVal={r.maxVal} />
      ))}
    </div>
  )
}

/** Player bio chip */
function InfoChip({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div className="pinfo-chip">
      <span className="pinfo-label">{label}</span>
      <span className="pinfo-value">{value}</span>
    </div>
  )
}

/** Skeleton placeholder row */
function SkeletonBlock({ rows = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="vel-skeleton" style={{ height: 18, width: `${60 + (i % 3) * 15}%` }} />
      ))}
    </div>
  )
}

// ── Sections ─────────────────────────────────────────────────────

function PlayerInfoBar({ item, itemData }) {
  const src = itemData || item || {}
  const chips = [
    { label: 'Age',     value: src.age },
    { label: 'Height',  value: src.height },
    { label: 'Weight',  value: src.weight ? `${src.weight} lbs` : null },
    { label: 'Bats',    value: src.bat_hand },
    { label: 'Throws',  value: src.throw_hand },
    { label: 'Jersey',  value: src.jersey_number != null ? `#${src.jersey_number}` : null },
    { label: 'Series',  value: src.series || src.set_name },
  ]
  const visible = chips.filter(c => c.value != null && c.value !== '')
  if (!visible.length) return null
  return (
    <div className="pinfo-bar">
      {visible.map(c => <InfoChip key={c.label} {...c} />)}
    </div>
  )
}

function AttributesSection({ item, itemData, loading }) {
  if (loading) {
    return (
      <div className="hist-section">
        <SectionTitle>Player Attributes</SectionTitle>
        <SkeletonBlock rows={6} />
      </div>
    )
  }
  if (!itemData) return null

  const pos      = (itemData.display_position || item?.display_position || '').toUpperCase()
  const isPitcher = ['SP', 'RP', 'CP'].includes(pos) || (itemData.stamina > 0)
  const isHitter  = itemData.is_hitter ?? !isPitcher

  const battingRows = [
    { label: 'Contact vs L',    value: itemData.contact_left         },
    { label: 'Contact vs R',    value: itemData.contact_right        },
    { label: 'Power vs L',      value: itemData.power_left           },
    { label: 'Power vs R',      value: itemData.power_right          },
    { label: 'Vision',          value: itemData.plate_vision         },
    { label: 'Discipline',      value: itemData.plate_discipline     },
    { label: 'Clutch',          value: itemData.batting_clutch       },
  ]

  const pitchingRows = [
    { label: 'Stamina',         value: itemData.stamina              },
    { label: 'Velocity',        value: itemData.pitch_velocity       },
    { label: 'Control',         value: itemData.pitch_control        },
    { label: 'Movement',        value: itemData.pitch_movement       },
    { label: 'H/9',             value: itemData.hits_per_bf          },
    { label: 'K/9',             value: itemData.k_per_bf             },
    { label: 'BB/9',            value: itemData.bb_per_bf            },
    { label: 'HR/9',            value: itemData.hr_per_bf            },
    { label: 'Clutch',          value: itemData.pitching_clutch      },
  ]

  const fieldingRows = [
    { label: 'Fielding',        value: itemData.fielding_ability     },
    { label: 'Arm Strength',    value: itemData.arm_strength         },
    { label: 'Arm Accuracy',    value: itemData.arm_accuracy         },
    { label: 'Reaction',        value: itemData.reaction_time        },
    { label: 'Speed',           value: itemData.speed                },
    { label: 'Baserunning',     value: itemData.baserunning_ability  },
    { label: 'Aggression',      value: itemData.baserunning_aggressive},
  ]

  const hasBatting  = battingRows.some(r => r.value > 0)
  const hasPitching = pitchingRows.some(r => r.value > 0)
  const hasFielding = fieldingRows.some(r => r.value > 0)

  if (!hasBatting && !hasPitching && !hasFielding) return null

  return (
    <div className="hist-section">
      <SectionTitle>Player Attributes</SectionTitle>
      <div className="attr-columns">
        {isHitter && hasBatting && (
          <AttrGroup title="Batting" rows={battingRows} />
        )}
        {isPitcher && hasPitching && (
          <AttrGroup title="Pitching" rows={pitchingRows} />
        )}
        {hasFielding && (
          <AttrGroup title="Fielding" rows={fieldingRows} />
        )}
      </div>
    </div>
  )
}

function PitchArsenal({ itemData, loading }) {
  if (loading) return null
  const pitches = itemData?.pitches
  if (!pitches?.length) return null

  const stats          = pitchArsenalStats(pitches)
  const sortedBySpeed  = [...pitches].sort((a, b) => (b.speed ?? 0) - (a.speed ?? 0))

  return (
    <div className="hist-section">
      <SectionTitle count={pitches.length}>Pitch Arsenal</SectionTitle>

      {/* ── Summary stats strip ── */}
      <div className="arsenal-summary">
        <div className="arsenal-stat">
          <span className="arsenal-stat-label">PITCHES</span>
          <span className="arsenal-stat-val">{stats.count}</span>
        </div>
        {stats.fastest != null && (
          <div className="arsenal-stat">
            <span className="arsenal-stat-label">FASTEST</span>
            <span className="arsenal-stat-val" style={{ color: '#ef4444' }}>{stats.fastest} mph</span>
          </div>
        )}
        {stats.slowest != null && stats.slowest !== stats.fastest && (
          <div className="arsenal-stat">
            <span className="arsenal-stat-label">SLOWEST</span>
            <span className="arsenal-stat-val" style={{ color: '#34d399' }}>{stats.slowest} mph</span>
          </div>
        )}
        {stats.avgControl != null && (
          <div className="arsenal-stat">
            <span className="arsenal-stat-label">AVG CTRL</span>
            <span className="arsenal-stat-val" style={{ color: attrColor(stats.avgControl) }}>{stats.avgControl}</span>
          </div>
        )}
        {stats.avgMovement != null && (
          <div className="arsenal-stat">
            <span className="arsenal-stat-label">AVG MOV</span>
            <span className="arsenal-stat-val" style={{ color: attrColor(stats.avgMovement) }}>{stats.avgMovement}</span>
          </div>
        )}
        {stats.speedRange > 0 && (
          <div className="arsenal-stat arsenal-stat--range">
            <span className="arsenal-stat-label">SPEED RANGE</span>
            <span className="arsenal-stat-val" style={{ color: stats.speedRange >= 15 ? '#4ade80' : '#fbbf24' }}>
              ⚡ {stats.speedRange} MPH
            </span>
          </div>
        )}
      </div>

      {/* ── Speed bar chart ── */}
      <div className="arsenal-speed-chart">
        <div className="arsenal-chart-title">
          Speed Chart&ensp;
          <span className="arsenal-chart-scale">({SPEED_MIN}–{SPEED_MAX} MPH)</span>
          {stats.speedRange > 0 && (
            <span className="arsenal-range-badge"
                  title="Speed differential between fastest and slowest pitch — larger = harder to time">
              {stats.speedRange} MPH tunnel gap
            </span>
          )}
        </div>
        {sortedBySpeed.map((p, i) => {
          const { color } = pitchTypeInfo(p.name)
          const pct       = speedBarPct(p.speed)
          return (
            <div key={i} className="arsenal-speed-row">
              <span className="arsenal-speed-name">{p.name}</span>
              <div className="arsenal-speed-bar-outer">
                <div className="arsenal-speed-bar-inner" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className="arsenal-speed-num" style={{ color }}>
                {p.speed != null ? `${p.speed}` : '—'}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── Per-pitch detail rows ── */}
      <div className="pitches-list">
        {pitches.map((p, i) => {
          const { color, category } = pitchTypeInfo(p.name)
          return (
            <div key={i} className="pitch-row" style={{ borderLeftColor: color }}>
              <div className="pitch-row-head">
                <span className="pitch-name">{p.name}</span>
                <span className="pitch-type-badge"
                      style={{ background: `${color}1a`, color, border: `1px solid ${color}40` }}>
                  {category}
                </span>
              </div>
              <div className="pitch-attrs">
                <div className="pitch-attr">
                  <span className="pitch-attr-label">SPD</span>
                  <span className="pitch-attr-val" style={{ color }}>
                    {p.speed != null ? `${p.speed}` : '—'}
                  </span>
                  {p.speed != null && (
                    <div className="pitch-mini-bar-outer">
                      <div className="pitch-mini-bar-inner"
                           style={{ width: `${speedBarPct(p.speed)}%`, background: color }} />
                    </div>
                  )}
                </div>
                <div className="pitch-attr">
                  <span className="pitch-attr-label">CTRL</span>
                  <span className="pitch-attr-val" style={{ color: attrColor(p.control) }}>
                    {p.control ?? '—'}
                  </span>
                  {p.control != null && (
                    <div className="pitch-mini-bar-outer">
                      <div className="pitch-mini-bar-inner"
                           style={{ width: `${p.control}%`, background: attrColor(p.control) }} />
                    </div>
                  )}
                </div>
                <div className="pitch-attr">
                  <span className="pitch-attr-label">MOV</span>
                  <span className="pitch-attr-val" style={{ color: attrColor(p.movement) }}>
                    {p.movement ?? '—'}
                  </span>
                  {p.movement != null && (
                    <div className="pitch-mini-bar-outer">
                      <div className="pitch-mini-bar-inner"
                           style={{ width: `${p.movement}%`, background: attrColor(p.movement) }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Speed range constants re-exported for the chart scale label
const SPEED_MIN = 70
const SPEED_MAX = 102

function QuirksSection({ itemData, loading }) {
  if (loading) return null
  const quirks = itemData?.quirks
  if (!quirks?.length) return null

  return (
    <div className="hist-section">
      <SectionTitle count={quirks.length}>Quirks</SectionTitle>
      <div className="quirks-grid">
        {quirks.map((q, i) => (
          <div key={i} className="quirk-card">
            {q.img && (
              <img
                className="quirk-icon"
                src={q.img}
                alt={q.name}
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            )}
            <div className="quirk-info">
              <div className="quirk-name">{q.name}</div>
              {q.description && <div className="quirk-desc">{q.description}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LocationsSection({ itemData, loading }) {
  if (loading) return null
  const locs = itemData?.locations
  if (!locs?.length) return null

  return (
    <div className="hist-section">
      <SectionTitle>How to Obtain</SectionTitle>
      <div className="locations-list">
        {locs.map((loc, i) => (
          <div key={i} className="location-chip">
            {loc.icon && (
              <img
                className="location-icon"
                src={loc.icon}
                alt=""
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            )}
            <span className="location-name">{loc.name || loc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────────

export default function HistoricalPanel({
  listing, velocityData, velocityLoading,
  itemData, itemLoading,
  onClose,
  onCompare, isInTray, isTrayFull,
}) {
  // Close on Escape key
  useEffect(() => {
    if (!listing) return
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [listing, onClose])

  if (!listing) return null

  const item    = listing.item || {}
  const imgSrc  = item.baked_img || item.img || ''
  const pc      = profitClass(listing._profitAfterTax)
  const vLoaded = !!velocityData
  const rarity  = item.rarity || 'Common'
  const colors  = RARITY_COLORS[rarity] || RARITY_COLORS.Common

  // ── Snipe metrics ──
  const snipeDiscount = vLoaded ? velocityData.snipeDiscount  : listing._snipeDiscount
  const spreadPct     = vLoaded ? velocityData.spreadPct      : listing._spreadPct
  const volatilityPct = vLoaded ? velocityData.volatilityPct  : listing._volatilityPct
  const median        = vLoaded ? velocityData.median         : listing._median
  const avg           = vLoaded ? velocityData.avg            : listing._avg

  const isSnipeHot  = snipeDiscount != null && snipeDiscount >= 10
  const isSnipeGood = snipeDiscount != null && snipeDiscount >= 5 && !isSnipeHot

  const priceStats = [
    { label: 'Best Buy (You Pay)',   value: fmt(listing.best_buy_price),        cls: 'buy-color'  },
    { label: 'Best Sell (Receive)',  value: fmt(listing.best_sell_price),       cls: 'sell-color' },
    { label: 'Raw Profit',           value: fmtProfit(listing._profit),         cls: pc           },
    { label: 'Profit After 10% Tax', value: fmtProfit(listing._profitAfterTax), cls: pc          },
    { label: 'Margin',               value: listing._margin != null ? `${listing._margin.toFixed(1)}%` : '—', style: { color: '#c084fc' } },
    { label: 'Sell After Tax',       value: fmt(listing._sellAfterTax),         style: { color: '#fb923c' } },
  ]

  const velocityStats = [
    { label: 'Sales / Min',  value: fmtRate(velocityData?.salesPerMin),       style: { color: '#34d399' } },
    { label: 'Profit / Min', value: fmtProfitMin(velocityData?.profitPerMin), cls: profitClass(velocityData?.profitPerMin) },
  ]

  const snipeStats = [
    {
      label: 'Snipe Discount',
      value: fmtPct(snipeDiscount),
      style: { color: isSnipeHot ? '#4ade80' : isSnipeGood ? '#fbbf24' : snipeDiscount > 0 ? '#c8d6e5' : '#f87171' },
    },
    {
      label: 'Bid/Ask Spread',
      value: fmtPct(spreadPct),
      style: { color: spreadPct > 50 ? '#f87171' : spreadPct > 20 ? '#fbbf24' : '#c8d6e5' },
    },
    {
      label: 'Price Volatility',
      value: fmtPct(volatilityPct),
      style: { color: volatilityPct > 30 ? '#f87171' : volatilityPct > 15 ? '#fbbf24' : '#c8d6e5' },
    },
    { label: 'Median Sale Price', value: fmt(median),           style: { color: '#a78bfa' } },
    { label: 'Avg Sale Price',    value: fmt(Math.round(avg)),  style: { color: '#818cf8' } },
  ]

  const completedOrders = velocityData?.completedOrders || []
  const priceHistory    = velocityData?.priceHistory    || []

  return (
    <>
      {/* Backdrop — click anywhere outside the drawer to close */}
      <div className="detail-overlay" onClick={onClose} aria-hidden="true" />

      <div className="detail-panel" role="dialog" aria-modal="true">

      {/* ── Header ── */}
      <div className="detail-header">
        <div className="detail-header-left">
          {imgSrc && (
            <img className="detail-img" src={imgSrc} alt=""
                 style={{ boxShadow: `0 0 20px ${colors.glow}33` }} />
          )}
          <div>
            <h3 className="detail-name">{listing.listing_name}</h3>
            <p className="detail-sub">
              {[item.rarity, item.display_position, item.team, item.ovr ? `OVR ${item.ovr}` : null, item.series]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onCompare && (
            <button
              className={`cmp-panel-btn ${isInTray ? 'cmp-panel-btn--active' : ''} ${isTrayFull && !isInTray ? 'cmp-panel-btn--full' : ''}`}
              onClick={() => onCompare(listing)}
              title={isInTray ? 'Remove from comparison tray' : isTrayFull ? 'Tray full (max 3)' : 'Add to comparison tray'}
              disabled={isTrayFull && !isInTray}
            >
              {isInTray ? '✓ In Tray' : '⚡ Compare'}
            </button>
          )}
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* ── Player Info Bar ── */}
      <PlayerInfoBar item={item} itemData={itemData} />

      {/* ── Snipe callout ── */}
      {(isSnipeHot || isSnipeGood) && (
        <div className={`snipe-callout ${isSnipeHot ? 'snipe-callout--hot' : 'snipe-callout--warm'}`}>
          <span className="snipe-callout-icon">{isSnipeHot ? '🎯' : '👀'}</span>
          <div>
            <strong>{isSnipeHot ? 'SNIPE OPPORTUNITY' : 'POTENTIAL VALUE'}</strong>
            <p>
              Current ask is <strong>{snipeDiscount.toFixed(1)}% below</strong> the historical median
              ({fmt(Math.round(median))}). Buy at {fmt(listing.best_sell_price)} and sell near median
              for a potential {fmt(Math.round(median * 0.9 - listing.best_sell_price))} stub gain after tax.
            </p>
          </div>
        </div>
      )}

      {/* ── Price stats + velocity ── */}
      <div className="detail-grid" style={{ marginBottom: 16 }}>
        {priceStats.map(s => <StatTile key={s.label} {...s} />)}
        {velocityStats.map(s => (
          <div key={s.label} className="detail-stat detail-stat--velocity">
            <div className="detail-stat-label">{s.label}</div>
            {velocityLoading && !vLoaded
              ? <div className="vel-skeleton" />
              : <div className={`detail-stat-value mono ${s.cls || ''}`} style={s.style}>{s.value}</div>
            }
          </div>
        ))}
      </div>

      {/* ── Market Analysis ── */}
      <div className="hist-section">
        <SectionTitle>Market Analysis</SectionTitle>
        <div className="detail-grid">
          {snipeStats.map(s => (
            <div key={s.label} className="detail-stat detail-stat--snipe">
              <div className="detail-stat-label">{s.label}</div>
              {velocityLoading && !vLoaded
                ? <div className="vel-skeleton" />
                : <div className="detail-stat-value mono" style={s.style}>{s.value}</div>
              }
            </div>
          ))}
        </div>
      </div>

      {/* ── Player Attributes ── */}
      <AttributesSection item={item} itemData={itemData} loading={itemLoading} />

      {/* ── Pitch Arsenal ── */}
      <PitchArsenal itemData={itemData} loading={itemLoading} />

      {/* ── Quirks ── */}
      <QuirksSection itemData={itemData} loading={itemLoading} />

      {/* ── Locations / How to Obtain ── */}
      <LocationsSection itemData={itemData} loading={itemLoading} />

      {/* ── Price History Chart ── */}
      <div className="hist-section">
        <SectionTitle>Price History</SectionTitle>
        {velocityLoading && !vLoaded
          ? <div className="hist-chart-skeleton" />
          : <PriceChart priceHistory={priceHistory} />
        }
      </div>

      {/* ── Recent Completed Orders ── */}
      <div className="hist-section">
        <SectionTitle count={vLoaded && completedOrders.length > 0 ? completedOrders.length : null}>
          Recent Completed Orders
        </SectionTitle>
        {velocityLoading && !vLoaded ? (
          <div className="hist-table-skeleton" />
        ) : completedOrders.length === 0 ? (
          <p className="chart-empty">No completed orders available.</p>
        ) : (
          <div className="hist-orders-wrap">
            <table className="hist-orders-table">
              <thead>
                <tr>
                  <th>DATE / TIME</th>
                  <th>PRICE</th>
                  <th>VS MEDIAN</th>
                  <th>TYPE</th>
                </tr>
              </thead>
              <tbody>
                {[...completedOrders]
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .slice(0, 30)
                  .map((o, i) => {
                    const d        = new Date(o.date)
                    const price    = parsePrice(o.price)
                    const vsMedian = median != null && !isNaN(price)
                      ? ((price - median) / median) * 100
                      : null
                    return (
                      <tr key={i}>
                        <td className="mono" style={{ color: '#667', fontSize: 11 }}>
                          {!isNaN(d)
                            ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
                              ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                            : o.date}
                        </td>
                        <td className="mono" style={{ fontWeight: 600, color: '#e8eef5' }}>
                          {isNaN(price) ? o.price : price.toLocaleString()}
                        </td>
                        <td className="mono" style={{
                          fontSize: 11,
                          color: vsMedian == null ? '#445'
                            : vsMedian < -5 ? '#4ade80'
                            : vsMedian > 5  ? '#f87171'
                            : '#c8d6e5',
                        }}>
                          {vsMedian != null
                            ? `${vsMedian > 0 ? '+' : ''}${vsMedian.toFixed(1)}%`
                            : '—'}
                        </td>
                        <td>
                          {o.type
                            ? <span className={`order-type-badge order-type-${o.type}`}>{o.type}</span>
                            : <span style={{ color: '#445' }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="detail-tip">
        Tip: Place a buy order at {fmt(listing.best_buy_price)} and sell at {fmt(listing.best_sell_price)} for
        a potential {fmtProfit(listing._profitAfterTax)} stub profit after the 10% market tax.
        {vLoaded && velocityData.profitPerMin > 0 &&
          ` At current velocity that's ~${Math.round(velocityData.profitPerMin).toLocaleString()} stubs/min.`}
        {isSnipeHot && ` 🎯 Strong snipe detected — ask is ${snipeDiscount.toFixed(1)}% below median.`}
      </p>
    </div>
    </>
  )
}
