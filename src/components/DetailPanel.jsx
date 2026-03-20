import { fmt, fmtProfit, profitClass } from '../utils/format'

export default function DetailPanel({ listing, onClose }) {
  if (!listing) return null

  const item       = listing.item || {}
  const imgSrc     = item.baked_img || item.img || ''
  const pc         = profitClass(listing._profitAfterTax)

  const stats = [
    { label: 'Best Buy (You Pay)',    value: fmt(listing.best_buy_price),          cls: 'buy-color' },
    { label: 'Best Sell (You Receive)', value: fmt(listing.best_sell_price),       cls: 'sell-color' },
    { label: 'Raw Profit',            value: fmtProfit(listing._profit),           cls: pc },
    { label: 'Profit After 10% Tax',  value: fmtProfit(listing._profitAfterTax),  cls: pc },
    { label: 'Margin',                value: listing._margin != null ? `${listing._margin.toFixed(1)}%` : '—', style: { color: '#c084fc' } },
    { label: 'Sell After Tax',        value: fmt(listing._sellAfterTax),           style: { color: '#fb923c' } },
  ]

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-header-left">
          {imgSrc && <img className="detail-img" src={imgSrc} alt="" />}
          <div>
            <h3 className="detail-name">{listing.listing_name}</h3>
            <p className="detail-sub">
              {[item.rarity, item.display_position, item.team, item.ovr ? `OVR ${item.ovr}` : null, item.series]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="detail-grid">
        {stats.map(s => (
          <div key={s.label} className="detail-stat">
            <div className="detail-stat-label">{s.label}</div>
            <div
              className={`detail-stat-value mono ${s.cls || ''}`}
              style={s.style}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <p className="detail-tip">
        Tip: Place a buy order at {fmt(listing.best_buy_price)} and a sell order at {fmt(listing.best_sell_price)} for
        a potential {fmtProfit(listing._profitAfterTax)} stub profit after the 10% market tax.
      </p>
    </div>
  )
}
