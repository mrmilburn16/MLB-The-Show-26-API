import { useEffect, useRef, useState, useCallback } from 'react'
import { rarityColors, fmt, fmtProfit, profitClass, marginColor } from '../utils/format'

const SORT_COLS = [
  { key: 'best_buy_price',  label: 'BUY'       },
  { key: 'best_sell_price', label: 'SELL'       },
  { key: 'profit_per_min',  label: 'PROFIT/MIN' },
  { key: 'snipe_discount',  label: 'SNIPE%'     },
]

const SNIPE_THRESHOLD      = 10   // % → green highlight + badge
const SNIPE_GOOD_THRESHOLD = 5    // % → amber highlight

function CopyableName({ name }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  const handleClick = useCallback(e => {
    e.stopPropagation()
    navigator.clipboard.writeText(name).then(() => {
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }, [name])

  return (
    <span
      className={`card-name-text${copied ? ' card-name-text--copied' : ''}`}
      onClick={handleClick}
      title="Click to copy"
    >
      {copied ? <><span className="copy-check">✓</span> Copied!</> : name}
    </span>
  )
}

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

export default function ListingsTable({
  listings, sort, order, page,
  onSort, onSelectCard, onVisible, selectedUuid, wideSpreadUuids, newEntryUUIDs,
}) {
  const perPage     = 25
  const rowRefs     = useRef(new Map())
  const observerRef = useRef(null)

  // ── IntersectionObserver: lazy-request velocity/snipe on scroll ──
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

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 50 }}>#</th>
            <th style={{ textAlign: 'left', minWidth: 260 }}>CARD</th>
            <th>OVR</th>
            <th>POS</th>
            <th>SERIES</th>
            {SORT_COLS.map(col => (
              <th key={col.key} className="sortable" onClick={() => onSort(col.key)}>
                {col.label} <SortArrow active={sort === col.key} order={order} />
              </th>
            ))}
            <th
              className="sortable"
              onClick={() => onSort('qs_premium')}
              style={{ color: '#fbbf24' }}
              title="Buy-now price vs quicksell floor — lower = safer buy"
            >
              QS PREM% <SortArrow active={sort === 'qs_premium'} order={order} />
            </th>
            <th>QS</th>
            <th>SPREAD%</th>
            <th>PROFIT</th>
            <th>MARGIN</th>
            <th>SALES/MIN</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l, i) => {
            const item      = l.item || {}
            const r         = rarityColors(item.rarity)
            const pc        = profitClass(l._profitAfterTax)
            const num       = (page - 1) * perPage + i + 1
            const mc        = l._margin != null ? marginColor(l._margin) : null
            const mw        = l._margin != null ? Math.min(Math.max(l._margin, 0), 100) : 0
            const imgSrc    = item.baked_img || item.img || ''
            const uuid      = l.uuid || l.item?.uuid
            const isSelected   = selectedUuid === uuid
            const isSnipe      = l._snipeDiscount != null && l._snipeDiscount >= SNIPE_THRESHOLD
            const isSnipeGood  = l._snipeDiscount != null && l._snipeDiscount >= SNIPE_GOOD_THRESHOLD && !isSnipe
            const isWideSpread = wideSpreadUuids?.has(uuid)
            const isNewEntry   = newEntryUUIDs?.has(uuid)

            const ppmColor = l._profitPerMin > 500 ? '#4ade80'
              : l._profitPerMin > 100 ? '#fbbf24'
              : l._profitPerMin > 0   ? '#c8d6e5'
              : '#f87171'

            // Row background: new-entry > snipe > wide-spread > selected > none
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

            return (
              <tr
                key={uuid || i}
                ref={getRowRef(uuid)}
                data-uuid={uuid}
                className={rowClass}
                style={{ borderLeft: `3px solid ${r.glow}`, background: rowBg }}
                onClick={() => onSelectCard(uuid)}
              >
                <td style={{ color: '#556', fontSize: 12 }}>{num}</td>

                {/* Card */}
                <td style={{ textAlign: 'left' }}>
                  <div className="card-cell">
                    {imgSrc && (
                      <img
                        className="card-img"
                        src={imgSrc}
                        alt=""
                        onError={e => { e.currentTarget.style.display = 'none' }}
                      />
                    )}
                    <div>
                      <div className="card-name">
                        <CopyableName name={l.listing_name || item.name || ''} />
                        {isNewEntry && (
                          <span className="new-entry-badge" title="This card just entered the top results">
                            NEW
                          </span>
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

                <td style={{ fontWeight: 700, color: r.glow, fontSize: 16 }}>{item.ovr || '—'}</td>
                <td style={{ color: '#aab' }}>{item.display_position || '—'}</td>
                <td style={{ color: '#667', fontSize: 11 }}>{item.series || '—'}</td>

                {/* BUY — real bid, or QS floor as fallback */}
                <td className="mono" style={{ fontWeight: 600 }}>
                  {l._bidBelowQS ? (
                    <span title="Bid is below quicksell floor — possible data error">
                      <span style={{ color: '#f87171' }}>{fmt(l.best_buy_price)}</span>
                      <span className="qs-warn-badge">⚠</span>
                    </span>
                  ) : l._buyIsQS ? (
                    <span className="qs-fallback-buy" title="No active bid — using quicksell floor as buy price">
                      {fmt(l._quicksellFloor)}
                      <span className="qs-badge">QS</span>
                    </span>
                  ) : (
                    <span className="buy-color">{fmt(l.best_buy_price)}</span>
                  )}
                </td>

                {/* SELL */}
                <td className="mono sell-color" style={{ fontWeight: 600 }}>
                  {fmt(l.best_sell_price)}
                </td>

                {/* PROFIT/MIN (sortable) */}
                <td className="mono" style={{ fontWeight: 700 }}>
                  <VelCell
                    value={l._profitPerMin}
                    loaded={l._velocityLoaded}
                    formatter={v => `${v >= 0 ? '+' : ''}${Math.round(v).toLocaleString()}`}
                    color={ppmColor}
                  />
                </td>

                {/* SNIPE% (sortable) */}
                <td>
                  <SnipeCell value={l._snipeDiscount} loaded={l._velocityLoaded} />
                </td>

                {/* QS PREM% — how close buy-now is to quicksell floor */}
                <td className="mono" style={{ fontSize: 11 }}>
                  {l._premiumPct != null ? (
                    <span
                      className={l._premiumPct < 1 ? 'nqs-val-hot' : l._premiumPct < 5 ? 'nqs-val-near' : 'nqs-val-normal'}
                      title={`Buy-now is ${l._premiumPct.toFixed(1)}% above quicksell (${(l._premiumOverQS ?? 0).toLocaleString()} stubs)`}
                    >
                      {l._premiumPct.toFixed(1)}%
                    </span>
                  ) : '—'}
                </td>

                {/* QS — quicksell floor */}
                <td className="mono" style={{ fontSize: 11 }}>
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

                {/* SPREAD% */}
                <td>
                  <SpreadCell
                    value={l._spreadPct}
                    loaded={l._velocityLoaded}
                    isWide={isWideSpread}
                  />
                </td>

                {/* PROFIT (after 10% tax) */}
                <td className={`mono ${pc}`} style={{ fontWeight: 700 }}>
                  {fmtProfit(l._profitAfterTax)}
                </td>

                {/* MARGIN bar */}
                <td>
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

                {/* SALES/MIN */}
                <td className="mono" style={{ fontSize: 12 }}>
                  <VelCell
                    value={l._salesPerMin}
                    loaded={l._velocityLoaded}
                    formatter={v => v < 0.01 ? '<0.01' : v.toFixed(2)}
                    color="#34d399"
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
