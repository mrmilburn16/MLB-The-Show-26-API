import { useState, useMemo } from 'react'
import {
  useRosterUpdates,
  loadWatchList, saveWatchList,
  parseUpdateDate, daysUntil, ovrToRarity,
} from '../hooks/useRosterUpdates'
import { getCachedCatalog } from '../store/catalog'
import { RARITY_COLORS, getQuicksellFloor, QUICKSELL_LIVE, QUICKSELL_NON_LIVE } from '../constants'
import { fmt } from '../utils/format'

// ── Shared helpers ─────────────────────────────────────────────────
function rc(rarity) { return RARITY_COLORS[rarity] || RARITY_COLORS.Common }
function isLive(seriesId) { return String(seriesId) === '1337' }

function RarityBadge({ rarity, size }) {
  const c = rc(rarity)
  return (
    <span className="rarity-badge" style={{
      background: c.badge, color: c.text,
      fontSize: size === 'sm' ? 9 : undefined,
    }}>
      {(rarity || '?').toUpperCase()}
    </span>
  )
}

function OvrDeltaBadge({ delta }) {
  if (!delta) return null
  const col = delta > 0 ? '#4ade80' : '#f87171'
  return (
    <span className="ru-delta-badge" style={{ background: `${col}18`, color: col, borderColor: `${col}40` }}>
      {delta > 0 ? `+${delta}` : delta}
    </span>
  )
}

function TierBadge({ oldRarity, newRarity, up }) {
  return (
    <span className={`ru-tier-badge ${up ? 'ru-tier-badge--up' : 'ru-tier-badge--down'}`}>
      {up ? '⬆' : '⬇'}&nbsp;{oldRarity} → {newRarity}
    </span>
  )
}

function PlayerImg({ src, name }) {
  if (!src) return <div className="ru-player-img ru-player-img--ph" />
  return (
    <img className="ru-player-img" src={src} alt={name}
         onError={e => { e.currentTarget.style.display = 'none' }} />
  )
}

