import { useState, useMemo, useCallback } from 'react'
import { useCollectionTracker } from '../hooks/useCollectionTracker'
import { RARITY_COLORS } from '../constants'
import { fmt } from '../utils/format'

// ── Constants ──────────────────────────────────────────────────────

const DIVISIONS = {
  'AL East':    ['BAL', 'BOS', 'NYY', 'TB',  'TOR'],
  'AL Central': ['CWS', 'CLE', 'DET', 'KC',  'MIN'],
  'AL West':    ['HOU', 'LAA', 'OAK', 'SEA', 'TEX'],
  'NL East':    ['ATL', 'MIA', 'NYM', 'PHI', 'WAS'],
  'NL Central': ['CHC', 'CIN', 'MIL', 'PIT', 'STL'],
  'NL West':    ['ARI', 'COL', 'LAD', 'SD',  'SF' ],
}

const TEAM_NAMES = {
  BAL: 'Baltimore Orioles',       BOS: 'Boston Red Sox',
  NYY: 'New York Yankees',        TB:  'Tampa Bay Rays',
  TOR: 'Toronto Blue Jays',       CWS: 'Chicago White Sox',
  CLE: 'Cleveland Guardians',     DET: 'Detroit Tigers',
  KC:  'Kansas City Royals',      MIN: 'Minnesota Twins',
  HOU: 'Houston Astros',          LAA: 'Los Angeles Angels',
  OAK: 'Oakland Athletics',       SEA: 'Seattle Mariners',
  TEX: 'Texas Rangers',           ATL: 'Atlanta Braves',
  MIA: 'Miami Marlins',           NYM: 'New York Mets',
  PHI: 'Philadelphia Phillies',   WAS: 'Washington Nationals',
  CHC: 'Chicago Cubs',            CIN: 'Cincinnati Reds',
  MIL: 'Milwaukee Brewers',       PIT: 'Pittsburgh Pirates',
  STL: 'St. Louis Cardinals',     ARI: 'Arizona Diamondbacks',
  COL: 'Colorado Rockies',        LAD: 'Los Angeles Dodgers',
  SD:  'San Diego Padres',        SF:  'San Francisco Giants',
  FA:  'Free Agents / Legends',
}

const RARITY_ORDER = ['Diamond', 'Gold', 'Silver', 'Bronze', 'Common']

const ALL_TEAMS = Object.values(DIVISIONS).flat()

// Teams that belong to a division — everything else is FA/Legends
const DIVISION_TEAM_SET = new Set(ALL_TEAMS)

// ── Helpers ────────────────────────────────────────────────────────

function parseOvr(v) {
  if (typeof v === 'number') return v
  const n = parseInt(v, 10)
  return isNaN(n) ? 0 : n
}

function computeTeamStats(cards) {
  const listed = cards.filter(c => c.onMarket)
  const totalCost = listed.reduce((s, c) => s + (c.sellPrice || 0), 0)
  const byCost = {}
  RARITY_ORDER.forEach(r => { byCost[r] = 0 })
  listed.forEach(c => { byCost[c.rarity] = (byCost[c.rarity] || 0) + (c.sellPrice || 0) })
  const sorted = [...listed].sort((a, b) => (b.sellPrice || 0) - (a.sellPrice || 0))
  return {
    total: cards.length,
    listed: listed.length,
    notListed: cards.length - listed.length,
    totalCost,
    byCost,
    mostExpensive: sorted[0] || null,
    cheapest: sorted[sorted.length - 1] || null,
  }
}

// ── Sub-components ─────────────────────────────────────────────────

function RarityBadge({ rarity }) {
  const c = RARITY_COLORS[rarity] || RARITY_COLORS.Common
  return (
    <span className="rarity-badge" style={{ background: c.badge, color: c.text }}>
      {(rarity || '').toUpperCase()}
    </span>
  )
}

function CostBadge({ amount, className = '' }) {
  if (!amount) return <span className="ct-cost--zero">—</span>
  return <span className={`ct-cost ${className}`}>{fmt(amount)}</span>
}

