import { useMemo, useState } from 'react'
import { fmt, rarityColors } from '../utils/format'
import CopyableName from './CopyableName'

const DEFAULT_THRESHOLD = 5   // % — show cards within this premium over QS
const MAX_SHOW = 10

export default function NearQSPanel({
  listings,
  threshold = DEFAULT_THRESHOLD,
  onSort,
  onSelectCard,   // (uuid) => void — opens detail panel, same as main table
}) {
  const [open, setOpen] = useState(true)

  const deals = useMemo(() => {
    return listings
      .filter(l => l._premiumPct != null && l._premiumPct <= threshold && l._quicksellFloor != null)
      .sort((a, b) => (a._premiumPct ?? 999) - (b._premiumPct ?? 999))
      .slice(0, MAX_SHOW)
  }, [listings, threshold])

  if (deals.length === 0) return null

  return (
    <div className="nqs-panel">
      <div className="nqs-header" onClick={() => setOpen(o => !o)}>
        <span className="nqs-header-icon">🎯</span>
        <span className="nqs-header-title">Near Quicksell Deals</span>
        <span className="nqs-header-count">
          {deals.length} card{deals.length !== 1 ? 's' : ''} within {threshold}% of QS
        </span>
        <span className="nqs-header-sub">
          buy-now price is barely above quicksell floor — near risk-free
        </span>
        <div className="nqs-header-actions">
          <button
            className="nqs-sort-btn"
            onClick={e => { e.stopPropagation(); onSort() }}
            title="Sort entire table by QS Premium % ascending"
          >
            Sort all by QS%
          </button>
          <span className="nqs-chevron">{open ? '▾' : '▸'}</span>
        </div>
      </div>

      {open && (
        <div className="nqs-deals">
          {deals.map((l, i) => {
            const item   = l.item || {}
            const r      = rarityColors(item.rarity)
            const imgSrc = item.baked_img || item.img || ''
            const isHot  = (l._premiumPct ?? 999) < 1
            const uuid   = l.uuid || l.item?.uuid
            const name   = l.listing_name || item.name || ''

            return (
              <div
                key={uuid || i}
                className={`nqs-card${isHot ? ' nqs-card--hot' : ''}`}
                style={{
                  borderLeft: `3px solid ${r.glow}`,
                  cursor: onSelectCard ? 'pointer' : 'default',
                }}
                onClick={() => onSelectCard?.(uuid)}
                title="Click to view price history and sales data"
              >
                {imgSrc && (
                  <img
                    className="nqs-card-img"
                    src={imgSrc}
                    alt=""
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                )}

                <div className="nqs-card-info">
                  <div className="nqs-card-name">
                    {/* CopyableName stops propagation so clicking name copies, not opens detail */}
                    <CopyableName name={name} />
                  </div>
                  <div className="nqs-card-meta">
                    <span
                      className="rarity-badge"
                      style={{ background: r.badge, color: r.text, fontSize: 9 }}
                    >
                      {(item.rarity || '').toUpperCase()}
                    </span>
                    {item.ovr    && <span className="nqs-ovr">{item.ovr}</span>}
                    {item.series && <span className="nqs-series">{item.series}</span>}
                  </div>
                </div>

                <div className="nqs-prices">
                  <div className="nqs-price-row">
                    <span className="nqs-price-label">Buy Now</span>
                    <span className="nqs-price-val sell-color">{fmt(l.best_sell_price)}</span>
                  </div>
                  <div className="nqs-price-row">
                    <span className="nqs-price-label">QS Floor</span>
                    <span className="nqs-price-val" style={{ color: '#6a8aa0' }}>
                      {fmt(l._quicksellFloor)}
                    </span>
                  </div>
                </div>

                <div className="nqs-premium">
                  <div className={`nqs-pct${isHot ? ' nqs-pct--hot' : ''}`}>
                    {(l._premiumPct ?? 0).toFixed(1)}%
                  </div>
                  <div className="nqs-pct-label">above QS</div>
                  <div className="nqs-stubs">
                    +{(l._premiumOverQS ?? 0).toLocaleString()} stubs
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
