import { useEffect, useRef, useState, useCallback } from 'react'
import { rarityColors, fmt, fmtProfit, profitClass, marginColor } from '../utils/format'
import CopyableName from './CopyableName'

// ── localStorage keys ─────────────────────────────────────────────────────────
const COLUMN_ORDER_KEY = 'stubflipper_column_order'
const HIDDEN_COLS_KEY  = 'stubflipper_hidden_cols'

const SNIPE_THRESHOLD      = 10
const SNIPE_GOOD_THRESHOLD = 5

// ── Column definitions ─────────────────────────────────────────────────────────
// sortKey  = API/client sort identifier passed to onSort()
// thStyle  = extra style on <th>
// thTitle  = tooltip on <th>
const COLUMN_DEFS = [
  { key: 'card',           label: 'CARD',       minWidth: 260, align: 'left' },
  { key: 'ovr',            label: 'OVR' },
  { key: 'pos',            label: 'POS' },
  { key: 'series',         label: 'SERIES' },
  { key: 'buy',            label: 'BUY',        sortKey: 'best_buy_price' },
  { key: 'sell',           label: 'SELL',       sortKey: 'best_sell_price' },
  { key: 'profit_per_min', label: 'PROFIT/MIN', sortKey: 'profit_per_min' },
  { key: 'snipe_pct',      label: 'SNIPE%',     sortKey: 'snipe_discount' },
  { key: 'qs_prem',        label: 'QS PREM%',   sortKey: 'qs_premium',
    thStyle: { color: '#fbbf24' },
    thTitle: 'Buy-now price vs quicksell floor — lower = safer buy' },
  { key: 'qs',             label: 'QS' },
  { key: 'spread_pct',     label: 'SPREAD%' },
  { key: 'profit',         label: 'PROFIT' },
  { key: 'margin',         label: 'MARGIN' },
  { key: 'sales_min',      label: 'SALES/MIN' },
]

const DEFAULT_COLUMN_ORDER = COLUMN_DEFS.map(c => c.key)
const COL_MAP = Object.fromEntries(COLUMN_DEFS.map(c => [c.key, c]))

/** Merge a saved order with the canonical default — handles new/removed columns gracefully */
function mergeColumnOrder(saved) {
  if (!Array.isArray(saved)) return DEFAULT_COLUMN_ORDER
  const valid   = saved.filter(k => DEFAULT_COLUMN_ORDER.includes(k))
  const missing = DEFAULT_COLUMN_ORDER.filter(k => !valid.includes(k))
  return [...valid, ...missing]
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function SortArrow({ active, order }) {
  if (!active) return <span style={{ opacity: 0.25 }}>↕</span>
  return <span>{order === 'desc' ? '▼' : '▲'}</span>
}

function VelCell({ value, loaded, formatter, color }) {
  if (!loaded) return <span className="vel-cell-loading">···</span>
  if (value == null) return <span className="muted">—</span>
  return <span style={{ color }}>{formatter(value)}</span>
}

function SnipeCell({ value, loaded }) {
  if (!loaded) return <span className="vel-cell-loading">···</span>
  if (value == null) return <span className="muted">—</span>
  const isHot  = value >= SNIPE_THRESHOLD
  const isGood = value >= SNIPE_GOOD_THRESHOLD && !isHot
  const color  = isHot ? '#4ade80' : isGood ? '#fbbf24' : value > 0 ? '#c8d6e5' : '#f87171'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span className="mono" style={{ color, fontWeight: 700 }}>
        {value > 0 ? '+' : ''}{value.toFixed(1)}%
      </span>
      {isHot && <span className="snipe-badge">🎯 SNIPE</span>}
    </span>
  )
}

function SpreadCell({ value, loaded, isWide }) {
  if (!loaded) return <span className="vel-cell-loading">···</span>
  if (value == null) return <span className="muted">—</span>
  const color = value > 50 ? '#f87171' : value > 20 ? '#fbbf24' : '#c8d6e5'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span className="mono" style={{ color }}>{value.toFixed(1)}%</span>
      {isWide && <span className="wide-badge">⚠ WIDE</span>}
    </span>
  )
}