function ProgressBar({ page, total }) {
  const pct = total > 0 ? Math.round((page / total) * 100) : 0
  return (
    <div className="ct-load-wrap">
      <div className="ct-load-bar-outer">
        <div className="ct-load-bar-inner" style={{ width: `${pct}%` }} />
      </div>
      <span className="ct-load-label">
        Loading card catalog… page {page} of {total} ({pct}%)
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// VIEW: Overview — division grid + cheapest-to-complete
// ─────────────────────────────────────────────────────────────────

function OverviewView({ divisionData, teamRanking, teamStatsMap, onSelectTeam }) {
  const mlbTotal = Object.values(teamStatsMap)
    .reduce((s, st) => s + (st?.totalCost || 0), 0)

  const alTotal  = Object.entries(DIVISIONS)
    .filter(([k]) => k.startsWith('AL'))
    .flatMap(([, teams]) => teams)
    .reduce((s, code) => s + (teamStatsMap[code]?.totalCost || 0), 0)

  const nlTotal  = mlbTotal - alTotal

  return (
    <div className="ct-overview">

      {/* League totals */}
      <div className="ct-league-bar">
        <div className="ct-league-chip">
          <span className="ct-league-label">AL Total</span>
          <span className="ct-league-val">{fmt(alTotal)}</span>
        </div>
        <div className="ct-league-sep">+</div>
        <div className="ct-league-chip">
          <span className="ct-league-label">NL Total</span>
          <span className="ct-league-val">{fmt(nlTotal)}</span>
        </div>
        <div className="ct-league-sep">=</div>
        <div className="ct-league-chip ct-league-chip--total">
          <span className="ct-league-label">MLB Total</span>
          <span className="ct-league-val">{fmt(mlbTotal)}</span>
          <span className="ct-league-sub">to buy all market cards</span>
        </div>
      </div>

      {/* Division grids */}
      <div className="ct-divisions-grid">
        {Object.entries(divisionData).map(([divName, div]) => (
          <div key={divName} className="ct-division-card">
            <div className="ct-division-header">
              <span className="ct-division-name">{divName}</span>
              <span className="ct-division-total">{fmt(div.totalCost)}</span>
            </div>
            {div.teams.map(({ code, stats }) => (
              <button key={code} className="ct-division-team-row"
                      onClick={() => onSelectTeam(code)}>
                <span className="ct-div-code">{code}</span>
                <span className="ct-div-name">{TEAM_NAMES[code] || code}</span>
                <span className="ct-div-count muted">{stats?.listed ?? 0} on mkt</span>
                <CostBadge amount={stats?.totalCost} />
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Cheapest to Complete */}
      <div className="ct-section-title">🏆 Cheapest Team Collections to Complete</div>
      <div className="ct-table-wrap">
        <table className="ct-table">
          <thead>
            <tr>
              <th className="ct-th">#</th>
              <th className="ct-th" style={{ textAlign: 'left' }}>Team</th>
              <th className="ct-th">Cards</th>
              <th className="ct-th">On Mkt</th>
              <th className="ct-th">Total Cost</th>
              <th className="ct-th">Most Expensive</th>
            </tr>
          </thead>
          <tbody>
            {teamRanking.map((row, i) => {
              const r = RARITY_COLORS[row.mostExpensive?.rarity] || RARITY_COLORS.Common
              return (
                <tr key={row.code} className="ct-row" onClick={() => onSelectTeam(row.code)}>
                  <td className="ct-td ct-td--rank">{i + 1}</td>
                  <td className="ct-td" style={{ textAlign: 'left' }}>
                    <span className="ct-team-code">{row.code}</span>
                    <span className="ct-team-full">{TEAM_NAMES[row.code] || row.code}</span>
                  </td>
                  <td className="ct-td mono">{row.total}</td>
                  <td className="ct-td mono">{row.listed}</td>
                  <td className="ct-td mono ct-cost">{fmt(row.totalCost)}</td>
                  <td className="ct-td" style={{ fontSize: 11, color: r.glow }}>
                    {row.mostExpensive
                      ? `${row.mostExpensive.name} — ${fmt(row.mostExpensive.sellPrice)}`
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// VIEW: Team — selector grid + team detail
// ─────────────────────────────────────────────────────────────────

function TeamView({ teamMap, teamStatsMap, selectedTeam, onSelectTeam }) {
  const [sort, setSort]           = useState({ key: 'ovr', dir: 'desc' })
  const [showUnlisted, setShowUnlisted] = useState(false)

  const cards    = teamMap[selectedTeam] || []
  const stats    = selectedTeam ? teamStatsMap[selectedTeam] : null

  const sorted = useMemo(() => {
    if (!cards.length) return []
    const visible = showUnlisted ? cards : cards.filter(c => c.onMarket)
    return [...visible].sort((a, b) => {
      let av, bv
      if (sort.key === 'ovr')       { av = parseOvr(a.item.ovr); bv = parseOvr(b.item.ovr) }
      else if (sort.key === 'price') { av = a.sellPrice ?? -1;    bv = b.sellPrice ?? -1    }
      else if (sort.key === 'rarity'){
        av = RARITY_ORDER.indexOf(a.item.rarity)
        bv = RARITY_ORDER.indexOf(b.item.rarity)
      }
      else { av = 0; bv = 0 }
      return sort.dir === 'desc' ? bv - av : av - bv
    })
  }, [cards, sort, showUnlisted])

  function toggleSort(key) {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: 'desc' })
  }

  function SortTh({ col, children }) {
    const active = sort.key === col
    return (
      <th className={`ct-th ct-th--sortable ${active ? 'ct-th--active' : ''}`}
          onClick={() => toggleSort(col)}>
        {children} {active ? (sort.dir === 'desc' ? '▾' : '▴') : ''}
      </th>
    )
  }

  return (
    <div className="ct-team-view">

      {/* Team selector — grouped by division */}
      <div className="ct-team-grid">
        {Object.entries(DIVISIONS).map(([divName, teams]) => (
          <div key={divName} className="ct-team-group">
            <div className="ct-team-group-label">{divName}</div>
            <div className="ct-team-chips">
              {teams.map(code => {
                const st = teamStatsMap[code]
                return (
                  <button key={code}
                          className={`ct-team-chip ${selectedTeam === code ? 'ct-team-chip--active' : ''}`}
                          onClick={() => onSelectTeam(selectedTeam === code ? null : code)}>
                    <span className="ct-chip-code">{code}</span>
                    {st && <span className="ct-chip-cost">{fmt(st.totalCost)}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {/* Free Agents section */}
        {teamMap['FA'] && (
          <div className="ct-team-group">
            <div className="ct-team-group-label">Free Agents</div>
            <div className="ct-team-chips">
              <button className={`ct-team-chip ${selectedTeam === 'FA' ? 'ct-team-chip--active' : ''}`}
                      onClick={() => onSelectTeam(selectedTeam === 'FA' ? null : 'FA')}>
                <span className="ct-chip-code">FA</span>
                {teamStatsMap['FA'] && <span className="ct-chip-cost">{fmt(teamStatsMap['FA'].totalCost)}</span>}
              </button>
            </div>
          </div>
        )}
      </div>

      {!selectedTeam && (
        <div className="gh-idle" style={{ marginTop: 32 }}>
          <div className="gh-idle-icon">⚾</div>
          <div className="gh-idle-title">Select a team above</div>
          <div className="gh-idle-sub">Click any team chip to see its full card collection and market costs.</div>
        </div>
      )}

      {selectedTeam && stats && (
        <>
          {/* Team summary */}
          <div className="ct-team-summary">
            <div className="ct-summary-header">
              <span className="ct-summary-team-code">{selectedTeam}</span>
              <span className="ct-summary-team-name">{TEAM_NAMES[selectedTeam] || selectedTeam}</span>
            </div>
            <div className="ct-summary-stats">
              <div className="ct-summary-stat">
                <span className="ct-stat-label">TOTAL CARDS</span>
                <span className="ct-stat-val">{stats.total}</span>
              </div>
              <div className="ct-summary-stat">
                <span className="ct-stat-label">ON MARKET</span>
                <span className="ct-stat-val" style={{ color: '#4ade80' }}>{stats.listed}</span>
              </div>
              <div className="ct-summary-stat">
                <span className="ct-stat-label">NOT LISTED</span>
                <span className="ct-stat-val" style={{ color: '#f87171' }}>{stats.notListed}</span>
              </div>
              <div className="ct-summary-stat ct-summary-stat--big">
                <span className="ct-stat-label">TOTAL COST</span>
                <span className="ct-stat-val ct-cost">{fmt(stats.totalCost)}</span>
              </div>
            </div>

            {/* Cost by rarity */}
            <div className="ct-rarity-costs">
              {RARITY_ORDER.filter(r => stats.byCost[r] > 0).map(r => {
                const c = RARITY_COLORS[r] || RARITY_COLORS.Common
                return (
                  <div key={r} className="ct-rarity-cost-chip" style={{ borderColor: c.badge }}>
                    <span style={{ color: c.glow }}>{r}</span>
                    <span className="ct-cost mono">{fmt(stats.byCost[r])}</span>
                  </div>
                )
              })}
            </div>

            {/* Extremes */}
            {stats.mostExpensive && (
              <div className="ct-extremes">
                <div className="ct-extreme">
                  <span className="ct-extreme-label">Most Expensive</span>
                  <span className="ct-extreme-val">
                    {stats.mostExpensive.name}
                    <span className="ct-cost" style={{ marginLeft: 8 }}>{fmt(stats.mostExpensive.sellPrice)}</span>
                  </span>
                </div>
                {stats.cheapest && stats.cheapest.uuid !== stats.mostExpensive.uuid && (
                  <div className="ct-extreme">
                    <span className="ct-extreme-label">Cheapest</span>
                    <span className="ct-extreme-val">
                      {stats.cheapest.name}
                      <span className="ct-cost" style={{ marginLeft: 8 }}>{fmt(stats.cheapest.sellPrice)}</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card table controls */}
          <div className="ct-table-controls">
            <label className="ct-toggle-label">
              <input type="checkbox" checked={showUnlisted}
                     onChange={e => setShowUnlisted(e.target.checked)} />
              Show unlisted cards ({stats.notListed})
            </label>
            <span className="muted" style={{ fontSize: 12 }}>
              Showing {sorted.length} card{sorted.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="ct-table-wrap">
            <table className="ct-table">
              <thead>
                <tr>
                  <th className="ct-th" style={{ textAlign: 'left', minWidth: 200 }}>Card</th>
                  <SortTh col="ovr">OVR</SortTh>
                  <th className="ct-th">POS</th>
                  <SortTh col="rarity">Rarity</SortTh>
                  <th className="ct-th">Series</th>
                  <SortTh col="price">Buy Now</SortTh>
                  <th className="ct-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => {
                  const item = c.item
                  const rc   = RARITY_COLORS[item.rarity] || RARITY_COLORS.Common
                  const ovr  = parseOvr(item.ovr)
                  const img  = item.baked_img || item.img
                  return (
                    <tr key={item.uuid || i} className={`ct-row ${!c.onMarket ? 'ct-row--unlisted' : ''}`}>
                      <td className="ct-td" style={{ textAlign: 'left' }}>
                        <div className="card-cell">
                          {img && (
                            <img className="card-img" src={img} alt=""
                                 onError={e => { e.currentTarget.style.display = 'none' }} />
                          )}
                          <span className="card-name">{item.listing_name || item.name || '—'}</span>
                        </div>
                      </td>
                      <td className="ct-td mono" style={{ color: rc.glow, fontWeight: 700 }}>
                        {ovr || '—'}
                      </td>
                      <td className="ct-td" style={{ color: '#aab' }}>{item.display_position || '—'}</td>
                      <td className="ct-td"><RarityBadge rarity={item.rarity} /></td>
                      <td className="ct-td" style={{ color: '#6a9ab0', fontSize: 11 }}>
                        {item.series || item.set_name || '—'}
                      </td>
                      <td className="ct-td mono ct-cost" style={{ fontWeight: 700 }}>
                        {c.onMarket ? fmt(c.sellPrice) : '—'}
                      </td>
                      <td className="ct-td">
                        {c.onMarket
                          ? <span className="ct-status ct-status--on">On Market</span>
                          : <span className="ct-status ct-status--off">No Sell</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// VIEW: Rarity — all cards grouped by rarity
// ─────────────────────────────────────────────────────────────────

function RarityView({ rarityGroups }) {
  const [expanded, setExpanded] = useState({ Diamond: true })
  const toggle = r => setExpanded(prev => ({ ...prev, [r]: !prev[r] }))

  return (
    <div className="ct-rarity-view">
      {RARITY_ORDER.map(rarity => {
        const group = rarityGroups[rarity]
        if (!group) return null
        const rc    = RARITY_COLORS[rarity] || RARITY_COLORS.Common
        const isOpen = !!expanded[rarity]
        const listed  = group.filter(c => c.onMarket)
        const cost    = listed.reduce((s, c) => s + (c.sellPrice || 0), 0)

        return (
          <div key={rarity} className="ct-rarity-section">
            <button className="ct-rarity-toggle" onClick={() => toggle(rarity)}
                    style={{ borderLeftColor: rc.glow }}>
              <span>
                {isOpen ? '▾' : '▸'}
                <span className="ct-rarity-toggle-name" style={{ color: rc.glow }}>{rarity}</span>
              </span>
              <span className="ct-rarity-meta">
                <span>{group.length} cards</span>
                <span>{listed.length} on market</span>
                <span className="ct-cost">{fmt(cost)} total</span>
              </span>
            </button>

            {isOpen && (
              <div className="ct-table-wrap">
                <table className="ct-table">
                  <thead>
                    <tr>
                      <th className="ct-th" style={{ textAlign: 'left', minWidth: 200 }}>Card</th>
                      <th className="ct-th">OVR</th>
                      <th className="ct-th">Team</th>
                      <th className="ct-th">POS</th>
                      <th className="ct-th">Series</th>
                      <th className="ct-th">Buy Now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.slice(0, 300).map((c, i) => {
                      const item = c.item
                      const img  = item.baked_img || item.img
                      return (
                        <tr key={item.uuid || i} className={`ct-row ${!c.onMarket ? 'ct-row--unlisted' : ''}`}>
                          <td className="ct-td" style={{ textAlign: 'left' }}>
                            <div className="card-cell">
                              {img && <img className="card-img" src={img} alt=""
                                           onError={e => { e.currentTarget.style.display = 'none' }} />}
                              <span className="card-name">{item.listing_name || item.name || '—'}</span>
                            </div>
                          </td>
                          <td className="ct-td mono" style={{ color: rc.glow, fontWeight: 700 }}>
                            {parseOvr(item.ovr) || '—'}
                          </td>
                          <td className="ct-td" style={{ color: '#6a9ab0', fontSize: 11 }}>
                            {item.team || '—'}
                          </td>
                          <td className="ct-td" style={{ color: '#aab' }}>{item.display_position || '—'}</td>
                          <td className="ct-td" style={{ color: '#6a9ab0', fontSize: 11 }}>
                            {item.series || item.set_name || '—'}
                          </td>
                          <td className="ct-td mono ct-cost" style={{ fontWeight: 600 }}>
                            {c.onMarket ? fmt(c.sellPrice) : <span className="muted">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                    {group.length > 300 && (
                      <tr>
                        <td colSpan={6} className="ct-td" style={{ textAlign: 'center', color: '#3a5a7a', fontSize: 12 }}>
                          Showing 300 of {group.length} — filter by rarity in Card Finder for full list
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// VIEW: Series — cards grouped by series
// ─────────────────────────────────────────────────────────────────

function SeriesView({ seriesGroups }) {
  const [expanded, setExpanded] = useState({})
  const toggle = s => setExpanded(prev => ({ ...prev, [s]: !prev[s] }))

  // Sort series by total cost descending
  const sorted = useMemo(() =>
    [...seriesGroups].sort((a, b) => b.totalCost - a.totalCost),
    [seriesGroups]
  )

  return (
    <div className="ct-series-view">
      {sorted.map(({ series, cards }) => {
        const isOpen  = !!expanded[series]
        const listed  = cards.filter(c => c.onMarket)
        const cost    = listed.reduce((s, c) => s + (c.sellPrice || 0), 0)

        return (
          <div key={series} className="ct-series-section">
            <button className="ct-series-toggle" onClick={() => toggle(series)}>
              <span className="ct-series-toggle-left">
                {isOpen ? '▾' : '▸'}
                <span className="ct-series-name">{series}</span>
              </span>
              <span className="ct-series-meta">
                <span>{cards.length} cards</span>
                <span>{listed.length} on mkt</span>
                <span className="ct-cost">{fmt(cost)}</span>
              </span>
            </button>

            {isOpen && (
              <div className="ct-table-wrap">
                <table className="ct-table">
                  <thead>
                    <tr>
                      <th className="ct-th" style={{ textAlign: 'left', minWidth: 200 }}>Card</th>
                      <th className="ct-th">OVR</th>
                      <th className="ct-th">Rarity</th>
                      <th className="ct-th">Team</th>
                      <th className="ct-th">POS</th>
                      <th className="ct-th">Buy Now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...cards]
                      .sort((a, b) => (b.sellPrice || 0) - (a.sellPrice || 0))
                      .slice(0, 200)
                      .map((c, i) => {
                        const item = c.item
                        const rc   = RARITY_COLORS[item.rarity] || RARITY_COLORS.Common
                        const img  = item.baked_img || item.img
                        return (
                          <tr key={item.uuid || i} className={`ct-row ${!c.onMarket ? 'ct-row--unlisted' : ''}`}>
                            <td className="ct-td" style={{ textAlign: 'left' }}>
                              <div className="card-cell">
                                {img && <img className="card-img" src={img} alt=""
                                             onError={e => { e.currentTarget.style.display = 'none' }} />}
                                <span className="card-name">{item.listing_name || item.name || '—'}</span>
                              </div>
                            </td>
                            <td className="ct-td mono" style={{ color: rc.glow, fontWeight: 700 }}>
                              {parseOvr(item.ovr) || '—'}
                            </td>
                            <td className="ct-td"><RarityBadge rarity={item.rarity} /></td>
                            <td className="ct-td" style={{ color: '#6a9ab0', fontSize: 11 }}>{item.team || '—'}</td>
                            <td className="ct-td" style={{ color: '#aab' }}>{item.display_position || '—'}</td>
                            <td className="ct-td mono ct-cost" style={{ fontWeight: 600 }}>
                              {c.onMarket ? fmt(c.sellPrice) : <span className="muted">—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    {cards.length > 200 && (
                      <tr>
                        <td colSpan={6} className="ct-td" style={{ textAlign: 'center', color: '#3a5a7a', fontSize: 12 }}>
                          Showing 200 of {cards.length} cards
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────

export default function CollectionTracker({ allListings }) {
  const { catalog, loading, progress, error, reload } = useCollectionTracker()
  const [view, setView]             = useState('overview')
  const [selectedTeam, setSelectedTeam] = useState(null)

  // ── Build listing lookup ──
  const listingMap = useMemo(() => {
    const m = new Map()
    if (!allListings?.length) return m
    allListings.forEach(l => {
      const uuid = l.uuid || l.item?.uuid
      if (uuid) m.set(uuid, l)
    })
    return m
  }, [allListings])

  // ── Enrich catalog items with market data ──
  const enriched = useMemo(() => {
    if (!catalog) return []
    return catalog.map(item => {
      const listing   = listingMap.get(item.uuid) || null
      const sellPrice = (listing?.best_sell_price > 0) ? listing.best_sell_price : null
      return { item, listing, sellPrice, onMarket: sellPrice != null }
    })
  }, [catalog, listingMap])

  // ── Group by team ──
  const teamMap = useMemo(() => {
    const m = {}
    enriched.forEach(c => {
      const team = c.item.team || 'FA'
      // Normalise common "Free Agent" variants
      const key  = (team === 'Free Agents' || team === 'FA') ? 'FA' : team
      ;(m[key] = m[key] || []).push(c)
    })
    return m
  }, [enriched])

  // ── Team stats map ──
  const teamStatsMap = useMemo(() => {
    const m = {}
    Object.entries(teamMap).forEach(([code, cards]) => {
      m[code] = computeTeamStats(cards)
    })
    return m
  }, [teamMap])

  // ── Division rollup data ──
  const divisionData = useMemo(() => {
    const result = {}
    Object.entries(DIVISIONS).forEach(([divName, teams]) => {
      const teamEntries  = teams.map(code => ({ code, stats: teamStatsMap[code] || null }))
      const totalCost    = teamEntries.reduce((s, t) => s + (t.stats?.totalCost || 0), 0)
      result[divName]    = { teams: teamEntries, totalCost }
    })
    return result
  }, [teamStatsMap])

  // ── Cheapest-to-complete ranking ──
  const teamRanking = useMemo(() => {
    return ALL_TEAMS.map(code => ({
      code,
      ...(teamStatsMap[code] || { total: 0, listed: 0, totalCost: 0, mostExpensive: null }),
    })).sort((a, b) => (a.totalCost || 0) - (b.totalCost || 0))
  }, [teamStatsMap])

  // ── Group by rarity ──
  const rarityGroups = useMemo(() => {
    const m = {}
    enriched.forEach(c => {
      const r = c.item.rarity || 'Common'
      ;(m[r] = m[r] || []).push(c)
    })
    // Sort each group by OVR desc then sellPrice desc
    Object.keys(m).forEach(r => {
      m[r].sort((a, b) => {
        const oa = parseOvr(a.item.ovr), ob = parseOvr(b.item.ovr)
        if (ob !== oa) return ob - oa
        return (b.sellPrice || 0) - (a.sellPrice || 0)
      })
    })
    return m
  }, [enriched])

  // ── Group by series ──
  const seriesGroups = useMemo(() => {
    const m = {}
    enriched.forEach(c => {
      const s = c.item.series || c.item.set_name || 'Unknown'
      ;(m[s] = m[s] || []).push(c)
    })
    return Object.entries(m).map(([series, cards]) => ({
      series,
      cards,
      totalCost: cards.filter(c => c.onMarket).reduce((s, c) => s + (c.sellPrice || 0), 0),
    }))
  }, [enriched])

  // Navigate to Team view when selecting a team from Overview
  const handleSelectTeam = useCallback(code => {
    setSelectedTeam(code)
    setView('team')
  }, [])

  // ── Loading / error states ──
  if (loading) {
    return (
      <div className="ct-wrap">
        {progress.total > 0
          ? <ProgressBar page={progress.page} total={progress.total} />
          : (
            <div className="ct-load-wrap">
              <div className="ct-load-label">
                <span className="auto-scan-dots"><span/><span/><span/></span>
                Loading card catalog…
              </div>
            </div>
          )
        }
      </div>
    )
  }

  if (error) {
    return (
      <div className="ct-wrap">
        <div className="gh-error">
          <span>⚠</span>
          <span>{error}</span>
          <button className="ct-retry-btn" onClick={reload}>Retry</button>
        </div>
      </div>
    )
  }

  if (!catalog) return null

  const totalCards  = enriched.length
  const totalListed = enriched.filter(c => c.onMarket).length
  const marketPct   = totalCards > 0 ? Math.round((totalListed / totalCards) * 100) : 0

  const VIEWS = [
    { key: 'overview', label: '📊 Overview'   },
    { key: 'team',     label: '⚾ By Team'     },
    { key: 'rarity',   label: '💎 By Rarity'  },
    { key: 'series',   label: '📦 By Series'  },
  ]

  return (
    <div className="ct-wrap">

      {/* ── Headline bar ── */}
      <div className="ct-headline">
        <span className="ct-headline-stat">
          <strong>{totalCards.toLocaleString()}</strong> total cards
        </span>
        <span className="ct-headline-sep">·</span>
        <span className="ct-headline-stat">
          <strong style={{ color: '#4ade80' }}>{totalListed.toLocaleString()}</strong> on market ({marketPct}%)
        </span>
        <span className="ct-headline-sep">·</span>
        <span className="ct-headline-stat">
          <strong>{Object.keys(teamMap).length}</strong> teams
        </span>
        {allListings?.length === 0 && (
          <span className="ct-headline-warn">
            ⚠ Market data loading — visit Market tab first for prices
          </span>
        )}
      </div>

      {/* ── Inner view tabs ── */}
      <div className="ct-view-tabs">
        {VIEWS.map(v => (
          <button key={v.key}
                  className={`ct-view-tab ${view === v.key ? 'ct-view-tab--active' : ''}`}
                  onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ── View content ── */}
      {view === 'overview' && (
        <OverviewView
          divisionData={divisionData}
          teamRanking={teamRanking}
          teamStatsMap={teamStatsMap}
          onSelectTeam={handleSelectTeam}
        />
      )}

      {view === 'team' && (
        <TeamView
          teamMap={teamMap}
          teamStatsMap={teamStatsMap}
          selectedTeam={selectedTeam}
          onSelectTeam={setSelectedTeam}
        />
      )}

      {view === 'rarity' && <RarityView rarityGroups={rarityGroups} />}
      {view === 'series' && <SeriesView seriesGroups={seriesGroups} />}
    </div>
  )
}
