import { fmt, fmtProfit, profitClass } from '../utils/format'
import { parsePrice } from '../utils/snipe'
import PriceChart from './PriceChart'

function fmtRate(n) {
  if (n == null || n === 0) return '—'
  return n < 0.01 ? '<0.01/min' : `${n.toFixed(2)}/min`
}
function fmtProfitMin(n) {
  if (n == null || n === 0) return '—'
  return `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString()}/min`
}
function fmtPct(n, decimals = 1) {
  if (n == null) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(decimals)}%`
}

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

export default function HistoricalPanel({ listing, velocityData, velocityLoading, onClose }) {
  if (!listing) return null

  const item    = listing.item || {}
  const imgSrc  = item.baked_img || item.img || ''
  const pc      = profitClass(listing._profitAfterTax)
  const vLoaded = !!velocityData

  // ── Snipe signal ──
  const snipeDiscount  = vLoaded ? velocityData.snipeDiscount  : listing._snipeDiscount
  const spreadPct      = vLoaded ? velocityData.spreadPct      : listing._spreadPct
  const volatilityPct  = vLoaded ? velocityData.volatilityPct  : listing._volatilityPct
  const median         = vLoaded ? velocityData.median         : listing._median
  const avg            = vLoaded ? velocityData.avg            : listing._avg

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
    { label: 'Sales / Min',  value: fmtRate(velocityData?.salesPerMin),        style: { color: '#34d399' } },
    { label: 'Profit / Min', value: fmtProfitMin(velocityData?.profitPerMin),  cls: profitClass(velocityData?.profitPerMin) },
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
    {
      label: 'Median Sale Price',
      value: fmt(median),
      style: { color: '#a78bfa' },
    },
    {
      label: 'Avg Sale Price',
      value: fmt(Math.round(avg)),
      style: { color: '#818cf8' },
    },
  ]

  const completedOrders = velocityData?.completedOrders || []
  const priceHistory    = velocityData?.priceHistory    || []

  return (
    <div className="detail-panel">
      {/* Header */}
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

      {/* Snipe Opportunity callout */}
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

      {/* Price stats */}
      <div className="detail-grid" style={{ marginBottom: 16 }}>
        {priceStats.map(s => (
          <StatTile key={s.label} {...s} />
        ))}
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

      {/* Snipe / market analysis */}
      <div className="hist-section">
        <div className="hist-section-title">Market Analysis</div>
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

      {/* Price History Chart */}
      <div className="hist-section">
        <div className="hist-section-title">Price History</div>
        {velocityLoading && !vLoaded
          ? <div className="hist-chart-skeleton" />
          : <PriceChart priceHistory={priceHistory} />
        }
      </div>

      {/* Recent Completed Orders */}
      <div className="hist-section">
        <div className="hist-section-title">
          Recent Completed Orders
          {vLoaded && completedOrders.length > 0 && (
            <span className="hist-section-count">{completedOrders.length} total</span>
          )}
        </div>
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
                    const d     = new Date(o.date)
                    const price = parsePrice(o.price)
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
  )
}