// ── Column visibility menu ─────────────────────────────────────────────────────
function ColumnMenu({ colOrder, hidden, onToggle, onReset, onClose }) {
  return (
    <div className="col-menu">
      <div className="col-menu-header">
        <span>Visible Columns</span>
        <button className="col-menu-close" onClick={onClose}>✕</button>
      </div>
      <div className="col-menu-list">
        {colOrder.map(key => {
          const def = COL_MAP[key]
          if (!def) return null
          const isVisible = !hidden.has(key)
          return (
            <label key={key} className="col-menu-item">
              <input
                type="checkbox"
                checked={isVisible}
                onChange={() => onToggle(key)}
              />
              <span style={def.thStyle}>{def.label}</span>
            </label>
          )
        })}
      </div>
      <button className="col-menu-reset" onClick={onReset}>↺ Reset to Default</button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ListingsTable({
  listings, sort, order, page,
  onSort, onSelectCard, onVisible, selectedUuid, wideSpreadUuids, newEntryUUIDs,
  onCompare, compareUuids, isTrayFull,
}) {
  const perPage     = 25
  const rowRefs     = useRef(new Map())
  const observerRef = useRef(null)

  // ── Column order ──────────────────────────────────────────────────────────
  const [colOrder, setColOrder] = useState(() => {
    try {
      return mergeColumnOrder(JSON.parse(localStorage.getItem(COLUMN_ORDER_KEY)))
    } catch { return DEFAULT_COLUMN_ORDER }
  })

  // ── Hidden columns ────────────────────────────────────────────────────────
  const [hidden, setHidden] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HIDDEN_COLS_KEY))
      if (Array.isArray(saved)) return new Set(saved.filter(k => DEFAULT_COLUMN_ORDER.includes(k)))
    } catch {}
    return new Set()
  })

  const [showColMenu, setShowColMenu] = useState(false)

  // ── Drag state ────────────────────────────────────────────────────────────
  const [dropTarget, setDropTarget] = useState(null)  // { key, side: 'before'|'after' }
  const dragKeyRef   = useRef(null)

  // ── Persist column prefs ──────────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(colOrder)) } catch {}
  }, [colOrder])

  useEffect(() => {
    try { localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify([...hidden])) } catch {}
  }, [hidden])

  // ── IntersectionObserver: lazy velocity fetching ──────────────────────────
  useEffect(() => {
    if (!onVisible || typeof IntersectionObserver === 'undefined') return
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return
          const uuid = entry.target.dataset.uuid
          if (uuid) onVisible(uuid)
          observerRef.current?.unobserve(entry.target)
        })
      },
      { rootMargin: '300px 0px', threshold: 0 },
    )
    rowRefs.current.forEach(el => observerRef.current.observe(el))
    return () => observerRef.current?.disconnect()
  }, [listings, onVisible])

  function getRowRef(uuid) {
    return (el) => {
      if (el) {
        rowRefs.current.set(uuid, el)
        observerRef.current?.observe(el)
      } else {
        const prev = rowRefs.current.get(uuid)
        if (prev instanceof Element) observerRef.current?.unobserve(prev)
        rowRefs.current.delete(uuid)
      }
    }
  }

  // ── Column actions ────────────────────────────────────────────────────────
  const visibleCols = colOrder.filter(k => !hidden.has(k))

  function toggleHidden(key) {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function resetColumns() {
    setColOrder(DEFAULT_COLUMN_ORDER)
    setHidden(new Set())
    setShowColMenu(false)
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function handleDragStart(e, key) {
    dragKeyRef.current = key
    e.dataTransfer.effectAllowed = 'move'
    // Set a ghost image so the default ghost isn't too ugly
    e.dataTransfer.setData('text/plain', key)
  }

  function handleDragOver(e, key) {
    e.preventDefault()
    if (!dragKeyRef.current || dragKeyRef.current === key) return
    const rect = e.currentTarget.getBoundingClientRect()
    const side = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
    setDropTarget(prev =>
      prev?.key === key && prev?.side === side ? prev : { key, side }
    )
  }

  function handleDrop(e, targetKey) {
    e.preventDefault()
    const fromKey = dragKeyRef.current
    if (!fromKey || fromKey === targetKey) { setDropTarget(null); return }

    const rect = e.currentTarget.getBoundingClientRect()
    const side = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after'

    setColOrder(prev => {
      const arr       = prev.filter(k => k !== fromKey)
      const targetIdx = arr.indexOf(targetKey)
      if (targetIdx === -1) return prev
      const insertAt  = side === 'before' ? targetIdx : targetIdx + 1
      const next      = [...arr]
      next.splice(insertAt, 0, fromKey)
      return next
    })

    setDropTarget(null)
    dragKeyRef.current = null
  }

  function handleDragEnd() {
    setDropTarget(null)
    dragKeyRef.current = null
  }

  // ── Header renderer ────────────────────────────────────────────────────────
  function renderHeader(key) {
    const def = COL_MAP[key]
    if (!def) return null

    const dropClass = dropTarget?.key === key ? `th-drop-${dropTarget.side}` : ''
    const isSortable = !!def.sortKey

    const thStyle = {
      textAlign: def.align ?? 'center',
      ...(def.minWidth ? { minWidth: def.minWidth } : {}),
      ...(def.thStyle  ? def.thStyle               : {}),
    }

    return (
      <th
        key={key}
        className={`col-draggable${dropClass ? ' ' + dropClass : ''}${isSortable ? ' sortable' : ''}`}
        draggable
        style={thStyle}
        title={def.thTitle ?? (isSortable ? `Sort by ${def.label}` : `Drag to reorder`)}
        onClick={isSortable ? () => onSort(def.sortKey) : undefined}
        onDragStart={e => handleDragStart(e, key)}
        onDragOver={e  => handleDragOver(e, key)}
        onDrop={e      => handleDrop(e, key)}
        onDragEnd={handleDragEnd}
      >
        <span className="col-drag-grip" title="Drag to reorder">⠿</span>
        {def.label}
        {isSortable && <SortArrow active={sort === def.sortKey} order={order} />}
      </th>
    )
  }

  // ── Data cell renderer ─────────────────────────────────────────────────────
  function renderCell(key, l, ctx) {
    const { item, r, pc, mc, mw, imgSrc, isNewEntry, isWideSpread, ppmColor } = ctx
    switch (key) {
      case 'card':
        return (
          <td key="card" style={{ textAlign: 'left' }}>
            <div className="card-cell">
              {imgSrc && (
                <img
                  className="card-img" src={imgSrc} alt=""
                  onError={e => { e.currentTarget.style.display = 'none' }}
                />
              )}
              <div>
                <div className="card-name">
                  <CopyableName name={l.listing_name || item.name || ''} />
                  {isNewEntry && (
                    <span className="new-entry-badge" title="Just entered top results">NEW</span>
                  )}
                  {l._premiumPct != null && l._premiumPct < 5 && (
                    <span
                      className={`near-qs-badge${l._premiumPct < 1 ? ' near-qs-badge--hot' : ''}`}
                      title={`Buy-now is only ${l._premiumPct.toFixed(1)}% above quicksell — near risk-free buy`}
                    >
                      {l._premiumPct < 1 ? '🔥' : '~'}QS
                    </span>
                  )}
                </div>
                <div className="card-meta">
                  <span className="rarity-badge" style={{ background: r.badge, color: r.text }}>
                    {(item.rarity || '').toUpperCase()}
                  </span>
                  {item.team && <span className="team-name">{item.team}</span>}
                  {item.series && item.series !== 'Live' && (
                    <span className="series-name">{item.series}</span>
                  )}
                </div>
              </div>
            </div>
          </td>
        )

      case 'ovr':
        return (
          <td key="ovr" style={{ fontWeight: 700, color: r.glow, fontSize: 16 }}>
            {item.ovr || '—'}
          </td>
        )

      case 'pos':
        return (
          <td key="pos" style={{ color: '#aab' }}>{item.display_position || '—'}</td>
        )

      case 'series':
        return (
          <td key="series" style={{ color: '#667', fontSize: 11 }}>{item.series || '—'}</td>
        )

      case 'buy':
        return (
          <td key="buy" className="mono" style={{ fontWeight: 600 }}>
            {l._bidBelowQS ? (
              <span title="Bid is below quicksell floor — possible data error">
                <span style={{ color: '#f87171' }}>{fmt(l.best_buy_price)}</span>
                <span className="qs-warn-badge">⚠</span>
              </span>
            ) : l._buyIsQS ? (
              <span className="qs-fallback-buy" title="No active bid — using quicksell floor">
                {fmt(l._quicksellFloor)}<span className="qs-badge">QS</span>
              </span>
            ) : (
              <span className="buy-color">{fmt(l.best_buy_price)}</span>
            )}
          </td>
        )

      case 'sell':
        return (
          <td key="sell" className="mono sell-color" style={{ fontWeight: 600 }}>
            {fmt(l.best_sell_price)}
          </td>
        )

      case 'profit_per_min':
        return (
          <td key="profit_per_min" className="mono" style={{ fontWeight: 700 }}>
            <VelCell
              value={l._profitPerMin}
              loaded={l._velocityLoaded}
              formatter={v => `${v >= 0 ? '+' : ''}${Math.round(v).toLocaleString()}`}
              color={ppmColor}
            />
          </td>
        )

      case 'snipe_pct':
        return (
          <td key="snipe_pct">
            <SnipeCell value={l._snipeDiscount} loaded={l._velocityLoaded} />
          </td>
        )

      case 'qs_prem':
        return (
          <td key="qs_prem" className="mono" style={{ fontSize: 11 }}>
            {l._premiumPct != null ? (
              <span
                className={l._premiumPct < 1 ? 'nqs-val-hot' : l._premiumPct < 5 ? 'nqs-val-near' : 'nqs-val-normal'}
                title={`Buy-now is ${l._premiumPct.toFixed(1)}% above quicksell (${(l._premiumOverQS ?? 0).toLocaleString()} stubs)`}
              >
                {l._premiumPct.toFixed(1)}%
              </span>
            ) : '—'}
          </td>
        )

      case 'qs':
        return (
          <td key="qs" className="mono" style={{ fontSize: 11 }}>
            {l._quicksellFloor != null ? (
              <span
                className={l._isLive ? 'qs-live' : 'qs-nonlive'}
                title={l._isLive ? 'Live Series quicksell' : 'Non-Live quicksell (est.)'}
              >
                {fmt(l._quicksellFloor)}
              </span>
            ) : (
              <span style={{ color: '#334' }}>—</span>
            )}
          </td>
        )

      case 'spread_pct':
        return (
          <td key="spread_pct">
            <SpreadCell value={l._spreadPct} loaded={l._velocityLoaded} isWide={isWideSpread} />
          </td>
        )

      case 'profit':
        return (
          <td key="profit" className={`mono ${pc}`} style={{ fontWeight: 700 }}>
            {fmtProfit(l._profitAfterTax)}
          </td>
        )

      case 'margin':
        return (
          <td key="margin">
            {mc != null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <div className="margin-bar-outer">
                  <div className="margin-bar-inner" style={{ width: `${mw}%`, background: mc }} />
                </div>
                <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: mc, minWidth: 42, textAlign: 'right' }}>
                  {l._margin.toFixed(1)}%
                </span>
              </div>
            ) : '—'}
          </td>
        )

      case 'sales_min':
        return (
          <td key="sales_min" className="mono" style={{ fontSize: 12 }}>
            <VelCell
              value={l._salesPerMin}
              loaded={l._velocityLoaded}
              formatter={v => v < 0.01 ? '<0.01' : v.toFixed(2)}
              color="#34d399"
            />
          </td>
        )

      default:
        return <td key={key}>—</td>
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="table-wrap">
      {/* Toolbar: reset + column visibility */}
      <div className="table-toolbar">
        <button className="toolbar-btn" onClick={resetColumns} title="Restore default column order and show all columns">
          ↺ Reset Columns
        </button>
        <div className="col-gear-wrap">
          <button
            className={`toolbar-btn col-gear-btn${showColMenu ? ' col-gear-btn--active' : ''}`}
            onClick={() => setShowColMenu(v => !v)}
            title="Show / hide columns"
          >
            ⚙ Columns {hidden.size > 0 && <span className="col-hidden-count">−{hidden.size}</span>}
          </button>
          {showColMenu && (
            <ColumnMenu
              colOrder={colOrder}
              hidden={hidden}
              onToggle={toggleHidden}
              onReset={resetColumns}
              onClose={() => setShowColMenu(false)}
            />
          )}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            {onCompare && <th style={{ width: 38 }} title="Add to comparison tray" />}
            <th style={{ width: 50 }}>#</th>
            {visibleCols.map(key => renderHeader(key))}
          </tr>
        </thead>
        <tbody>
          {listings.map((l, i) => {
            const item    = l.item || {}
            const r       = rarityColors(item.rarity)
            const pc      = profitClass(l._profitAfterTax)
            const mc      = l._margin != null ? marginColor(l._margin) : null
            const mw      = l._margin != null ? Math.min(Math.max(l._margin, 0), 100) : 0
            const imgSrc  = item.baked_img || item.img || ''
            const uuid    = l.uuid || l.item?.uuid
            const num     = (page - 1) * perPage + i + 1

            const isSelected   = selectedUuid === uuid
            const isSnipe      = l._snipeDiscount != null && l._snipeDiscount >= SNIPE_THRESHOLD
            const isSnipeGood  = l._snipeDiscount != null && l._snipeDiscount >= SNIPE_GOOD_THRESHOLD && !isSnipe
            const isWideSpread = wideSpreadUuids?.has(uuid)
            const isNewEntry   = newEntryUUIDs?.has(uuid)
            const isCompared   = compareUuids?.has(uuid)

            const ppmColor = l._profitPerMin > 500 ? '#4ade80'
              : l._profitPerMin > 100 ? '#fbbf24'
              : l._profitPerMin > 0   ? '#c8d6e5'
              : '#f87171'

            let rowBg
            if (isNewEntry)        rowBg = 'rgba(77,166,255,0.05)'
            else if (isSelected)   rowBg = 'rgba(77,166,255,0.07)'
            else if (isSnipe)      rowBg = 'rgba(74,222,128,0.06)'
            else if (isSnipeGood)  rowBg = 'rgba(251,191,36,0.04)'
            else if (isWideSpread) rowBg = 'rgba(251,146,60,0.05)'

            const rowClass = [
              isNewEntry   ? 'row-new-entry'  : '',
              isSnipe      ? 'row-snipe'       : '',
              isSnipeGood  ? 'row-snipe-good'  : '',
              isWideSpread ? 'row-wide-spread' : '',
            ].filter(Boolean).join(' ')

            const ctx = { item, r, pc, mc, mw, imgSrc, isNewEntry, isWideSpread, ppmColor }

            return (
              <tr
                key={uuid || i}
                ref={getRowRef(uuid)}
                data-uuid={uuid}
                className={rowClass}
                style={{ borderLeft: `3px solid ${r.glow}`, background: rowBg }}
                onClick={() => onSelectCard(uuid)}
              >
                {onCompare && (
                  <td style={{ padding: '0 6px', textAlign: 'center' }}
                      onClick={e => e.stopPropagation()}>
                    <button
                      className={`cmp-row-btn ${isCompared ? 'cmp-row-btn--active' : ''} ${isTrayFull && !isCompared ? 'cmp-row-btn--full' : ''}`}
                      onClick={() => onCompare(l)}
                      title={isCompared ? 'Remove from comparison' : isTrayFull ? 'Tray full (max 3)' : 'Add to comparison'}
                      disabled={isTrayFull && !isCompared}
                    >
                      {isCompared ? '✓' : '+'}
                    </button>
                  </td>
                )}
                <td style={{ color: '#556', fontSize: 12 }}>{num}</td>
                {visibleCols.map(key => renderCell(key, l, ctx))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
