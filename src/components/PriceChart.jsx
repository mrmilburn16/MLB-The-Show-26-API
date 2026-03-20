import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: <strong>{Number(p.value).toLocaleString()}</strong>
        </p>
      ))}
    </div>
  )
}

export default function PriceChart({ priceHistory }) {
  if (!priceHistory?.length) {
    return <p className="chart-empty">No price history available.</p>
  }

  // Normalize: price_history items may be { date, best_buy_price, best_sell_price }
  // or { date, buy, sell } — handle both shapes
  const data = [...priceHistory]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(d => ({
      date:  new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      buy:   d.best_buy_price  ?? d.buy  ?? null,
      sell:  d.best_sell_price ?? d.sell ?? null,
    }))
    .filter(d => d.buy != null || d.sell != null)

  if (!data.length) return <p className="chart-empty">No price history available.</p>

  const allValues = data.flatMap(d => [d.buy, d.sell]).filter(v => v != null)
  const min = Math.floor(Math.min(...allValues) * 0.95)
  const max = Math.ceil(Math.max(...allValues)  * 1.05)

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          stroke="#445"
          tick={{ fill: '#667', fontSize: 10 }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="#445"
          tick={{ fill: '#667', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
          domain={[min, max]}
          width={40}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8, color: '#8899aa' }}
        />
        <Line
          type="monotone"
          dataKey="buy"
          name="Buy"
          stroke="#60a5fa"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="sell"
          name="Sell"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
