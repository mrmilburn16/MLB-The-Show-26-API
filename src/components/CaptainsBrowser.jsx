import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useCaptains } from '../hooks/useCaptains'
import { API_BASE } from '../constants'

// ── Constants ──────────────────────────────────────────────────────

const POSITIONS = ['SP','RP','CP','C','1B','2B','3B','SS','LF','CF','RF']

const SORT_OPTIONS = [
  { value: 'tier3', label: 'Best Tier 3 Boosts' },
  { value: 'name',  label: 'Name A–Z' },
  { value: 'ovr',   label: 'OVR (high→low)' },
  { value: 'pos',   label: 'Position' },
]

const RARITY_COLOR = {
  Diamond: '#4da6ff', Gold: '#ffd644', Silver: '#9aafc0',
  Bronze: '#cd7f3a',  Common: '#7a8a6a',
}
const BOOST_COLORS = ['#5a8aaa', '#4da6ff', '#ffd644']   // T1 grey-blue, T2 blue, T3 gold

// Pretty-print an attribute name
function fmtAttr(raw = '') {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bPer\b/g, '/')
    .replace(/\bBb\b/g, 'BB')
    .replace(/\bHr\b/g, 'HR')
    .replace(/\bH\b(?= )/g, 'H')
}

// ── Boost bar ──────────────────────────────────────────────────────

