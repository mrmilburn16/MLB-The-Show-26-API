import { useState, useMemo, useCallback, useEffect } from 'react'

// ── Constants ──────────────────────────────────────────────────────
const MARKET_TAX        = 0.9          // 10% tax on sell
// 20 combined buy+sell per card is the game limit; cap buy orders at 15 to leave ≥5 sell slots
const MAX_ORDERS_HARD   = 15
const SLOW_FILL_WARN_HR = 2            // warn if all orders take > 2 hrs to fill
const LS_KEY            = 'fp_plan_v1'

const RARITY_ORDER = { Diamond: 0, Gold: 1, Silver: 2, Bronze: 3, Common: 4 }
const RARITY_COLOR = {
  Diamond: '#4da6ff', Gold: '#ffd644', Silver: '#9aafc0',
  Bronze: '#cd7f3a', Common: '#7a8a6a',
}

// ── Helpers ────────────────────────────────────────────────────────

function profitAfterTax(sellPrice, buyPrice) {
  return Math.floor(sellPrice * MARKET_TAX) - buyPrice
}

function fillTimeHours(salesPerMin, orders) {
  if (!salesPerMin || salesPerMin <= 0) return null
  // Time for all N buy orders to be filled sequentially at this velocity
  return orders / (salesPerMin * 60)
}

function profitPerHourForCard(profit, salesPerMin) {
  if (!salesPerMin || salesPerMin <= 0 || profit == null) return null
  return profit * salesPerMin * 60
}

