import { useState, useMemo, useEffect, useRef } from 'react'
import { useMarketScan, DETAIL_COUNT } from '../hooks/useMarketScan'
import { fmt, fmtProfit, rarityColors, profitClass } from '../utils/format'

// ── Helpers ────────────────────────────────────────────────────

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  return `${hr}h ${min % 60}m ago`
}

function buildFilterSummary(filters) {
  const parts = []
  if (filters.rarity)   parts.push(filters.rarity)
  if (filters.position) parts.push(filters.position)
  if (filters.team)     parts.push(filters.team)
  if (filters.name)     parts.push(`"${filters.name}"`)
  if (filters.set)      parts.push(filters.set)
  const hasBuy  = filters.minBuyPrice  || filters.maxBuyPrice
  const hasSell = filters.minSellPrice || filters.maxSellPrice
  if (hasBuy)  parts.push(`Buy ${filters.minBuyPrice || '0'}–${filters.maxBuyPrice || '∞'}`)
  if (hasSell) parts.push(`Sell ${filters.minSellPrice || '0'}–${filters.maxSellPrice || '∞'}`)
  if (filters.minRank || filters.maxRank)
    parts.push(`OVR ${filters.minRank || '0'}–${filters.maxRank || '∞'}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

function hasNarrowingFilters(filters) {
  return !!(
    filters.rarity || filters.position || filters.team ||
    filters.minBuyPrice || filters.maxBuyPrice ||
    filters.minSellPrice || filters.maxSellPrice
  )
}

// ── Sort columns ───────────────────────────────────────────────

const SORT_COLS = [
  { key: 'best_buy_price',  label: 'BUY'       },
  { key: 'best_sell_price', label: 'SELL'       },
  { key: '_profitAfterTax', label: 'PROFIT'     },
  { key: '_roi',            label: 'ROI %'      },
  { key: '_spreadPct',      label: 'SPREAD %'   },
  { key: '_profitPerMin',   label: 'PROFIT/MIN', vel: true },
  { key: '_salesPerMin',    label: 'SALES/MIN',  vel: true },
  { key: '_snipeDiscount',  label: 'SNIPE %',    vel: true },
]

// ── Sub-components ─────────────────────────────────────────────

function SortArrow({ active, dir }) {
  if (!active) return <span style={{ opacity: 0.2, fontSize: 10 }}>↕</span>
  return <span style={{ fontSize: 10 }}>{dir === 'desc' ? '▼' : '▲'}</span>
}

function VelCell({ value, loaded, formatter, color = '#c8d6e5' }) {
  if (!loaded) return <span className="fms-vel-placeholder">—</span>
  if (value == null) return <span style={{ color: '#445', fontSize: 11 }}>—</span>
  return <span style={{ color }}>{formatter(value)}</span>
}

// ── Scan Progress ──────────────────────────────────────────────

function ScanProgress({ status, progress }) {
  const { listingPage, listingTotal, listingCount, detailDone, detailTotal } = progress
  const isPhase1 = status === 'listing-pages'
  const isPhase2 = status === 'detail-fetch'

  return (
    <div className="fms-scan-status">
      {isPhase1 && (
        <div className="fms-status-line">
          <span className="fms-status-dots"><span/><span/><span/></span>
          <span className="fms-status-text">
            Fetching page <strong>{listingPage}</strong> / {listingTotal || '?'}
            &ensp;·&ensp;
            <strong>{listingCount.toLocaleString()}</strong> cards found so far
          </span>
        </div>
      )}
      {isPhase2 && (
        <div className="fms-status-line fms-status-line--vel">
          <span className="fms-status-dots fms-status-dots--vel"><span/><span/><span/></span>
          <span className="fms-status-text">
            Calculating velocity&ensp;
            <strong>{detailDone}</strong> / {detailTotal}
            &ensp;·&ensp;table sorts live as data arrives
          </span>
        </div>
      )}
    </div>
  )
}

// ── Results Table ──────────────────────────────────────────────

function ResultsTable({ results, sort, onSort, velCount }) {
  return (
    <div className="fms-results">
      <div className="fms-results-meta">
        <span className="fms-results-count">
          <strong>{results.length.toLocaleString()}</strong> profitable cards
        </span>
        <span className="fms-vel-note">
          ⚡ Velocity for top {DETAIL_COUNT}&ensp;·&ensp;
          {velCount} / {Math.min(results.length, DETAIL_COUNT)} loaded
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'center', width: 40 }}>#</th>
              <th style={{ textAlign: 'left', minWidth: 220 }}>CARD</th>
              <th>OVR</th>
              {SORT_COLS.map(col => (
                <th
                  key={col.key}
                  className="sortable"
                  onClick={() => onSort(col.key)}
                  style={col.vel ? { color: '#4da6ff' } : {}}
                >
                  {col.label} <SortArrow active={sort.key === col.key} dir={sort.dir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((l, i) => {
              const item   = l.item || {}
              const r      = rarityColors(item.rarity)
              const imgSrc = item.baked_img || item.img || ''
              const uuid   = l.uuid || l.item?.uuid
              const pc     = profitClass(l._profitAfterTax)

              const isSnipe     = (l._snipeDiscount ?? 0) >= 10
              const isSnipeGood = (l._snipeDiscount ?? 0) >= 5 && !isSnipe
              const rowClass    = isSnipe ? 'row-snipe' : isSnipeGood ? 'row-snipe-good' : ''

              const ppmColor = !l._velocityLoaded ? '#c8d6e5'
                : (l._profitPerMin ?? 0) >= 5000 ? '#4ade80'
                : (l._profitPerMin ?? 0) >= 1000 ? '#fbbf24'
                : '#c8d6e5'

              return (
                <tr key={uuid || i} className={rowClass}
                  style={{ borderLeft: `3px solid ${r.glow}` }}>

                  <td style={{ textAlign: 'center', color: '#445', fontSize: 11, width: 40 }}>
                    {i + 1}
                  </td>

                  <td style={{ textAlign: 'left' }}>
                    <div className="card-cell">
                      {imgSrc && (
                        <img className="card-img" src={imgSrc} alt=""
                          onError={e => { e.currentTarget.style.display = 'none' }} />
                      )}
                      <div>
                        <div className="card-name">{l.listing_name || item.name}</div>
                        <div className="card-meta">
                          <span className="rarity-badge"
                            style={{ background: r.badge, color: r.text }}>
                            {(item.rarity || '').toUpperCase()}
                          </span>
                          {item.team   && <span className="team-name">{item.team}</span>}
                          {item.series && <span className="series-name">{item.series}</span>}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td style={{ fontWeight: 700, color: r.glow, fontSize: 15 }}>
                    {item.ovr || '—'}
                  </td>

                  <td className="mono buy-color" style={{ fontWeight: 600 }}>
                    {fmt(l.best_buy_price)}
                  </td>

                  <td className="mono sell-color" style={{ fontWeight: 600 }}>
                    {fmt(l.best_sell_price)}
                  </td>

                  <td className={`mono ${pc}`} style={{ fontWeight: 700 }}>
                    {fmtProfit(l._profitAfterTax)}
                  </td>

                  <td className="mono" style={{ color: l._roi > 10 ? '#4ade80' : '#8abadd' }}>
                    {l._roi != null ? `${l._roi.toFixed(1)}%` : '—'}
                  </td>

                  <td className="mono" style={{ color: '#fbbf24', fontSize: 12 }}>
                    {l._spreadPct != null ? `${l._spreadPct.toFixed(1)}%` : '—'}
                  </td>

                  <td className="mono" style={{ fontWeight: 700 }}>
                    <VelCell
                      value={l._profitPerMin}
                      loaded={l._velocityLoaded}
                      formatter={v => `${v >= 0 ? '+' : ''}${Math.round(v).toLocaleString()}`}
                      color={ppmColor}
                    />
                  </td>

                  <td className="mono" style={{ fontSize: 12 }}>
                    <VelCell
                      value={l._salesPerMin}
                      loaded={l._velocityLoaded}
                      formatter={v => v < 0.01 ? '<0.01' : v.toFixed(2)}
                      color="#34d399"
                    />
                  </td>

                  <td>
                    <VelCell
                      value={l._snipeDiscount}
                      loaded={l._velocityLoaded}
                      formatter={v => `${v >= 10 ? '🎯 ' : ''}${v.toFixed(1)}%`}
                      color={isSnipe ? '#4ade80' : isSnipeGood ? '#fbbf24' : '#c8d6e5'}
                    />
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

// ── Idle State ─────────────────────────────────────────────────

function IdleTips({ filters, onScan }) {
  const hasFilters   = hasNarrowingFilters(filters)
  const isMlbCard    = !filters.type || filters.type === 'mlb_card'
  const showWarning  = isMlbCard && !hasFilters
  const filterSummary = buildFilterSummary(filters)

  return (
    <div className="fms-idle-wrap">
      <div className="fms-idle-hero">
        <div className="fms-idle-icon">🔭</div>
        <div className="fms-idle-title">Full Market Scan</div>
        <div className="fms-idle-sub">
          Fetch every card matching your filters, then sort by <em>any</em> metric —
          profit/min, snipe%, spread% — across the entire market.
          Velocity data auto-loads for the top {DETAIL_COUNT} cards.
        </div>
      </div>

      {filterSummary && (
        <div className="fms-idle-filter-summary">
          <span className="fms-idle-filter-label">Active filters:</span>
          <span className="fms-idle-filter-val">{filterSummary}</span>
        </div>
      )}

      {showWarning ? (
        <div className="fms-large-warn">
          <span className="fms-large-warn-icon">⚠</span>
          <div>
            <strong>No filters set</strong> — scanning MLB cards will fetch <strong>60+ pages</strong> and
            take <strong>30–45 seconds</strong>.
            <br />
            Set a rarity or price range above to dramatically speed this up.
            You can still scan without filters.
          </div>
        </div>
      ) : (
        <div className="fms-idle-hint">
          <span>✓</span>
          <span>
            {hasFilters
              ? 'Filters will narrow the scan — fewer pages = faster results.'
              : 'Set rarity or price filters above to narrow the scan.'}
          </span>
        </div>
      )}

      <div className="fms-idle-steps">
        <div className="fms-step">
          <span className="fms-step-num">1</span>
          <span>All listing pages are fetched in parallel, 3 at a time</span>
        </div>
        <div className="fms-step">
          <span className="fms-step-num">2</span>
          <span>Results appear immediately — sorted by profit while velocity loads</span>
        </div>
        <div className="fms-step">
          <span className="fms-step-num">3</span>
          <span>Top {DETAIL_COUNT} cards get velocity data — table auto-sorts to profit/min when done</span>
        </div>
      </div>

      <button
        className={`fms-scan-btn${showWarning ? ' fms-scan-btn--warn' : ''}`}
        onClick={onScan}
      >
        {showWarning ? '⚠ Scan Full Market (slow)' : '▶ Scan Market'}
      </button>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export default function FullMarketScan({ filters }) {
  const {
    status, progress, allListings, velocityMap,
    scanTimestamp, scanFilters, error, scan, abort, reset,
  } = useMarketScan()

  const [sort, setSort] = useState({ key: '_profitAfterTax', dir: 'desc' })

  // Client-side result filters (don't re-fetch, just re-filter cached data)
  const [localFilters, setLocalFilters] = useState({ minProfit: '', minSalesPerMin: '' })

  // Tick every 30s to refresh "X minutes ago"
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const scanning  = status === 'listing-pages' || status === 'detail-fetch'
  const isDone    = status === 'done'
  const hasData   = allListings.length > 0

  // Auto-switch to profit/min sort when Phase 2 finishes
  const prevStatusRef = useRef(status)
  useEffect(() => {
    if (prevStatusRef.current === 'detail-fetch' && status === 'done') {
      setSort(prev =>
        prev.key === '_profitAfterTax'
          ? { key: '_profitPerMin', dir: 'desc' }
          : prev
      )
    }
    prevStatusRef.current = status
  }, [status])

  const filtersChanged = hasData && scanFilters &&
    JSON.stringify(filters) !== JSON.stringify(scanFilters)

  function handleScan() {
    setSort({ key: '_profitAfterTax', dir: 'desc' })
    setLocalFilters({ minProfit: '', minSalesPerMin: '' })
    scan({ filters })
  }

  function handleSort(key) {
    setSort(prev => ({
      key,
      dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc',
    }))
  }

  // Merge listings + velocity live
  const enrichedListings = useMemo(() => {
    return allListings.map(l => {
      const uuid = l.uuid || l.item?.uuid
      const vel  = uuid ? velocityMap[uuid] : null
      return {
        ...l,
        _salesPerMin:    vel?.salesPerMin    ?? null,
        _profitPerMin:   vel?.profitPerMin   ?? null,
        _snipeDiscount:  vel?.snipeDiscount  ?? null,
        _velocityLoaded: vel != null,
      }
    })
  }, [allListings, velocityMap])

  // Apply local client-side filters
  const filteredListings = useMemo(() => {
    return enrichedListings.filter(l => {
      if (localFilters.minProfit !== '' &&
          (l._profitAfterTax ?? 0) < +localFilters.minProfit) return false
      if (localFilters.minSalesPerMin !== '' && l._salesPerMin != null &&
          l._salesPerMin < +localFilters.minSalesPerMin) return false
      return true
    })
  }, [enrichedListings, localFilters])

  // Sort — when sorting by _profitPerMin, fall back to _profitAfterTax for unloaded rows
  const sortedListings = useMemo(() => {
    const nullVal = sort.dir === 'desc' ? -Infinity : Infinity
    return [...filteredListings].sort((a, b) => {
      let av, bv
      if (sort.key === '_profitPerMin') {
        av = (a._profitPerMin ?? a._profitAfterTax) ?? nullVal
        bv = (b._profitPerMin ?? b._profitAfterTax) ?? nullVal
      } else {
        av = a[sort.key] ?? nullVal
        bv = b[sort.key] ?? nullVal
      }
      return sort.dir === 'desc' ? bv - av : av - bv
    })
  }, [filteredListings, sort])

  const velCount = useMemo(
    () => enrichedListings.filter(l => l._velocityLoaded).length,
    [enrichedListings]
  )

  // ── Render ──────────────────────────────────────────────────

  // Idle + no data: show encouragement
  if (status === 'idle' && !hasData) {
    return (
      <div className="fms-wrap">
        <IdleTips filters={filters} onScan={handleScan} />
        {error && (
          <div className="error-box" style={{ margin: '12px 0' }}>
            <span>⚠️</span>
            <div><strong>Scan failed</strong><p style={{ opacity: 0.8 }}>{error}</p></div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fms-wrap">

      {/* ── Top bar: status + controls ── */}
      <div className="fms-topbar">
        <div className="fms-topbar-left">
          {hasData && (
            <span className="fms-topbar-summary">
              {scanFilters ? buildFilterSummary(scanFilters) || 'All mlb_card' : ''}
            </span>
          )}
          {scanTimestamp && isDone && (
            <span className="fms-timestamp">Last scanned: {timeAgo(scanTimestamp)}</span>
          )}
        </div>

        <div className="fms-topbar-right">
          {scanning ? (
            <button className="sc-stop-btn" onClick={abort}>■ Stop</button>
          ) : isDone ? (
            <>
              <button className="fms-rescan-btn" onClick={handleScan}>↺ Rescan</button>
              <button className="fms-new-btn" onClick={reset}>New Scan</button>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Warnings ── */}
      {filtersChanged && (
        <div className="fms-stale-banner">
          ⚠ Filters changed since last scan — click Rescan to refresh results
        </div>
      )}

      {/* ── Progress: shown during Phase 1 or Phase 2 ── */}
      {scanning && <ScanProgress status={status} progress={progress} />}

      {/* ── Phase 2 velocity banner: shown above table while loading ── */}
      {status === 'detail-fetch' && hasData && (
        <div className="fms-vel-banner">
          <span className="fms-vel-dots"><span/><span/><span/></span>
          <span>
            Calculating velocity&ensp;
            <strong>{progress.detailDone}</strong> / {progress.detailTotal}
            &ensp;·&ensp;table re-sorts automatically as data arrives
          </span>
        </div>
      )}

      {/* ── Done banner ── */}
      {isDone && (
        <div className="fms-done-banner">
          ✓ Scan complete &nbsp;·&nbsp;
          <strong>{allListings.length.toLocaleString()}</strong> profitable cards
          across {progress.listingTotal} pages &nbsp;·&nbsp;
          Velocity loaded for <strong>{velCount}</strong> / {DETAIL_COUNT}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="error-box" style={{ margin: '12px 0' }}>
          <span>⚠️</span>
          <div><strong>Scan failed</strong><p style={{ opacity: 0.8 }}>{error}</p></div>
        </div>
      )}

      {/* ── Client-side result filters ── */}
      {hasData && (
        <div className="fms-local-filters">
          <span className="fms-local-label">Filter results:</span>
          <label className="fms-local-field">
            Min Profit
            <input
              type="number"
              className="fms-local-input"
              placeholder="0"
              value={localFilters.minProfit}
              onChange={e => setLocalFilters(prev => ({ ...prev, minProfit: e.target.value }))}
            />
          </label>
          <label className="fms-local-field">
            Min Sales/Min
            <input
              type="number"
              className="fms-local-input"
              placeholder="0"
              step="0.01"
              value={localFilters.minSalesPerMin}
              onChange={e => setLocalFilters(prev => ({ ...prev, minSalesPerMin: e.target.value }))}
            />
          </label>
          {(localFilters.minProfit || localFilters.minSalesPerMin) && (
            <button
              className="fms-local-clear"
              onClick={() => setLocalFilters({ minProfit: '', minSalesPerMin: '' })}
            >
              ✕ Clear
            </button>
          )}
          {sortedListings.length < allListings.length && (
            <span className="fms-local-count">
              Showing {sortedListings.length.toLocaleString()} / {allListings.length.toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* ── Results table ── */}
      {hasData && sortedListings.length > 0 && (
        <ResultsTable
          results={sortedListings}
          sort={sort}
          onSort={handleSort}
          velCount={velCount}
        />
      )}

      {hasData && sortedListings.length === 0 && (
        <div className="sc-empty">
          <div style={{ fontSize: 32 }}>📭</div>
          <p>No cards match your result filters.</p>
          <button
            className="fms-local-clear"
            style={{ fontSize: 13, padding: '6px 14px', marginTop: 8 }}
            onClick={() => setLocalFilters({ minProfit: '', minSalesPerMin: '' })}
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  )
}