function BoostBar({ tiers, attr }) {
  const maxDelta = Math.max(...tiers.map(t =>
    t.boosts.find(b => b.attr === attr)?.delta ?? 0
  ), 1)

  return (
    <div className="cb-boost-bar-wrap">
      <span className="cb-boost-attr">{fmtAttr(attr)}</span>
      <div className="cb-boost-tiers">
        {tiers.map((t, i) => {
          const delta = t.boosts.find(b => b.attr === attr)?.delta ?? 0
          const pct   = Math.min(100, Math.round((delta / maxDelta) * 100))
          return (
            <div key={i} className="cb-boost-tier-row">
              <span className="cb-boost-tier-label" style={{ color: BOOST_COLORS[i] }}>
                {t.label}
              </span>
              <div className="cb-boost-track">
                <div
                  className="cb-boost-fill"
                  style={{ width: `${pct}%`, background: BOOST_COLORS[i] }}
                />
              </div>
              <span className="cb-boost-delta" style={{ color: BOOST_COLORS[i] }}>
                +{delta}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tier badge chip ────────────────────────────────────────────────

function TierChip({ tier, idx }) {
  return (
    <div className="cb-tier-chip" style={{ borderColor: `${BOOST_COLORS[idx]}40` }}>
      <div className="cb-tier-chip-label" style={{ color: BOOST_COLORS[idx] }}>
        {tier.label}
      </div>
      <div className="cb-tier-chip-req">{tier.req}</div>
      <div className="cb-tier-chip-boosts">
        {tier.boosts.map((b, bi) => (
          <span key={bi} className="cb-tier-boost-pill" style={{ color: BOOST_COLORS[idx] }}>
            {fmtAttr(b.attr)} <strong>+{b.delta}</strong>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Captain card (grid item) ───────────────────────────────────────

function CaptainCard({ cap, selected, onClick }) {
  const t3boosts = cap.tiers[2]?.boosts ?? cap.tiers.at(-1)?.boosts ?? []

  return (
    <div
      className={`cb-card ${selected ? 'cb-card--selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div className="cb-card-top">
        {cap.img ? (
          <img src={cap.img} alt={cap.name} className="cb-card-img" loading="lazy" />
        ) : (
          <div className="cb-card-img-ph">⚾</div>
        )}
        <div className="cb-card-header">
          <div className="cb-card-name">{cap.name}</div>
          <div className="cb-card-meta">
            <span className="cb-card-ovr">{cap.ovr ?? '—'}</span>
            <span className="cb-card-pos">{cap.position}</span>
            <span className="cb-card-team">{cap.team}</span>
          </div>
          <div className="cb-ability-name">{cap.abilityName}</div>
          <div className="cb-ability-desc">{cap.abilityDesc}</div>
        </div>
      </div>

      {/* Tier summary pills */}
      <div className="cb-card-tiers">
        {cap.tiers.map((t, i) => (
          <div key={i} className="cb-mini-tier" style={{ borderColor: `${BOOST_COLORS[i]}50` }}>
            <span className="cb-mini-label" style={{ color: BOOST_COLORS[i] }}>{t.label}</span>
            <span className="cb-mini-count">{t.boosts.length} boost{t.boosts.length !== 1 ? 's' : ''}</span>
          </div>
        ))}
      </div>

      {/* Top Tier 3 boosts preview */}
      {t3boosts.length > 0 && (
        <div className="cb-card-preview-boosts">
          {t3boosts.slice(0, 3).map((b, i) => (
            <span key={i} className="cb-preview-boost" style={{ color: BOOST_COLORS[2] }}>
              {fmtAttr(b.attr)} +{b.delta}
            </span>
          ))}
          {t3boosts.length > 3 && (
            <span className="cb-preview-more">+{t3boosts.length - 3} more</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Squad builder: qualifying cards ───────────────────────────────
// Lazy fetches card attributes for the captain's ability requirement.

const itemCache = new Map()

async function fetchItem(uuid) {
  if (itemCache.has(uuid)) return itemCache.get(uuid)
  const res  = await fetch(`${API_BASE}/item.json?uuid=${uuid}`)
  if (!res.ok) return null
  const data = await res.json()
  itemCache.set(uuid, data)
  return data
}

// Parse an attribute requirement from a captain's rawRequirement object.
// Returns { attrKey, comparison, value } or null if unparseable.
function parseRequirement(rawReq) {
  if (!rawReq || typeof rawReq !== 'object') return null
  const attr  = rawReq.attribute_name  ?? rawReq.attr  ?? null
  const val   = rawReq.attribute_value ?? rawReq.value ?? rawReq.threshold ?? null
  const cmp   = rawReq.comparison      ?? rawReq.operator ?? (val != null ? 'less_than' : null)
  if (!attr || val == null) return null
  return { attrKey: attr, comparison: cmp, value: Number(val) }
}

function meetsRequirement(itemData, req) {
  if (!req) return false
  const attrVal = itemData?.[req.attrKey] ?? itemData?.attributes?.[req.attrKey]
  if (attrVal == null) return false
  const n = Number(attrVal)
  switch (req.comparison) {
    case 'less_than':              return n < req.value
    case 'greater_than':           return n > req.value
    case 'less_than_or_equal':     return n <= req.value
    case 'greater_than_or_equal':  return n >= req.value
    case 'equal':                  return n === req.value
    default:                       return n < req.value  // sensible default
  }
}

function SquadBuilder({ cap, allListings }) {
  const [status,     setStatus]     = useState('idle')   // idle | loading | done
  const [qualifying, setQualifying] = useState([])
  const [checked,    setChecked]    = useState(0)
  const [total,      setTotal]      = useState(0)
  const abortRef = useRef(false)

  // Find the first tier's rawRequirement (the one that defines the ability)
  const req = useMemo(() => {
    for (const t of cap.tiers) {
      const parsed = parseRequirement(t.rawRequirement)
      if (parsed) return parsed
    }
    return null
  }, [cap])

  // Tier thresholds (how many qualifying cards each tier needs)
  const tierThresholds = useMemo(() =>
    cap.tiers.map(t =>
      typeof t.rawRequirement?.count === 'number'
        ? t.rawRequirement.count
        : null
    )
  , [cap])

  async function runSearch() {
    if (!allListings?.length) return
    abortRef.current = false
    setStatus('loading')
    setChecked(0)
    setQualifying([])

    const pool = allListings.filter(l => {
      const uuid = l.uuid || l.item?.uuid
      return uuid && l.best_buy_price > 0
    })
    setTotal(pool.length)

    const found  = []
    const CHUNK  = 5     // concurrent fetches
    let   i      = 0

    while (i < pool.length && !abortRef.current) {
      const batch = pool.slice(i, i + CHUNK)
      await Promise.all(batch.map(async l => {
        const uuid = l.uuid || l.item?.uuid
        const item = await fetchItem(uuid).catch(() => null)
        if (!abortRef.current) setChecked(c => c + 1)
        if (item && meetsRequirement(item, req)) {
          found.push({
            uuid,
            name:      l.listing_name || l.item?.name || '—',
            ovr:       item.ovr ?? l.item?.ovr ?? null,
            rarity:    item.rarity ?? l.item?.rarity ?? '—',
            position:  item.display_position ?? l.item?.display_position ?? '—',
            buyPrice:  l.best_buy_price,
            sellPrice: l.best_sell_price,
          })
        }
      }))
      i += CHUNK
      await new Promise(r => setTimeout(r, 50))
    }

    if (!abortRef.current) {
      found.sort((a, b) => a.buyPrice - b.buyPrice)
      setQualifying(found)
      setStatus('done')
    }
  }

  useEffect(() => () => { abortRef.current = true }, [])

  if (!req) {
    return (
      <div className="cb-squad-unavail">
        ℹ️ Squad builder requires structured ability requirements from the API —
        the raw requirement data for this captain isn't in a parseable format yet.
        <details className="cb-squad-raw">
          <summary>Raw ability data</summary>
          <pre>{JSON.stringify(cap.tiers.map(t => t.rawRequirement), null, 2)}</pre>
        </details>
      </div>
    )
  }

  const cheapestForT = (n) => {
    if (!n || qualifying.length < n) return null
    return qualifying.slice(0, n).reduce((s, c) => s + c.buyPrice, 0)
  }
  const bestOvrForT  = (n) => {
    if (!n || qualifying.length < n) return null
    const byOvr = [...qualifying].sort((a,b) => (b.ovr ?? 0) - (a.ovr ?? 0))
    return byOvr.slice(0, n).reduce((s, c) => s + c.buyPrice, 0)
  }

  return (
    <div className="cb-squad">
      <div className="cb-squad-header">
        <div className="cb-squad-title">
          ⚡ Which cards qualify?
        </div>
        <div className="cb-squad-req-desc">
          Requirement: <strong>{cap.abilityDesc || `${req.attrKey} ${req.comparison} ${req.value}`}</strong>
        </div>

        {status === 'idle' && allListings?.length > 0 && (
          <button className="cb-squad-run-btn" onClick={runSearch}>
            🔍 Find qualifying cards in market ({allListings.length.toLocaleString()} cards)
          </button>
        )}
        {!allListings?.length && (
          <div className="cb-squad-note">Market data not loaded — switch to the Market tab first.</div>
        )}
      </div>

      {status === 'loading' && (
        <div className="cb-squad-progress">
          <div className="cb-squad-progress-bar-wrap">
            <div
              className="cb-squad-progress-bar"
              style={{ width: total > 0 ? `${Math.round(checked / total * 100)}%` : '0%' }}
            />
          </div>
          <span className="cb-squad-progress-label">
            Checking attributes… {checked} / {total}
            {qualifying.length > 0 && ` · ${qualifying.length} qualifying so far`}
          </span>
          <button className="cb-squad-cancel-btn" onClick={() => { abortRef.current = true; setStatus('idle') }}>
            Cancel
          </button>
        </div>
      )}

      {status === 'done' && (
        <>
          <div className="cb-squad-results-header">
            <span className="cb-squad-count">
              {qualifying.length} qualifying cards found
            </span>
            <button className="cb-squad-rerun-btn" onClick={() => { setStatus('idle'); setQualifying([]) }}>
              ↺ Reset
            </button>
          </div>

          {/* Cost summary per tier */}
          <div className="cb-squad-costs">
            {cap.tiers.map((t, i) => {
              const n = tierThresholds[i]
              if (!n) return null
              const cheapCost = cheapestForT(n)
              const ovrCost   = bestOvrForT(n)
              return (
                <div key={i} className="cb-cost-card" style={{ borderColor: `${BOOST_COLORS[i]}40` }}>
                  <div className="cb-cost-label" style={{ color: BOOST_COLORS[i] }}>
                    {t.label} — {n} qualifying cards
                  </div>
                  {qualifying.length < n ? (
                    <div className="cb-cost-insufficient">
                      ✕ Only {qualifying.length} qualifying cards in market
                    </div>
                  ) : (
                    <div className="cb-cost-rows">
                      <div className="cb-cost-row">
                        <span className="cb-cost-method">Cheapest {n}</span>
                        <span className="cb-cost-val cb-cost-cheap">
                          {cheapCost != null ? cheapCost.toLocaleString() + ' stubs' : '—'}
                        </span>
                      </div>
                      <div className="cb-cost-row">
                        <span className="cb-cost-method">Best OVR {n}</span>
                        <span className="cb-cost-val">
                          {ovrCost != null ? ovrCost.toLocaleString() + ' stubs' : '—'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Qualifying cards table */}
          <div className="cb-qual-table-wrap">
            <table className="cb-qual-table">
              <thead>
                <tr>
                  <th>Card</th>
                  <th className="cb-th-num">OVR</th>
                  <th>Rarity</th>
                  <th>Pos</th>
                  <th className="cb-th-num">Buy Now</th>
                </tr>
              </thead>
              <tbody>
                {qualifying.slice(0, 100).map((c, i) => (
                  <tr key={c.uuid} className={`cb-qual-row ${i === 0 ? 'cb-qual-row--cheapest' : ''}`}>
                    <td className="cb-qual-name">{c.name}</td>
                    <td className="cb-qual-num">{c.ovr ?? '—'}</td>
                    <td><span style={{ color: RARITY_COLOR[c.rarity] ?? '#9aafc0', fontSize: 11 }}>{c.rarity}</span></td>
                    <td className="cb-qual-pos">{c.position}</td>
                    <td className="cb-qual-num cb-qual-price">{c.buyPrice.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {qualifying.length > 100 && (
              <div className="cb-qual-more">…and {qualifying.length - 100} more qualifying cards</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Captain detail panel ───────────────────────────────────────────

function CaptainDetail({ cap, onClose, allListings }) {
  const [tab, setTab] = useState('boosts')  // boosts | squad

  // Collect unique attributes across all tiers
  const allAttrs = useMemo(() => {
    const seen = new Set()
    for (const t of cap.tiers) for (const b of t.boosts) seen.add(b.attr)
    return [...seen]
  }, [cap])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="cb-overlay" onClick={onClose} />
      <div className="cb-detail-panel">
        <div className="cb-detail-header">
          <div className="cb-detail-ident">
            {cap.img && <img src={cap.img} alt={cap.name} className="cb-detail-img" />}
            <div>
              <div className="cb-detail-name">{cap.name}</div>
              <div className="cb-detail-meta">
                {cap.ovr && <span className="cb-detail-ovr">{cap.ovr} OVR</span>}
                <span className="cb-detail-pos">{cap.position}</span>
                <span className="cb-detail-team">{cap.team}</span>
              </div>
              <div className="cb-detail-ability-name">{cap.abilityName}</div>
              <div className="cb-detail-ability-desc">{cap.abilityDesc}</div>
            </div>
          </div>
          <button className="cb-detail-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Tab nav */}
        <div className="cb-detail-tabs">
          <button className={`cb-detail-tab ${tab === 'boosts' ? 'cb-detail-tab--active' : ''}`}
            onClick={() => setTab('boosts')}>
            📊 Tier Breakdown
          </button>
          <button className={`cb-detail-tab ${tab === 'squad' ? 'cb-detail-tab--active' : ''}`}
            onClick={() => setTab('squad')}>
            🔍 Find Qualifying Cards
          </button>
        </div>

        <div className="cb-detail-body">
          {tab === 'boosts' && (
            <>
              {/* Three tier chips */}
              <div className="cb-tiers-grid">
                {cap.tiers.map((t, i) => <TierChip key={i} tier={t} idx={i} />)}
              </div>

              {/* Attribute boost bars — animated progression T1→T3 */}
              {allAttrs.length > 0 && (
                <div className="cb-boost-bars">
                  <div className="cb-boost-bars-title">Boost Progression</div>
                  {allAttrs.map(attr => (
                    <BoostBar key={attr} tiers={cap.tiers} attr={attr} />
                  ))}
                </div>
              )}

              {/* Raw debug — collapsed */}
              <details className="cb-raw-details">
                <summary>Raw API data</summary>
                <pre className="cb-raw-pre">{JSON.stringify(cap._raw, null, 2)}</pre>
              </details>
            </>
          )}

          {tab === 'squad' && (
            <SquadBuilder cap={cap} allListings={allListings} />
          )}
        </div>
      </div>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────

export default function CaptainsBrowser({ allListings = [] }) {
  const { captains, loading, error, progress, refresh } = useCaptains()

  const [search,     setSearch]     = useState('')
  const [abilityQ,   setAbilityQ]   = useState('')
  const [posFilter,  setPosFilter]  = useState('')
  const [boostAttr,  setBoostAttr]  = useState('')
  const [sortBy,     setSortBy]     = useState('tier3')
  const [selected,   setSelected]   = useState(null)

  // Collect all unique boost attributes for the filter dropdown
  const allBoostAttrs = useMemo(() => {
    const seen = new Set()
    for (const c of captains) for (const a of c.allBoostedAttrs) seen.add(a)
    return [...seen].sort()
  }, [captains])

  // Filtered + sorted captains
  const visible = useMemo(() => {
    let list = captains

    if (search.trim())
      list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

    if (abilityQ.trim())
      list = list.filter(c =>
        c.abilityName.toLowerCase().includes(abilityQ.toLowerCase()) ||
        c.abilityDesc.toLowerCase().includes(abilityQ.toLowerCase())
      )

    if (posFilter)
      list = list.filter(c => c.position === posFilter)

    if (boostAttr)
      list = list.filter(c => c.allBoostedAttrs.includes(boostAttr.toLowerCase()))

    switch (sortBy) {
      case 'tier3': list = [...list].sort((a, b) => b.tier3Sum - a.tier3Sum); break
      case 'name':  list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break
      case 'ovr':   list = [...list].sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0)); break
      case 'pos':   list = [...list].sort((a, b) => a.position.localeCompare(b.position)); break
    }

    return list
  }, [captains, search, abilityQ, posFilter, boostAttr, sortBy])

  const clearFilters = useCallback(() => {
    setSearch(''); setAbilityQ(''); setPosFilter(''); setBoostAttr('')
  }, [])

  const selectedCap = selected ? captains.find(c => c.uuid === selected) : null

  return (
    <div className="cb-wrap">

      {/* ── Header ── */}
      <div className="cb-header">
        <div>
          <h2 className="cb-title">⚓ Captains Browser</h2>
          <p className="cb-subtitle">
            Browse all 66 captains · filter by position or boost attribute ·
            find the cheapest squad to activate each tier
          </p>
        </div>
        <button className="cb-refresh-btn" onClick={refresh} disabled={loading}>
          ↺ Refresh
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="cb-error">⚠ {error} — <button onClick={refresh}>Retry</button></div>
      )}

      {/* ── Filters ── */}
      <div className="cb-filters">
        <input
          className="cb-search-input"
          placeholder="Search captain name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <input
          className="cb-search-input"
          placeholder="Search ability / description…"
          value={abilityQ}
          onChange={e => setAbilityQ(e.target.value)}
        />

        <div className="cb-pos-filter">
          <button
            className={`cb-pos-btn ${posFilter === '' ? 'cb-pos-btn--active' : ''}`}
            onClick={() => setPosFilter('')}
          >All</button>
          {POSITIONS.map(p => (
            <button
              key={p}
              className={`cb-pos-btn ${posFilter === p ? 'cb-pos-btn--active' : ''}`}
              onClick={() => setPosFilter(posFilter === p ? '' : p)}
            >{p}</button>
          ))}
        </div>

        <div className="cb-filter-row2">
          <select
            className="cb-select"
            value={boostAttr}
            onChange={e => setBoostAttr(e.target.value)}
          >
            <option value="">All boost types</option>
            {allBoostAttrs.map(a => (
              <option key={a} value={a}>{fmtAttr(a)}</option>
            ))}
          </select>

          <select
            className="cb-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {(search || abilityQ || posFilter || boostAttr) && (
            <button className="cb-clear-btn" onClick={clearFilters}>✕ Clear</button>
          )}
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="cb-loading">
          <div className="cb-loading-bar-wrap">
            <div className="cb-loading-bar" style={{ width: progress > 0 ? `${Math.min(100, Math.round(progress / 66 * 100))}%` : '30%' }} />
          </div>
          <span className="cb-loading-label">Loading captains… {progress > 0 ? `${progress} / 66` : ''}</span>
        </div>
      )}

      {/* ── Results count ── */}
      {!loading && !error && (
        <div className="cb-count">
          {visible.length} captain{visible.length !== 1 ? 's' : ''}
          {visible.length !== captains.length && ` of ${captains.length}`}
        </div>
      )}

      {/* ── Captain grid ── */}
      {!loading && (
        <div className="cb-grid">
          {visible.map(cap => (
            <CaptainCard
              key={cap.uuid || cap.name}
              cap={cap}
              selected={selected === cap.uuid}
              onClick={() => setSelected(selected === cap.uuid ? null : cap.uuid)}
            />
          ))}
          {visible.length === 0 && !loading && (
            <div className="cb-empty">
              No captains match your filters.
              <button onClick={clearFilters} className="cb-clear-inline">Clear filters</button>
            </div>
          )}
        </div>
      )}

      {/* ── Detail panel ── */}
      {selectedCap && (
        <CaptainDetail
          cap={selectedCap}
          onClose={() => setSelected(null)}
          allListings={allListings}
        />
      )}
    </div>
  )
}