function fmtStubs(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

function fmtHours(h) {
  if (h == null) return '—'
  if (h < 1) return `${Math.round(h * 60)}m`
  return `${h.toFixed(1)}h`
}

// ── Algorithm ──────────────────────────────────────────────────────

function buildPlan({ allListings, velocityMap, stubs, defaultOrders, minBuyPrice, maxBuyPrice, minProfit, minSalesPerMin }) {
  const candidates = []

  for (const l of allListings) {
    const buyPrice  = l.best_buy_price  || 0
    const sellPrice = l.best_sell_price || 0
    if (buyPrice <= 0 || sellPrice <= 0) continue

    if (minBuyPrice > 0 && buyPrice < minBuyPrice) continue
    if (maxBuyPrice > 0 && buyPrice > maxBuyPrice) continue

    const profit = profitAfterTax(sellPrice, buyPrice)
    if (profit <= 0) continue
    if (minProfit > 0 && profit < minProfit) continue

    const uuid     = l.uuid || l.item?.uuid
    const vel      = uuid ? velocityMap[uuid] : null
    const salesPM  = vel?.salesPerMin ?? null
    const profitPM = vel?.profitPerMin ?? null

    if (minSalesPerMin > 0 && (salesPM == null || salesPM < minSalesPerMin)) continue

    candidates.push({
      uuid,
      name:       l.listing_name || l.item?.name || '—',
      rarity:     l.item?.rarity || 'Common',
      position:   l.item?.display_position || '—',
      ovr:        l.item?.ovr   ?? null,
      buyPrice,
      sellPrice,
      profit,
      salesPerMin: salesPM,
      profitPerMin: profitPM,
      // Sort key: profitPerMin if available, else profit
      _sortKey: profitPM ?? (profit / 1000),
    })
  }

  // Sort by profitPerMin desc, break ties by profit desc
  candidates.sort((a, b) =>
    b._sortKey - a._sortKey || b.profit - a.profit
  )

  let remaining = stubs
  const plan    = []

  for (const card of candidates) {
    if (remaining <= 0) break

    // How many orders can we afford?
    const maxAffordable = Math.floor(remaining / card.buyPrice)
    if (maxAffordable < 1) continue

    // Cap at user's default and our hard maximum
    const orders = Math.min(maxAffordable, defaultOrders, MAX_ORDERS_HARD)
    const stubsUsed = card.buyPrice * orders

    plan.push({
      ...card,
      orders,        // mutable via slider
      stubsUsed,
    })

    remaining -= stubsUsed
  }

  return plan
}

// ── Slider cell ────────────────────────────────────────────────────

function OrderSlider({ value, max, min = 1, onChange }) {
  return (
    <div className="fp-slider-cell">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        className="fp-slider"
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="fp-slider-val">{value}</span>
    </div>
  )
}

// ── Warning badge ──────────────────────────────────────────────────

function FillWarning({ salesPerMin, orders }) {
  if (!salesPerMin) return <span className="fp-warn fp-warn--unknown" title="No velocity data yet">?</span>
  const hrs = fillTimeHours(salesPerMin, orders)
  if (hrs == null) return null
  if (hrs > SLOW_FILL_WARN_HR) {
    return (
      <span className="fp-warn fp-warn--slow" title={`At ${salesPerMin.toFixed(3)}/min, ${orders} orders takes ~${fmtHours(hrs)} to fill`}>
        ⚠ {fmtHours(hrs)}
      </span>
    )
  }
  return <span className="fp-ok" title={`All ${orders} orders fill in ~${fmtHours(hrs)}`}>✓ {fmtHours(hrs)}</span>
}

// ── Summary bar ───────────────────────────────────────────────────

function SummaryBar({ plan, stubs }) {
  const totalAllocated  = plan.reduce((s, r) => s + r.buyPrice * r.orders, 0)
  const totalOrders     = plan.reduce((s, r) => s + r.orders, 0)
  const reserve         = stubs - totalAllocated
  const totalProfitHour = plan.reduce((s, r) => {
    const ph = profitPerHourForCard(r.profit, r.salesPerMin)
    return s + (ph ?? 0) * r.orders
  }, 0)
  const cardsWithVel    = plan.filter(r => r.salesPerMin != null).length

  return (
    <div className="fp-summary">
      <div className="fp-summary-stat">
        <span className="fp-summary-label">STUBS ALLOCATED</span>
        <span className="fp-summary-value">{fmtStubs(totalAllocated)}</span>
        <span className="fp-summary-sub">of {fmtStubs(stubs)}</span>
      </div>
      <div className="fp-summary-stat">
        <span className="fp-summary-label">IN RESERVE</span>
        <span className="fp-summary-value" style={{ color: reserve < 0 ? '#f87171' : '#4ade80' }}>
          {fmtStubs(reserve)}
        </span>
        <span className="fp-summary-sub">unallocated stubs</span>
      </div>
      <div className="fp-summary-stat">
        <span className="fp-summary-label">CARDS IN PLAN</span>
        <span className="fp-summary-value">{plan.length}</span>
        <span className="fp-summary-sub">{totalOrders} total buy orders</span>
      </div>
      <div className="fp-summary-stat">
        <span className="fp-summary-label">EST. PROFIT/HR</span>
        <span className="fp-summary-value" style={{ color: '#ffd644' }}>
          {totalProfitHour > 0 ? fmtStubs(Math.round(totalProfitHour)) : '—'}
        </span>
        <span className="fp-summary-sub">
          {cardsWithVel < plan.length
            ? `${plan.length - cardsWithVel} cards missing velocity`
            : 'all cards have velocity data'}
        </span>
      </div>
    </div>
  )
}

// ── Plan row ──────────────────────────────────────────────────────

function PlanRow({ row, maxOrders, onOrderChange, onRemove }) {
  const stubsUsed   = row.buyPrice * row.orders
  const profitHr    = profitPerHourForCard(row.profit, row.salesPerMin)
  const rarityColor = RARITY_COLOR[row.rarity] || '#9aafc0'

  return (
    <tr className="fp-row">
      <td className="fp-cell-name">
        <div className="fp-name">{row.name}</div>
        <div className="fp-meta">
          <span className="fp-rarity-dot" style={{ color: rarityColor }}>●</span>
          <span style={{ color: rarityColor }}>{row.rarity}</span>
          {row.ovr && <span className="fp-ovr">{row.ovr} OVR</span>}
          <span className="fp-pos">{row.position}</span>
        </div>
      </td>
      <td className="fp-cell-num">{fmtStubs(row.buyPrice)}</td>
      <td className="fp-cell-num">{fmtStubs(row.sellPrice)}</td>
      <td className="fp-cell-num fp-profit">{fmtStubs(row.profit)}</td>
      <td className="fp-cell-num">
        {row.salesPerMin != null
          ? row.salesPerMin.toFixed(3)
          : <span className="fp-dim">—</span>}
      </td>
      <td className="fp-cell-slider">
        <OrderSlider
          value={row.orders}
          max={maxOrders}
          onChange={v => onOrderChange(row.uuid, v)}
        />
      </td>
      <td className="fp-cell-num fp-allocated">{fmtStubs(stubsUsed)}</td>
      <td className="fp-cell-num fp-profit-hr">
        {profitHr != null
          ? fmtStubs(Math.round(profitHr * row.orders))
          : <span className="fp-dim">—</span>}
      </td>
      <td className="fp-cell-warn">
        <FillWarning salesPerMin={row.salesPerMin} orders={row.orders} />
      </td>
      <td className="fp-cell-action">
        <button className="fp-remove-btn" onClick={() => onRemove(row.uuid)} title="Remove card">✕</button>
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────

export default function FlipPlanner({ allListings = [], velocityMap = {} }) {
  // ── Inputs ──
  const [stubs,          setStubs]          = useState(90000)
  const [defaultOrders,  setDefaultOrders]  = useState(5)
  const [minBuyPrice,    setMinBuyPrice]    = useState(500)
  const [maxBuyPrice,    setMaxBuyPrice]    = useState(0)
  const [minProfit,      setMinProfit]      = useState(200)
  const [minSalesPerMin, setMinSalesPerMin] = useState(0)
  const [rarityFilter,   setRarityFilter]   = useState('All')

  // ── Plan state ──
  const [plan,     setPlan]     = useState([])        // array of mutable rows
  const [hasRun,   setHasRun]   = useState(false)
  const [savedAt,  setSavedAt]  = useState(null)

  // ── Load saved plan on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (saved.plan?.length) {
        setPlan(saved.plan)
        setHasRun(true)
        setSavedAt(saved.ts)
        if (saved.stubs)         setStubs(saved.stubs)
        if (saved.defaultOrders) setDefaultOrders(saved.defaultOrders)
        if (saved.minBuyPrice)   setMinBuyPrice(saved.minBuyPrice)
        if (saved.maxBuyPrice)   setMaxBuyPrice(saved.maxBuyPrice)
        if (saved.minProfit)     setMinProfit(saved.minProfit)
      }
    } catch { /* ignore */ }
  }, [])

  // ── Filtered listing pool (apply rarity filter before algorithm) ──
  const listingPool = useMemo(() => {
    if (rarityFilter === 'All') return allListings
    return allListings.filter(l => l.item?.rarity === rarityFilter)
  }, [allListings, rarityFilter])

  // ── Velocity coverage info ──
  const velCoverage = useMemo(() => {
    const total   = allListings.length
    const covered = allListings.filter(l => {
      const uuid = l.uuid || l.item?.uuid
      return uuid && velocityMap[uuid]
    }).length
    return { total, covered, pct: total > 0 ? Math.round(covered / total * 100) : 0 }
  }, [allListings, velocityMap])

  // ── Generate plan ──
  function handleGenerate() {
    const newPlan = buildPlan({
      allListings: listingPool,
      velocityMap,
      stubs,
      defaultOrders,
      minBuyPrice,
      maxBuyPrice,
      minProfit,
      minSalesPerMin,
    })
    setPlan(newPlan)
    setHasRun(true)
    setSavedAt(null)
  }

  // ── Adjust orders on a single card ──
  const handleOrderChange = useCallback((uuid, newOrders) => {
    setPlan(prev => prev.map(r => r.uuid === uuid ? { ...r, orders: newOrders } : r))
  }, [])

  // ── Remove card from plan ──
  const handleRemove = useCallback((uuid) => {
    setPlan(prev => prev.filter(r => r.uuid !== uuid))
  }, [])

  // ── Save plan ──
  function handleSave() {
    try {
      const payload = { plan, stubs, defaultOrders, minBuyPrice, maxBuyPrice, minProfit, ts: Date.now() }
      localStorage.setItem(LS_KEY, JSON.stringify(payload))
      setSavedAt(payload.ts)
    } catch { /* ignore */ }
  }

  // ── Clear plan ──
  function handleClear() {
    setPlan([])
    setHasRun(false)
    setSavedAt(null)
    localStorage.removeItem(LS_KEY)
  }

  // Budget validation
  const totalAllocated = plan.reduce((s, r) => s + r.buyPrice * r.orders, 0)
  const overBudget     = totalAllocated > stubs

  const dataReady = allListings.length > 0

  return (
    <div className="fp-wrap">

      {/* ── Header ── */}
      <div className="fp-header">
        <div>
          <h2 className="fp-title">📋 Flip Planner</h2>
          <p className="fp-subtitle">
            20 combined buy+sell orders per card (game limit, per card — no total cap) ·
            spread stubs across more cards with fewer orders each for maximum throughput
          </p>
        </div>
        {velCoverage.total > 0 && (
          <div className="fp-vel-coverage">
            <span className="fp-vel-bar-wrap">
              <span className="fp-vel-bar" style={{ width: `${velCoverage.pct}%` }} />
            </span>
            <span className="fp-vel-label">
              Velocity: {velCoverage.covered.toLocaleString()} / {velCoverage.total.toLocaleString()} cards ({velCoverage.pct}%)
            </span>
          </div>
        )}
      </div>

      {/* ── Inputs ── */}
      <div className="fp-inputs-grid">

        <label className="fp-input-group">
          <span className="fp-input-label">STUBS AVAILABLE</span>
          <input
            type="number" className="fp-input" min={0} step={1000}
            value={stubs}
            onChange={e => setStubs(Math.max(0, Number(e.target.value)))}
          />
        </label>

        <label className="fp-input-group">
          <span className="fp-input-label">DEFAULT ORDERS PER CARD</span>
          <div className="fp-slider-inline">
            <input
              type="range" min={1} max={MAX_ORDERS_HARD}
              value={defaultOrders} className="fp-slider"
              onChange={e => setDefaultOrders(Number(e.target.value))}
            />
            <span className="fp-slider-val">{defaultOrders}</span>
          </div>
          <span className="fp-input-hint">Max {MAX_ORDERS_HARD} buy per card · 20 combined buy+sell limit → keep ≥5 slots for sells</span>
        </label>

        <label className="fp-input-group">
          <span className="fp-input-label">MIN BUY PRICE</span>
          <input
            type="number" className="fp-input" min={0} step={100}
            value={minBuyPrice}
            onChange={e => setMinBuyPrice(Math.max(0, Number(e.target.value)))}
            placeholder="0 = no min"
          />
        </label>

        <label className="fp-input-group">
          <span className="fp-input-label">MAX BUY PRICE</span>
          <input
            type="number" className="fp-input" min={0} step={1000}
            value={maxBuyPrice}
            onChange={e => setMaxBuyPrice(Math.max(0, Number(e.target.value)))}
            placeholder="0 = no max"
          />
        </label>

        <label className="fp-input-group">
          <span className="fp-input-label">MIN PROFIT/FLIP</span>
          <input
            type="number" className="fp-input" min={0} step={50}
            value={minProfit}
            onChange={e => setMinProfit(Math.max(0, Number(e.target.value)))}
          />
        </label>

        <label className="fp-input-group">
          <span className="fp-input-label">MIN SALES/MIN</span>
          <input
            type="number" className="fp-input" min={0} step={0.01}
            value={minSalesPerMin}
            onChange={e => setMinSalesPerMin(Math.max(0, Number(e.target.value)))}
            placeholder="0 = include no-data"
          />
          <span className="fp-input-hint">Excludes cards with no velocity data if &gt; 0</span>
        </label>

        <label className="fp-input-group">
          <span className="fp-input-label">RARITY FILTER</span>
          <select className="fp-select" value={rarityFilter} onChange={e => setRarityFilter(e.target.value)}>
            <option value="All">All rarities</option>
            <option value="Diamond">Diamond only</option>
            <option value="Gold">Gold only</option>
            <option value="Silver">Silver only</option>
            <option value="Bronze">Bronze only</option>
            <option value="Common">Common only</option>
          </select>
        </label>

        <div className="fp-input-group fp-actions-group">
          <button
            className="fp-gen-btn"
            onClick={handleGenerate}
            disabled={!dataReady}
            title={!dataReady ? 'Waiting for market data to load…' : ''}
          >
            {!dataReady ? '⏳ Loading market data…' : '⚡ Generate Plan'}
          </button>
        </div>

      </div>

      {/* ── Per-card limit explainer ── */}
      <div className="fp-rule-note">
        <span className="fp-rule-icon">📐</span>
        <span>
          <strong>Game rule:</strong> max <strong>20 combined buy+sell orders per card</strong> — this limit is per card, not total.
          With {defaultOrders} buy order{defaultOrders !== 1 ? 's' : ''} per card that leaves <strong>{20 - defaultOrders} sell slots</strong> on each card.
          There is <strong>no total order cap</strong> across cards — spread across as many different cards as your stubs allow.
          Fewer orders per card × more cards = faster throughput and lower risk.
        </span>
      </div>

      {/* ── Results ── */}
      {hasRun && (
        <>
          {plan.length === 0 ? (
            <div className="fp-empty">
              No cards match these filters with your current budget.
              Try lowering Min Profit, Min Buy Price, or reducing Min Sales/Min to 0.
            </div>
          ) : (
            <>
              <SummaryBar plan={plan} stubs={stubs} />

              {overBudget && (
                <div className="fp-over-budget">
                  ⚠ Slider adjustments put you {fmtStubs(totalAllocated - stubs)} over budget — reduce orders on some cards.
                </div>
              )}

              <div className="fp-table-wrap">
                <div className="fp-table-actions">
                  <span className="fp-table-count">{plan.length} cards · drag sliders to adjust orders</span>
                  <div className="fp-table-btns">
                    <button className="fp-save-btn" onClick={handleSave}>💾 Save Plan</button>
                    <button className="fp-clear-btn" onClick={handleClear}>✕ Clear</button>
                  </div>
                  {savedAt && (
                    <span className="fp-saved-note">
                      Saved {new Date(savedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                <div className="fp-table-scroll">
                  <table className="fp-table">
                    <thead>
                      <tr>
                        <th className="fp-th-name">Card</th>
                        <th className="fp-th-num">Buy Price</th>
                        <th className="fp-th-num">Sell Price</th>
                        <th className="fp-th-num">Profit</th>
                        <th className="fp-th-num">Sales/Min</th>
                        <th className="fp-th-slider">Buy Orders</th>
                        <th className="fp-th-num">Stubs Tied</th>
                        <th className="fp-th-num">Profit/Hr</th>
                        <th className="fp-th-warn">Fill Time</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.map(row => (
                        <PlanRow
                          key={row.uuid}
                          row={row}
                          maxOrders={MAX_ORDERS_HARD}
                          onOrderChange={handleOrderChange}
                          onRemove={handleRemove}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {!hasRun && dataReady && (
        <div className="fp-idle">
          <div className="fp-idle-icon">📋</div>
          <p>Set your budget and filters above, then click <strong>Generate Plan</strong>.</p>
          <p className="fp-idle-sub">
            The planner ranks cards by profit/min and spreads your stubs across as many cards as
            possible — at most {MAX_ORDERS_HARD} buy orders per card (20 combined buy+sell game limit per card;
            no cap across different cards).
          </p>
        </div>
      )}
    </div>
  )
}