// ── Countdown banner ───────────────────────────────────────────────
function Countdown({ updateList }) {
  // Find the earliest future update
  const next = useMemo(() => {
    if (!updateList?.length) return null
    return updateList
      .map(u => ({ ...u, date: parseUpdateDate(u.date) }))
      .filter(u => u.date && daysUntil(u.date) >= 0)
      .sort((a, b) => a.date - b.date)[0]
  }, [updateList])

  if (!next) return null
  const days = daysUntil(next.date)

  return (
    <div className="ru-countdown">
      <span className="ru-countdown-icon">📅</span>
      <span className="ru-countdown-text">
        {days === 0 ? (
          <><strong>Today</strong> — {next.name || `Roster Update #${next.id}`}</>
        ) : (
          <>Next roster update in <strong>{days} day{days !== 1 ? 's' : ''}</strong>
          {next.date && <> · {next.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>}
          </>
        )}
      </span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// VIEW: Update timeline (left sidebar / top list)
// ═══════════════════════════════════════════════════════════════════

function UpdateTimeline({ updateList, loadingList, selectedId, onSelect, cachedStatuses }) {
  if (loadingList) {
    return (
      <div className="ru-timeline">
        <div className="ru-loading" style={{ justifyContent: 'flex-start', padding: 16 }}>
          <span className="auto-scan-dots"><span/><span/><span/></span> Loading…
        </div>
      </div>
    )
  }

  if (!updateList?.length) {
    return (
      <div className="ru-timeline">
        <div className="ru-timeline-empty">No roster updates found yet.<br/>Check back when the season begins.</div>
      </div>
    )
  }

  return (
    <div className="ru-timeline">
      <div className="ru-timeline-label">All Updates</div>
      {updateList.map(u => {
        const isActive   = u.id === selectedId
        const status     = cachedStatuses[u.id]   // 'released' | 'pending' | undefined
        const d          = parseUpdateDate(u.date)
        const days       = daysUntil(d)
        const isFuture   = days != null && days > 0

        return (
          <button
            key={u.id}
            className={`ru-timeline-item ${isActive ? 'ru-timeline-item--active' : ''} ${isFuture ? 'ru-timeline-item--future' : ''}`}
            onClick={() => onSelect(u.id)}
          >
            <span className="ru-tl-dot">
              {status === 'released' ? '✓' : isFuture ? '○' : '·'}
            </span>
            <span className="ru-tl-body">
              <span className="ru-tl-name">{u.name || `Roster Update #${u.id}`}</span>
              {u.date && <span className="ru-tl-date">{u.date}</span>}
              {isFuture && days != null && (
                <span className="ru-tl-days">in {days}d</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Not-yet-released placeholder
// ═══════════════════════════════════════════════════════════════════

function UnreleasedPanel({ update }) {
  const d    = parseUpdateDate(update?.date)
  const days = daysUntil(d)

  return (
    <div className="ru-unreleased">
      <div className="ru-unreleased-icon">🗓️</div>
      <div className="ru-unreleased-title">
        {update?.name || `Roster Update #${update?.id}`}
      </div>
      <div className="ru-unreleased-sub">
        This roster update hasn't been released yet.
      </div>
      {update?.date && (
        <div className="ru-unreleased-date">
          <strong>Scheduled:</strong> {update.date}
          {days != null && days >= 0 && (
            <span className="ru-unreleased-days">
              {days === 0 ? ' · Today!' : ` · ${days} day${days !== 1 ? 's' : ''} away`}
            </span>
          )}
        </div>
      )}
      <div className="ru-unreleased-note">
        Roster updates typically happen every two weeks during the MLB season.
        Prices on cards likely to be upgraded tend to rise in the days before a release.
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Attribute changes table
// ═══════════════════════════════════════════════════════════════════

function AttrChangesTable({ rows, listingMap }) {
  const [sortKey, setSortKey] = useState('ovrDelta')
  const [sortDir, setSortDir] = useState('desc')
  const [filter,  setFilter]  = useState('all')  // 'all' | 'up' | 'down' | 'tier'

  const sorted = useMemo(() => {
    let base = [...rows]
    if (filter === 'up')   base = base.filter(p => (p.ovrDelta ?? 0) > 0)
    if (filter === 'down') base = base.filter(p => (p.ovrDelta ?? 0) < 0)
    if (filter === 'tier') base = base.filter(p => p.tierUp || p.tierDown)

    base.sort((a, b) => {
      let av, bv
      if (sortKey === 'ovrDelta') { av = a.ovrDelta ?? 0; bv = b.ovrDelta ?? 0 }
      else if (sortKey === 'newOvr') { av = a.newOvr ?? 0; bv = b.newOvr ?? 0 }
      else if (sortKey === 'name') {
        return sortDir === 'asc'
          ? (a.name || '').localeCompare(b.name || '')
          : (b.name || '').localeCompare(a.name || '')
      } else { av = 0; bv = 0 }
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return base
  }, [rows, filter, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortTh = ({ col, children }) => (
    <th className={`ru-th ru-th--sort ${sortKey === col ? 'ru-th--active' : ''}`}
        onClick={() => toggleSort(col)}>
      {children}{sortKey === col ? (sortDir === 'desc' ? ' ▾' : ' ▴') : ''}
    </th>
  )

  const upgraded   = rows.filter(p => (p.ovrDelta ?? 0) > 0).length
  const downgraded = rows.filter(p => (p.ovrDelta ?? 0) < 0).length
  const tierCount  = rows.filter(p => p.tierUp || p.tierDown).length

  return (
    <div className="ru-section">
      <div className="ru-section-head">
        <span className="ct-section-title">Attribute Changes</span>
        <div className="ru-filter-pills">
          {[
            { key: 'all',  label: `All (${rows.length})` },
            { key: 'tier', label: `⬆⬇ Tier Changes (${tierCount})` },
            { key: 'up',   label: `+OVR (${upgraded})` },
            { key: 'down', label: `−OVR (${downgraded})` },
          ].map(f => (
            <button key={f.key}
                    className={`ru-pill ${filter === f.key ? 'ru-pill--active' : ''} ${f.key === 'up' ? 'ru-pill--up' : f.key === 'down' ? 'ru-pill--down' : f.key === 'tier' ? 'ru-pill--tier-up' : ''}`}
                    onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ct-table-wrap">
        <table className="ct-table">
          <thead>
            <tr>
              <th className="ru-th" style={{ textAlign: 'left', minWidth: 200 }}>Player</th>
              <SortTh col="ovrDelta">Δ OVR</SortTh>
              <SortTh col="newOvr">New OVR</SortTh>
              <th className="ru-th">Old OVR</th>
              <th className="ru-th">Rarity</th>
              <th className="ru-th" style={{ textAlign: 'left' }}>Attribute Changes</th>
              <th className="ru-th">Market Price</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const rarityC    = rc(p.newRarity)
              const listing    = p.uuid ? listingMap.get(p.uuid) : null
              const bigAttrs   = [...p.attrChanges]
                .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
                .slice(0, 4)
              const isTierChange = p.tierUp || p.tierDown

              return (
                <tr key={i}
                    className={`ct-row ${p.tierUp ? 'ru-row--tier-up' : ''} ${p.tierDown ? 'ru-row--tier-down' : ''}`}>
                  <td className="ct-td" style={{ textAlign: 'left' }}>
                    <div className="card-cell">
                      <PlayerImg src={p.img} name={p.name} />
                      <div>
                        <div className="card-name">{p.name}</div>
                        <div className="card-meta">
                          <span className="team-name">{p.team}</span>
                          <span className="series-name">{p.position}</span>
                          {isTierChange && (
                            <TierBadge oldRarity={p.oldRarity} newRarity={p.newRarity} up={p.tierUp} />
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="ct-td" style={{ textAlign: 'center' }}>
                    <OvrDeltaBadge delta={p.ovrDelta} />
                  </td>
                  <td className="ct-td mono" style={{ color: rarityC.glow, fontWeight: 700, fontSize: 15 }}>
                    {p.newOvr ?? '—'}
                  </td>
                  <td className="ct-td mono" style={{ color: '#5a7a9a' }}>{p.oldOvr ?? '—'}</td>
                  <td className="ct-td">
                    {isTierChange ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <RarityBadge rarity={p.oldRarity} size="sm" />
                        <RarityBadge rarity={p.newRarity} />
                      </div>
                    ) : (
                      <RarityBadge rarity={p.newRarity} />
                    )}
                  </td>
                  <td className="ct-td" style={{ textAlign: 'left' }}>
                    <div className="ru-attr-changes">
                      {bigAttrs.map((a, ai) => (
                        <span key={ai} className="ru-attr-chip"
                              style={{ color: a.delta > 0 ? '#4ade80' : '#f87171' }}>
                          {a.name}: {a.delta > 0 ? '+' : ''}{a.delta}
                        </span>
                      ))}
                      {p.attrChanges.length > 4 && (
                        <span className="ru-attr-more">+{p.attrChanges.length - 4} more</span>
                      )}
                      {p.attrChanges.length === 0 && (
                        <span className="muted" style={{ fontSize: 11 }}>OVR only</span>
                      )}
                    </div>
                  </td>
                  <td className="ct-td mono sell-color" style={{ fontWeight: 600 }}>
                    {listing
                      ? fmt(listing.best_sell_price)
                      : <span className="muted">—</span>}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="ct-td"
                    style={{ textAlign: 'center', color: '#3a5a7a', padding: 24 }}>
                  No players in this view
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Position changes table
// ═══════════════════════════════════════════════════════════════════

function PosChangesTable({ rows, listingMap }) {
  if (!rows?.length) return null
  return (
    <div className="ru-section">
      <div className="ct-section-title">Position Changes</div>
      <div className="ct-table-wrap">
        <table className="ct-table">
          <thead>
            <tr>
              <th className="ru-th" style={{ textAlign: 'left' }}>Player</th>
              <th className="ru-th">Old Position</th>
              <th className="ru-th">New Position</th>
              <th className="ru-th">OVR</th>
              <th className="ru-th">Market Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const listing = p.uuid ? listingMap.get(p.uuid) : null
              const rarityC = rc(p.rarity ?? ovrToRarity(p.ovr))
              return (
                <tr key={i} className="ct-row">
                  <td className="ct-td" style={{ textAlign: 'left' }}>
                    <div className="card-cell">
                      <PlayerImg src={p.img} name={p.name} />
                      <div>
                        <div className="card-name">{p.name}</div>
                        <div className="card-meta"><span className="team-name">{p.team}</span></div>
                      </div>
                    </div>
                  </td>
                  <td className="ct-td" style={{ color: '#7a9ab5' }}>{p.oldPosition || '—'}</td>
                  <td className="ct-td" style={{ color: '#a0d4ff', fontWeight: 700 }}>
                    {p.newPosition || '—'}
                    <span className="ru-pos-arrow"> ←</span>
                  </td>
                  <td className="ct-td mono" style={{ color: rarityC.glow, fontWeight: 700 }}>
                    {p.ovr ?? '—'}
                  </td>
                  <td className="ct-td mono sell-color">
                    {listing ? fmt(listing.best_sell_price) : <span className="muted">—</span>}
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

// ═══════════════════════════════════════════════════════════════════
// Newly added cards
// ═══════════════════════════════════════════════════════════════════

function NewlyAddedTable({ rows, listingMap }) {
  if (!rows?.length) return null
  return (
    <div className="ru-section">
      <div className="ct-section-title">✦ Newly Added Cards</div>
      <div className="ct-table-wrap">
        <table className="ct-table">
          <thead>
            <tr>
              <th className="ru-th" style={{ textAlign: 'left' }}>Card</th>
              <th className="ru-th">OVR</th>
              <th className="ru-th">POS</th>
              <th className="ru-th">Rarity</th>
              <th className="ru-th">Market Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const listing = p.uuid ? listingMap.get(p.uuid) : null
              const rar     = p.rarity ?? ovrToRarity(p.ovr)
              const rarityC = rc(rar)
              return (
                <tr key={i} className="ct-row">
                  <td className="ct-td" style={{ textAlign: 'left' }}>
                    <div className="card-cell">
                      <PlayerImg src={p.img} name={p.name} />
                      <div>
                        <div className="card-name">{p.name}</div>
                        <div className="card-meta"><span className="team-name">{p.team}</span></div>
                      </div>
                    </div>
                  </td>
                  <td className="ct-td mono" style={{ color: rarityC.glow, fontWeight: 700 }}>
                    {p.ovr ?? '—'}
                  </td>
                  <td className="ct-td" style={{ color: '#aab' }}>{p.position || '—'}</td>
                  <td className="ct-td"><RarityBadge rarity={rar} /></td>
                  <td className="ct-td mono sell-color">
                    {listing ? fmt(listing.best_sell_price) : <span className="muted">—</span>}
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

// ═══════════════════════════════════════════════════════════════════
// Released update detail panel
// ═══════════════════════════════════════════════════════════════════

function UpdateDetail({ detail, listingMap }) {
  const totalChanged = detail.totalChanged
  const tierChanges  = detail.tierUps.length + detail.tierDowns.length

  return (
    <div className="ru-detail">
      {/* Summary bar */}
      <div className="ru-detail-summary">
        {detail.name && <span className="ru-update-name">{detail.name}</span>}
        {detail.date && <span className="ru-update-date">{detail.date}</span>}
        <div className="ru-summary-pills" style={{ marginLeft: 'auto' }}>
          {totalChanged > 0 && (
            <span className="ru-pill">{totalChanged} rated</span>
          )}
          {tierChanges > 0 && (
            <span className="ru-pill ru-pill--tier-up">⬆⬇ {tierChanges} tier</span>
          )}
          {detail.posChanges?.length > 0 && (
            <span className="ru-pill">↔ {detail.posChanges.length} position</span>
          )}
          {detail.newlyAdded?.length > 0 && (
            <span className="ru-pill">✦ {detail.newlyAdded.length} new</span>
          )}
        </div>
      </div>

      {/* Tier-change highlight strip */}
      {(detail.tierUps.length > 0 || detail.tierDowns.length > 0) && (
        <div className="ru-tier-band">
          <span className="ru-tier-band-label">🚀 Tier Changes — biggest price movers</span>
          <div className="ru-tier-cards">
            {[...detail.tierUps, ...detail.tierDowns].map((p, i) => {
              const listing = p.uuid ? listingMap.get(p.uuid) : null
              const rarityC = rc(p.newRarity)
              return (
                <div key={i} className="ru-tier-card">
                  <PlayerImg src={p.img} name={p.name} />
                  <div className="ru-tier-card-body">
                    <div className="ru-tier-card-name">{p.name}</div>
                    <div className="ru-tier-card-meta">{p.team} · {p.position}</div>
                    <TierBadge oldRarity={p.oldRarity} newRarity={p.newRarity} up={p.tierUp} />
                    <div className="ru-tier-ovr">
                      <span style={{ color: '#6a8aaa' }}>{p.oldOvr}</span>
                      <span className="ru-tier-arrow">→</span>
                      <span style={{ color: rarityC.glow, fontWeight: 700 }}>{p.newOvr}</span>
                      <OvrDeltaBadge delta={p.ovrDelta} />
                    </div>
                    {listing && (
                      <div className="ru-tier-market">
                        <span className="ru-label">Buy Now</span>
                        <span className="sell-color mono">{fmt(listing.best_sell_price)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main tables */}
      {detail.attrChanges?.length > 0 && (
        <AttrChangesTable rows={detail.attrChanges} listingMap={listingMap} />
      )}
      {detail.posChanges?.length > 0 && (
        <PosChangesTable rows={detail.posChanges} listingMap={listingMap} />
      )}
      {detail.newlyAdded?.length > 0 && (
        <NewlyAddedTable rows={detail.newlyAdded} listingMap={listingMap} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Watch List
// ═══════════════════════════════════════════════════════════════════

function WatchListView({ listingMap }) {
  const [watchList, setWatchList] = useState(loadWatchList)
  const [search,    setSearch]    = useState('')
  const [notes,     setNotes]     = useState({})  // uuid → draft

  const catalog = getCachedCatalog() || []
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return catalog
      .filter(c => (c.listing_name || c.name || '').toLowerCase().includes(q))
      .slice(0, 10)
  }, [search, catalog])

  function addCard(item) {
    if (watchList.some(w => w.uuid === item.uuid)) return
    const entry = {
      uuid:     item.uuid,
      name:     item.listing_name || item.name,
      ovr:      parseInt(item.ovr, 10) || null,
      rarity:   item.rarity,
      team:     item.team,
      position: item.display_position,
      img:      item.baked_img || item.img,
      seriesId: item.series_id,
      note:     '',
      targetOvr: null,
      addedAt:  Date.now(),
    }
    const next = [entry, ...watchList]
    setWatchList(next)
    saveWatchList(next)
    setSearch('')
  }

  function removeCard(uuid) {
    const next = watchList.filter(w => w.uuid !== uuid)
    setWatchList(next)
    saveWatchList(next)
  }

  function saveNote(uuid) {
    const note = notes[uuid] ?? ''
    const next = watchList.map(w => w.uuid === uuid ? { ...w, note } : w)
    setWatchList(next)
    saveWatchList(next)
    setNotes(n => { const c = { ...n }; delete c[uuid]; return c })
  }

  function setTarget(uuid, val) {
    const next = watchList.map(w => w.uuid === uuid ? { ...w, targetOvr: val ? +val : null } : w)
    setWatchList(next)
    saveWatchList(next)
  }

  return (
    <div className="ru-watchlist-view">
      <div className="ct-section-title">⭐ Upgrade Watch List</div>
      <p className="ru-watchlist-desc">
        Track cards you expect to get upgraded. See the quicksell floor jump at each OVR threshold.
        Cards at OVR 84 are one upgrade away from Diamond — the biggest price movers.
      </p>

      {/* Search */}
      <div className="ru-search-wrap">
        <input className="ru-search-input" type="text"
               placeholder="Search for a card to watch… (type 2+ characters)"
               value={search} onChange={e => setSearch(e.target.value)} />
        {catalog.length === 0 && (
          <span className="ru-search-note">Visit Card Finder first to load the card catalog</span>
        )}
      </div>

      {searchResults.length > 0 && (
        <div className="ru-search-results">
          {searchResults.map(item => {
            const rarityC = rc(item.rarity)
            const already = watchList.some(w => w.uuid === item.uuid)
            return (
              <button key={item.uuid} className="ru-search-result-row"
                      onClick={() => addCard(item)} disabled={already}>
                {(item.baked_img || item.img) && (
                  <img className="ru-result-img" src={item.baked_img || item.img} alt=""
                       onError={e => { e.currentTarget.style.display = 'none' }} />
                )}
                <span className="ru-result-name">{item.listing_name || item.name}</span>
                <span className="ru-result-meta">{item.team} · {item.display_position}</span>
                <span style={{ color: rarityC.glow, fontFamily: 'monospace', fontWeight: 700 }}>
                  {item.ovr} OVR
                </span>
                <RarityBadge rarity={item.rarity} size="sm" />
                {already
                  ? <span className="ru-already-added">Watching</span>
                  : <span className="ru-add-btn">+ Watch</span>}
              </button>
            )
          })}
        </div>
      )}

      {watchList.length === 0 ? (
        <div className="gh-idle" style={{ marginTop: 32 }}>
          <div className="gh-idle-icon">⭐</div>
          <div className="gh-idle-title">No cards on your watch list</div>
          <div className="gh-idle-sub">Search for a card above to start tracking upgrade potential.</div>
        </div>
      ) : (
        <div className="ru-watchlist-cards">
          {watchList.map(w => {
            const listing  = w.uuid ? listingMap.get(w.uuid) : null
            const live     = isLive(w.seriesId)
            const table    = live ? QUICKSELL_LIVE : QUICKSELL_NON_LIVE
            const curFloor = getQuicksellFloor(w.ovr, live)
            const rarityC  = rc(w.rarity)
            const toDiamond = w.ovr < 85 ? 85 - w.ovr : null
            const isEditing = notes[w.uuid] !== undefined

            // Build OVR projection rows: current to +4
            const projRows = []
            for (let ovr = w.ovr; ovr <= Math.min(92, w.ovr + 4); ovr++) {
              projRows.push({ ovr, floor: table[ovr] ?? null })
            }

            return (
              <div key={w.uuid} className="ru-watch-card">
                {/* Left: player info */}
                <div className="ru-watch-left">
                  <PlayerImg src={w.img} name={w.name} />
                  <div>
                    <div className="ru-watch-name">{w.name}</div>
                    <div className="ru-watch-meta">
                      <span className="team-name">{w.team}</span>
                      <span style={{ color: '#aab' }}>{w.position}</span>
                      <RarityBadge rarity={w.rarity} size="sm" />
                      <span style={{ color: rarityC.glow, fontFamily: 'monospace', fontWeight: 700 }}>
                        {w.ovr} OVR
                      </span>
                    </div>
                    {toDiamond === 1 && (
                      <div className="ru-to-diamond">⚡ One upgrade away from Diamond!</div>
                    )}
                    {toDiamond > 1 && (
                      <div className="ru-to-diamond ru-to-diamond--far">{toDiamond} OVR below Diamond</div>
                    )}
                  </div>
                </div>

                {/* Right: stats + projection */}
                <div className="ru-watch-right">
                  <div className="ru-watch-stats">
                    <div className="ru-watch-stat">
                      <span className="ct-stat-label">MARKET</span>
                      <span className="ct-stat-val sell-color">
                        {listing ? fmt(listing.best_sell_price) : <span className="muted">—</span>}
                      </span>
                    </div>
                    <div className="ru-watch-stat">
                      <span className="ct-stat-label">QS NOW</span>
                      <span className="ct-stat-val">
                        {curFloor ? fmt(curFloor) : <span className="muted">None</span>}
                      </span>
                    </div>
                  </div>

                  {/* QS Projection */}
                  <div>
                    <div className="ru-qs-label">Quicksell if upgraded to…</div>
                    <div className="ru-qs-table">
                      {projRows.map(({ ovr, floor }) => {
                        const isCur    = ovr === w.ovr
                        const isTgt    = ovr === w.targetOvr
                        const prevFloor = projRows.find(r => r.ovr === ovr - 1)?.floor ?? null
                        const jump = floor && prevFloor ? floor - prevFloor : floor && !curFloor ? floor : null
                        return (
                          <div key={ovr}
                               className={`ru-qs-row ${isCur ? 'ru-qs-row--current' : ''} ${isTgt ? 'ru-qs-row--target' : ''}`}>
                            <span className="ru-qs-ovr">{ovr}</span>
                            <span className="ru-qs-rarity"
                                  style={{ color: ovr >= 85 ? rc('Diamond').glow : rc('Gold').glow }}>
                              {ovr >= 85 ? 'DIA' : 'GOLD'}
                            </span>
                            <span className="ru-qs-floor-val">{floor ? fmt(floor) : '—'}</span>
                            {!isCur && jump != null && (
                              <span className="ru-qs-jump">+{fmt(jump)}</span>
                            )}
                            {isCur  && <span className="ru-qs-cur-tag">NOW</span>}
                            {isTgt  && !isCur && <span className="ru-qs-target-tag">TARGET</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Target OVR */}
                  <div className="ru-target-wrap">
                    <label className="ct-stat-label">TARGET OVR</label>
                    <input type="number" className="cf-num-input" style={{ width: 60 }}
                           value={w.targetOvr || ''} min={w.ovr + 1} max={99}
                           placeholder="—"
                           onChange={e => setTarget(w.uuid, e.target.value)} />
                  </div>

                  {/* Notes */}
                  {!isEditing ? (
                    <button className="ru-note-display"
                            onClick={() => setNotes(n => ({ ...n, [w.uuid]: w.note || '' }))}>
                      {w.note
                        ? <span className="ru-note-text">📝 {w.note}</span>
                        : <span className="ru-note-add">+ Add note</span>}
                    </button>
                  ) : (
                    <div className="ru-note-edit">
                      <textarea className="ru-note-input" rows={2}
                                value={notes[w.uuid]}
                                onChange={e => setNotes(n => ({ ...n, [w.uuid]: e.target.value }))}
                                placeholder="Why are you watching this card?" />
                      <button className="cf-search-btn" style={{ marginTop: 4, fontSize: 11 }}
                              onClick={() => saveNote(w.uuid)}>Save</button>
                    </div>
                  )}
                </div>

                <button className="ru-remove-btn" title="Remove" onClick={() => removeCard(w.uuid)}>✕</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Root component
// ═══════════════════════════════════════════════════════════════════

export default function RosterUpdates({ allListings }) {
  const {
    updateList, loadingList,
    selectedId, detail, loadingDetail,
    error, selectUpdate,
  } = useRosterUpdates()

  const [view, setView] = useState('updates')  // 'updates' | 'watchlist'

  // Quick lookup of which updates have released data (from the detail cache)
  const cachedStatuses = useMemo(() => {
    const s = {}
    updateList?.forEach(u => {
      // detail is set after fetchDetail; we can only know for the currently selected one
      if (u.id === selectedId) s[u.id] = detail ? 'released' : 'pending'
    })
    return s
  }, [updateList, selectedId, detail])

  // Find the selected update's list entry (for date info on the unreleased panel)
  const selectedListEntry = useMemo(
    () => updateList?.find(u => u.id === selectedId) ?? null,
    [updateList, selectedId]
  )

  const listingMap = useMemo(() => {
    const m = new Map()
    allListings?.forEach(l => {
      const uuid = l.uuid || l.item?.uuid
      if (uuid) m.set(uuid, l)
    })
    return m
  }, [allListings])

  const VIEWS = [
    { key: 'updates',   label: '📋 Updates'    },
    { key: 'watchlist', label: '⭐ Watch List'  },
  ]

  return (
    <div className="ru-wrap">

      {/* Header */}
      <div className="ct-headline">
        <strong>Roster Update Tracker</strong>
        <span className="ct-headline-sep">·</span>
        <span className="ct-headline-stat">Rating changes · Price movers · Upgrade watch list</span>
        {!allListings?.length && (
          <span className="ct-headline-warn">⚠ Market prices unavailable — run a Full Scan first</span>
        )}
      </div>

      {/* Countdown to next update */}
      <Countdown updateList={updateList} />

      {error && <div className="gh-error"><span>⚠</span><span>{error}</span></div>}

      {/* Inner view tabs */}
      <div className="ct-view-tabs" style={{ marginBottom: 0 }}>
        {VIEWS.map(v => (
          <button key={v.key}
                  className={`ct-view-tab ${view === v.key ? 'ct-view-tab--active' : ''}`}
                  onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'watchlist' && <WatchListView listingMap={listingMap} />}

      {view === 'updates' && (
        <div className="ru-layout">

          {/* Timeline sidebar */}
          <UpdateTimeline
            updateList={updateList}
            loadingList={loadingList}
            selectedId={selectedId}
            onSelect={selectUpdate}
            cachedStatuses={cachedStatuses}
          />

          {/* Detail panel */}
          <div className="ru-detail-wrap">
            {loadingDetail && (
              <div className="ru-loading">
                <span className="auto-scan-dots"><span/><span/><span/></span>
                Loading roster update…
              </div>
            )}

            {/* Not yet fetched */}
            {!loadingDetail && detail === undefined && !selectedId && (
              <div className="gh-idle" style={{ marginTop: 48 }}>
                <div className="gh-idle-icon">📋</div>
                <div className="gh-idle-title">Select a roster update</div>
                <div className="gh-idle-sub">Choose an update from the list on the left.</div>
              </div>
            )}

            {/* Unreleased */}
            {!loadingDetail && detail === null && (
              <UnreleasedPanel update={selectedListEntry} />
            )}

            {/* Released data */}
            {!loadingDetail && detail != null && (
              <UpdateDetail detail={detail} listingMap={listingMap} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
