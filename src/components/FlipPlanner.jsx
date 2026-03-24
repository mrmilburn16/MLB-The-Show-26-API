import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import CopyableName from './CopyableName'

// ── Constants ──────────────────────────────────────────────────────
const MARKET_TAX      = 0.9    // 10% SDS market tax
const MAX_BUY_HARD    = 15     // never suggest more than 15 buy orders per card
//   (20 combined buy+sell per card is the game limit PER CARD — no total cap across cards)
const LS_KEY          = 'fp_plan_v3'

const RARITY_COLOR = {
  Diamond: '#4da6ff', Gold: '#ffd644', Silver: '#9aafc0',
  Bronze: '#cd7f3a',  Common: '#7a8a6a',
}

// ── Pure helpers ───────────────────────────────────────────────────

const profitAfterTax = (sell, buy) => Math.floor(sell * MARKET_TAX) - buy

function fmtStubs(n) {
  if (n == null || isNaN(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return Math.round(n).toLocaleString()
}

function fmtNum(n, dec = 3) {
  if (n == null || isNaN(n)) return '—'
  return n.toFixed(dec)
}

// ── Candidate extraction (filtered + sorted) ───────────────────────

function extractCandidates(allListings, velocityMap, minSalesPerMin, minRoi) {
  const out = []
  for (const l of allListings) {
    const buyPrice  = l.best_buy_price  || 0
    const sellPrice = l.best_sell_price || 0
    if (buyPrice <= 0 || sellPrice <= 0) continue

    const profit = profitAfterTax(sellPrice, buyPrice)
    if (profit <= 0) continue

    const roi = (profit / buyPrice) * 100
    if (roi < minRoi) continue

    const uuid = l.uuid || l.item?.uuid
    const vel  = uuid ? velocityMap[uuid] : null
    if (!vel?.salesPerMin || vel.salesPerMin <= 0) continue   // must have velocity data

    const salesPerMin    = vel.salesPerMin
    const profitPerMin   = vel.profitPerMin ?? (profit * salesPerMin)
    const velocityWindow = vel.velocityWindow ?? null

    if (salesPerMin < minSalesPerMin) continue

    out.push({
      uuid,
      name:         l.listing_name || l.item?.name || '—',
      rarity:       l.item?.rarity || 'Common',
      position:     l.item?.display_position || '—',
      ovr:          l.item?.ovr ?? null,
      buyPrice,
      sellPrice,
      profit,
      roi,
      salesPerMin,
      profitPerMin,
      velocityWindow,
    })
  }

  // Sort by profitPerMin descending
  out.sort((a, b) => b.profitPerMin - a.profitPerMin || b.profit - a.profit)
  return out
}

// ── Core planning algorithm ────────────────────────────────────────
//
// Per-card order count = min(maxOrdersPerCard, floor(salesPerMin × 60))
//   → don't place more orders than could fill in an hour at this velocity
//
// After initial pass, if budget remains we round-robin add orders
// to existing cards (sorted by profitPerMin) up to their ceiling.

function buildPlan(candidates, budgetStubs, maxOrdersPerCard) {
  if (!candidates.length || budgetStubs <= 0) return []

  let remaining = budgetStubs
  const rows = []

  // ── Pass 1: greedy allocation ──────────────────────────────────
  for (const card of candidates) {
    if (remaining < card.buyPrice) continue

    // Velocity ceiling: no point placing more orders than can fill in an hour
    const velocityCap  = Math.max(1, Math.floor(card.salesPerMin * 60))
    const affordableCap = Math.floor(remaining / card.buyPrice)
    const orders = Math.min(maxOrdersPerCard, velocityCap, affordableCap)
    if (orders < 1) continue

    const stubsUsed = card.buyPrice * orders
    rows.push({ ...card, orders, _velocityCap: velocityCap })
    remaining -= stubsUsed
  }

  // ── Pass 2: round-robin top-up while budget remains ────────────
  // Continuously cycle through the plan (sorted by profitPerMin) and add 1
  // order at a time to the first card that hasn't hit its ceiling.
  let improved = true
  while (improved && remaining > 0) {
    improved = false
    for (const row of rows) {
      if (remaining < row.buyPrice) continue
      const ceiling = Math.min(maxOrdersPerCard, row._velocityCap)
      if (row.orders >= ceiling) continue
      row.orders  += 1
      remaining   -= row.buyPrice
      improved     = true
      if (remaining <= 0) break
    }
  }

  return rows
}

// ── Copy plan to clipboard ─────────────────────────────────────────

function planToText(plan, stubs, budgetPct, totalProfitHr, competitionFactor) {
  const lines = [
    `Flip Plan — ${stubs.toLocaleString()} stubs (${budgetPct}% budget, ${competitionFactor}% competition factor)`,
    '',
    ...plan.map(r =>
      `${r.name} — Buy at ${r.buyPrice.toLocaleString()} × ${r.orders} order${r.orders !== 1 ? 's' : ''} (${(r.buyPrice * r.orders).toLocaleString()} stubs)`
    ),
    '',
    `Est. profit/hour: ~${fmtStubs(Math.round(totalProfitHr))} stubs`,
  ]
  return lines.join('\n')
}

// ── Small sub-components ───────────────────────────────────────────

function RarityPip({ rarity }) {
  return <span style={{ color: RARITY_COLOR[rarity] || '#9aafc0', fontSize: 9 }}>●</span>
}

function CopyBtn({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)
  function doCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button className="fp-copy-btn" onClick={doCopy}>
      {copied ? '✓ Copied' : label}
    </button>
  )
}

function VelSupport({ orders, velocityCap, salesPerMin }) {
  if (!salesPerMin) return null
  const fillsPerHr = Math.min(orders, Math.floor(salesPerMin * 60))
  const pct        = velocityCap > 0 ? Math.round((orders / velocityCap) * 100) : 100
  const color      = pct > 90 ? '#f87171' : pct > 60 ? '#fbbf24' : '#4ade80'
  return (
    <span
      className="fp-vel-pip"
      style={{ color }}
      title={`Velocity supports ${velocityCap} orders/hr · ${fillsPerHr} fills/hr at ${orders} orders`}
    >
      {pct > 90 ? '⚠' : '✓'} {fillsPerHr}/hr
    </span>
  )
}

// ── Plan row ──────────────────────────────────────────────────────

function PlanRow({ row, maxOrders, competitionFactor, onOrderChange, onRemove }) {
  const stubsUsed       = row.buyPrice * row.orders
  const totalFillsPerHr = row.salesPerMin ? row.salesPerMin * 60 : null
  const fillsPerHour    = totalFillsPerHr != null
    ? Math.min(totalFillsPerHr * (competitionFactor / 100), row.orders)
    : null
  const profitPerHr  = fillsPerHour != null ? row.profit * fillsPerHour : null
  const rarityColor  = RARITY_COLOR[row.rarity] || '#9aafc0'

  return (
    <tr className="fp-row">
      <td className="fp-cell-name">
        <div className="fp-name">
          <CopyableName name={row.name} />
        </div>
        <div className="fp-meta">
          <RarityPip rarity={row.rarity} />
          <span style={{ color: rarityColor, fontSize: 10 }}>{row.rarity}</span>
          {row.ovr   && <span className="fp-ovr">{row.ovr}</span>}
          <span className="fp-pos">{row.position}</span>
        </div>
      </td>
      <td className="fp-cell-num">{fmtStubs(row.buyPrice)}</td>
      <td className="fp-cell-num">{fmtStubs(row.sellPrice)}</td>
      <td className="fp-cell-num fp-col-profit">{fmtStubs(row.profit)}</td>
      <td className="fp-cell-num fp-col-roi">
        <span style={{ color: row.roi >= 15 ? '#4ade80' : row.roi >= 8 ? '#fbbf24' : '#fb923c' }}>
          {row.roi != null ? row.roi.toFixed(1) : '—'}%
        </span>
      </td>
      <td className="fp-cell-num">
        {fmtNum(row.salesPerMin)}
        {row.velocityWindow && (
          <span className={`fp-vel-window fp-vel-window--${row.velocityWindow === '1h' ? 'fresh' : 'stale'}`}>
            {row.velocityWindow}
          </span>
        )}
      </td>
      <td className="fp-cell-orders">
        <div className="fp-orders-cell">
          <input
            type="range" min={1} max={Math.min(maxOrders, row._velocityCap ?? maxOrders)}
            value={row.orders} className="fp-slider"
            onChange={e => onOrderChange(row.uuid, Number(e.target.value))}
          />
          <span className="fp-slider-val">{row.orders}</span>
        </div>
        <VelSupport orders={row.orders} velocityCap={row._velocityCap ?? maxOrders} salesPerMin={row.salesPerMin} />
      </td>
      <td className="fp-cell-num fp-col-tied">{fmtStubs(stubsUsed)}</td>
      <td className="fp-cell-num">
        {fillsPerHour != null ? fillsPerHour.toFixed(1) : <span className="fp-dim">—</span>}
      </td>
      <td className="fp-cell-num fp-col-profhr">
        {profitPerHr != null ? fmtStubs(Math.round(profitPerHr)) : <span className="fp-dim">—</span>}
      </td>
      <td className="fp-cell-action">
        <button className="fp-remove-btn" onClick={() => onRemove(row.uuid)} title="Remove">✕</button>
      </td>
    </tr>
  )
}

// ── Summary bar ───────────────────────────────────────────────────

function SummaryBar({ plan, stubs, budgetPct, hoursPerDay, competitionFactor }) {
  const totalAllocated = plan.reduce((s, r) => s + r.buyPrice * r.orders, 0)
  const totalOrders    = plan.reduce((s, r) => s + r.orders, 0)
  const reserve        = stubs - totalAllocated
  const utilPct        = stubs > 0 ? Math.round(totalAllocated / stubs * 100) : 0

  const totalProfitHr = plan.reduce((s, r) => {
    if (!r.salesPerMin) return s
    const myFills = Math.min(r.salesPerMin * 60 * (competitionFactor / 100), r.orders)
    return s + r.profit * myFills
  }, 0)
  const totalProfitDay = totalProfitHr * hoursPerDay

  const stats = [
    { label: 'STUBS ALLOCATED', value: fmtStubs(totalAllocated), sub: `${utilPct}% of ${fmtStubs(stubs)}` },
    { label: 'IN RESERVE',      value: fmtStubs(reserve), sub: 'unallocated', color: reserve < 0 ? '#f87171' : '#4ade80' },
    { label: 'CARDS IN PLAN',   value: plan.length,       sub: `${totalOrders} buy orders total` },
    { label: 'PROFIT / HOUR',   value: totalProfitHr > 0 ? fmtStubs(Math.round(totalProfitHr)) : '—', sub: 'across all cards', color: '#ffd644' },
    { label: `PROFIT / DAY (${hoursPerDay}h)`, value: totalProfitDay > 0 ? fmtStubs(Math.round(totalProfitDay)) : '—', sub: `at ${hoursPerDay}h active`, color: '#a78bfa' },
  ]

  return (
    <div className="fp-summary">
      {stats.map(s => (
        <div key={s.label} className="fp-summary-stat">
          <span className="fp-summary-label">{s.label}</span>
          <span className="fp-summary-value" style={s.color ? { color: s.color } : {}}>{s.value}</span>
          <span className="fp-summary-sub">{s.sub}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────

export default function FlipPlanner({ allListings = [], velocityMap = {} }) {

  // ── Inputs ──
  const [stubs,            setStubs]            = useState(90000)
  const [budgetPct,        setBudgetPct]        = useState(90)
  const [minSalesPerMin,   setMinSalesPerMin]   = useState(0.08)
  const [maxOrdersPerCard, setMaxOrdersPerCard] = useState(5)
  const [hoursPerDay,      setHoursPerDay]      = useState(3)
  const [competitionFactor, setCompetitionFactor] = useState(25)
  const [minRoi,           setMinRoi]           = useState(5)

  // ── Candidates version — bump to force rebuild on button press ──
  const [version, setVersion] = useState(0)

  // ── Per-card order overrides (user's slider adjustments) ──
  const [orderOverrides, setOrderOverrides] = useState({})

  // ── Load saved settings from localStorage ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return
      const s = JSON.parse(raw)
      if (s.stubs)           setStubs(s.stubs)
      if (s.budgetPct)       setBudgetPct(s.budgetPct)
      if (s.minSalesPerMin != null) setMinSalesPerMin(s.minSalesPerMin)
      if (s.maxOrdersPerCard) setMaxOrdersPerCard(s.maxOrdersPerCard)
      if (s.hoursPerDay)     setHoursPerDay(s.hoursPerDay)
      if (s.competitionFactor != null) setCompetitionFactor(s.competitionFactor)
      if (s.minRoi           != null) setMinRoi(s.minRoi)
    } catch { /* ignore */ }
  }, [])

  // ── Candidates — filtered + sorted, recomputes on version bump ──
  const candidates = useMemo(() => {
    void version  // dependency: bump to force recompute
    return extractCandidates(allListings, velocityMap, minSalesPerMin, minRoi)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allListings, velocityMap, minSalesPerMin, minRoi, version])

  // ── Raw plan — fully reactive to budget slider and maxOrders slider ──
  const rawPlan = useMemo(() => {
    const budgetStubs = Math.floor(stubs * budgetPct / 100)
    return buildPlan(candidates, budgetStubs, maxOrdersPerCard)
  }, [candidates, stubs, budgetPct, maxOrdersPerCard])

  // Clear overrides when the card set changes
  const prevUuidsRef = useRef(new Set())
  useEffect(() => {
    const newUuids = new Set(rawPlan.map(r => r.uuid))
    const changed  = rawPlan.some(r => !prevUuidsRef.current.has(r.uuid)) ||
                     [...prevUuidsRef.current].some(u => !newUuids.has(u))
    if (changed) setOrderOverrides({})
    prevUuidsRef.current = newUuids
  }, [rawPlan])

  // ── Display plan — apply per-card overrides on top of raw plan ──
  const plan = useMemo(() => rawPlan.map(row => ({
    ...row,
    orders: Math.min(
      orderOverrides[row.uuid] ?? row.orders,
      Math.min(maxOrdersPerCard, row._velocityCap ?? maxOrdersPerCard),
    ),
  })), [rawPlan, orderOverrides, maxOrdersPerCard])

  // ── Totals ──
  const totalAllocated = plan.reduce((s, r) => s + r.buyPrice * r.orders, 0)
  const totalProfitHr  = plan.reduce((s, r) => {
    if (!r.salesPerMin) return s
    const myFills = Math.min(r.salesPerMin * 60 * (competitionFactor / 100), r.orders)
    return s + r.profit * myFills
  }, 0)

  // ── Velocity coverage ──
  const velCoverage = useMemo(() => {
    const total   = allListings.length
    const covered = allListings.filter(l => {
      const uuid = l.uuid || l.item?.uuid
      return uuid && velocityMap[uuid]?.salesPerMin > 0
    }).length
    return { total, covered, pct: total > 0 ? Math.round(covered / total * 100) : 0 }
  }, [allListings, velocityMap])

  // ── Handlers ──
  const handleOrderChange = useCallback((uuid, v) => {
    setOrderOverrides(prev => ({ ...prev, [uuid]: v }))
  }, [])

  const handleRemove = useCallback((uuid) => {
    setOrderOverrides(prev => { const n = { ...prev }; delete n[uuid]; return n })
    // Mark as removed by setting an override of 0 — we filter in plan memo
    // Actually easier: just remove from rawPlan via a separate "removed" set
    setRemovedUuids(prev => new Set([...prev, uuid]))
  }, [])

  const [removedUuids, setRemovedUuids] = useState(new Set())

  const visiblePlan = useMemo(() =>
    plan.filter(r => !removedUuids.has(r.uuid))
  , [plan, removedUuids])

  // Clear removed set when raw plan changes
  useEffect(() => { setRemovedUuids(new Set()) }, [rawPlan])

  function handleRebuild() {
    setVersion(v => v + 1)
    setOrderOverrides({})
    setRemovedUuids(new Set())
  }

  function handleSave() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        stubs, budgetPct, minSalesPerMin, maxOrdersPerCard, hoursPerDay, competitionFactor, minRoi, ts: Date.now(),
      }))
    } catch { /* ignore */ }
  }

  const copyText = planToText(visiblePlan, stubs, budgetPct, totalProfitHr, competitionFactor)
  const dataReady = allListings.length > 0

  const budgetStubs = Math.floor(stubs * budgetPct / 100)

  return (
    <div className="fp-wrap">

      {/* ── Header ── */}
      <div className="fp-header">
        <div className="fp-header-text">
          <h2 className="fp-title">📋 Flip Planner</h2>
          <p className="fp-subtitle">
            Optimizes your stub allocation · 20 orders per card max (buy+sell combined, PER CARD — no total cap) ·
            budget slider updates plan live
          </p>
        </div>
        <div className="fp-header-right">
          {velCoverage.total > 0 && (
            <div className="fp-vel-coverage">
              <div className="fp-vel-bar-wrap">
                <div className="fp-vel-bar" style={{ width: `${velCoverage.pct}%` }} />
              </div>
              <span className="fp-vel-label">
                Velocity data: {velCoverage.covered.toLocaleString()} / {velCoverage.total.toLocaleString()} cards ({velCoverage.pct}%)
              </span>
            </div>
          )}
          <button
            className="fp-rebuild-btn"
            onClick={handleRebuild}
            disabled={!dataReady}
          >
            ↺ Rebuild Plan
          </button>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="fp-controls">

        {/* Stubs */}
        <div className="fp-ctrl-group">
          <label className="fp-ctrl-label">AVAILABLE STUBS</label>
          <input
            type="number" className="fp-ctrl-input" min={0} step={1000}
            value={stubs}
            onChange={e => setStubs(Math.max(0, Number(e.target.value)))}
          />
        </div>

        {/* Budget % */}
        <div className="fp-ctrl-group fp-ctrl-group--wide">
          <label className="fp-ctrl-label">
            BUDGET TO DEPLOY
            <span className="fp-ctrl-value-inline fp-budget-pct">{budgetPct}%</span>
            <span className="fp-ctrl-sub">{fmtStubs(budgetStubs)} stubs · {fmtStubs(stubs - budgetStubs)} reserve</span>
          </label>
          <input
            type="range" min={10} max={100} step={1}
            value={budgetPct} className="fp-slider fp-slider--wide"
            onChange={e => setBudgetPct(Number(e.target.value))}
          />
          <div className="fp-slider-ticks">
            {[10,25,50,75,90,100].map(v => (
              <button key={v} className={`fp-tick-btn ${budgetPct === v ? 'fp-tick-btn--active' : ''}`}
                onClick={() => setBudgetPct(v)}>{v}%</button>
            ))}
          </div>
        </div>

        {/* Min sales/min */}
        <div className="fp-ctrl-group fp-ctrl-group--wide">
          <label className="fp-ctrl-label">
            MIN SALES / MIN
            <span className="fp-ctrl-value-inline">{minSalesPerMin.toFixed(2)}</span>
            <span className="fp-ctrl-sub">
              {minSalesPerMin === 0
                ? 'any velocity'
                : `≈ ${Math.round(minSalesPerMin * 60)} sales/hr minimum`}
            </span>
          </label>
          <input
            type="range" min={0} max={0.5} step={0.01}
            value={minSalesPerMin} className="fp-slider fp-slider--wide"
            onChange={e => setMinSalesPerMin(Number(e.target.value))}
          />
          <div className="fp-slider-ticks">
            {[0, 0.05, 0.08, 0.15, 0.3, 0.5].map(v => (
              <button key={v} className={`fp-tick-btn ${minSalesPerMin === v ? 'fp-tick-btn--active' : ''}`}
                onClick={() => setMinSalesPerMin(v)}>{v}</button>
            ))}
          </div>
        </div>

        {/* Min ROI % */}
        <div className="fp-ctrl-group fp-ctrl-group--wide">
          <label className="fp-ctrl-label">
            MIN ROI %
            <span className="fp-ctrl-value-inline fp-roi-pct">{minRoi}%</span>
            <span className="fp-ctrl-sub">
              profit ÷ buy price · filters out low-margin cards tying up capital
            </span>
          </label>
          <input
            type="range" min={0} max={30} step={1}
            value={minRoi} className="fp-slider fp-slider--wide fp-slider--roi"
            onChange={e => setMinRoi(Number(e.target.value))}
          />
          <div className="fp-slider-ticks">
            {[0, 3, 5, 10, 15, 20].map(v => (
              <button key={v} className={`fp-tick-btn ${minRoi === v ? 'fp-tick-btn--active' : ''}`}
                onClick={() => setMinRoi(v)}>{v}%</button>
            ))}
          </div>
        </div>

        {/* Max orders per card */}
        <div className="fp-ctrl-group fp-ctrl-group--wide">
          <label className="fp-ctrl-label">
            MAX BUY ORDERS / CARD
            <span className="fp-ctrl-value-inline">{maxOrdersPerCard}</span>
            <span className="fp-ctrl-sub">
              {maxOrdersPerCard} buy + {20 - maxOrdersPerCard} sell = 20 per card (game limit)
              {maxOrdersPerCard <= 5 ? ' · ✓ Spread wide' : maxOrdersPerCard <= 10 ? ' · Balanced' : ' · ⚠ Concentrated'}
            </span>
          </label>
          <input
            type="range" min={1} max={MAX_BUY_HARD}
            value={maxOrdersPerCard} className="fp-slider fp-slider--wide"
            onChange={e => setMaxOrdersPerCard(Number(e.target.value))}
          />
          <div className="fp-slider-ticks">
            {[1,3,5,8,10,15].map(v => (
              <button key={v} className={`fp-tick-btn ${maxOrdersPerCard === v ? 'fp-tick-btn--active' : ''}`}
                onClick={() => setMaxOrdersPerCard(v)}>{v}</button>
            ))}
          </div>
        </div>

        {/* Competition factor */}
        <div className="fp-ctrl-group fp-ctrl-group--wide">
          <label className="fp-ctrl-label">
            COMPETITION FACTOR — % of fills you expect to win
            <span className="fp-ctrl-value-inline fp-comp-pct">{competitionFactor}%</span>
            <span className="fp-ctrl-sub">
              {competitionFactor === 100
                ? 'No competition (unrealistic)'
                : competitionFactor >= 75 ? 'Low competition — quiet market'
                : competitionFactor >= 40 ? 'Moderate competition'
                : competitionFactor >= 20 ? 'High competition — realistic for popular cards'
                : 'Very high competition — saturated market'}
            </span>
          </label>
          <input
            type="range" min={10} max={100} step={5}
            value={competitionFactor} className="fp-slider fp-slider--wide fp-slider--comp"
            onChange={e => setCompetitionFactor(Number(e.target.value))}
          />
          <div className="fp-slider-ticks">
            {[10, 25, 50, 75, 100].map(v => (
              <button key={v} className={`fp-tick-btn ${competitionFactor === v ? 'fp-tick-btn--active' : ''}`}
                onClick={() => setCompetitionFactor(v)}>{v}%</button>
            ))}
          </div>
        </div>

        {/* Hours per day */}
        <div className="fp-ctrl-group">
          <label className="fp-ctrl-label">HOURS / DAY FLIPPING</label>
          <input
            type="number" className="fp-ctrl-input" min={1} max={24} step={0.5}
            value={hoursPerDay}
            onChange={e => setHoursPerDay(Math.max(0.5, Math.min(24, Number(e.target.value))))}
          />
        </div>

      </div>

      {/* ── Order logic explainer ── */}
      <div className="fp-rule-note">
        <span className="fp-rule-icon">📐</span>
        <div className="fp-rule-body">
          <div className="fp-rule-row">
            <span className="fp-rule-chip fp-rule-chip--green">PER CARD</span>
            Max 20 combined buy+sell orders on any one card. At {maxOrdersPerCard} buy orders → {20 - maxOrdersPerCard} sell slots.
          </div>
          <div className="fp-rule-row">
            <span className="fp-rule-chip fp-rule-chip--blue">NO TOTAL CAP</span>
            Unlimited different cards simultaneously. Spread wide beats stacking.
          </div>
          <div className="fp-rule-row">
            <span className="fp-rule-chip fp-rule-chip--gold">ALGORITHM</span>
            Orders per card = min({maxOrdersPerCard}, floor(sales/min × 60)) — never suggests more orders than velocity can fill in an hour.
            Remaining budget is round-robined to top cards.
          </div>
        </div>
      </div>

      {/* ── Plan ── */}
      {!dataReady ? (
        <div className="fp-idle">
          <div className="fp-idle-icon">⏳</div>
          <p>Waiting for market data to load…</p>
        </div>
      ) : candidates.length === 0 ? (
        <div className="fp-idle">
          <div className="fp-idle-icon">📊</div>
          <p>No cards match your filters. Lower Min Sales/Min or wait for more velocity data.</p>
          <p className="fp-idle-sub">
            Velocity data covers {velCoverage.covered} / {velCoverage.total} cards.
            Cards without velocity data are excluded since we can't estimate fills.
          </p>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <SummaryBar
            plan={visiblePlan}
            stubs={stubs}
            budgetPct={budgetPct}
            hoursPerDay={hoursPerDay}
            competitionFactor={competitionFactor}
          />

          {/* Table toolbar */}
          <div className="fp-table-wrap">
            <div className="fp-table-actions">
              <span className="fp-table-count">
                {visiblePlan.length} cards · {visiblePlan.reduce((s,r) => s+r.orders,0)} buy orders ·
                {fmtStubs(Math.floor(stubs * budgetPct / 100) - totalAllocated)} unallocated
              </span>
              <div className="fp-table-btns">
                <CopyBtn text={copyText} label="📋 Copy Plan" />
                <button className="fp-save-btn" onClick={handleSave}>💾 Save Settings</button>
              </div>
            </div>

            <div className="fp-table-scroll">
              <table className="fp-table">
                <thead>
                  <tr>
                    <th className="fp-th-name">Card</th>
                    <th className="fp-th-num">Buy</th>
                    <th className="fp-th-num">Sell</th>
                    <th className="fp-th-num">Profit</th>
                    <th className="fp-th-num">ROI %</th>
                    <th className="fp-th-num">Sales/Min</th>
                    <th className="fp-th-orders">Buy Orders</th>
                    <th className="fp-th-num">Stubs Tied</th>
                    <th className="fp-th-num">Fills/Hr</th>
                    <th className="fp-th-num">Profit/Hr</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlan.map(row => (
                    <PlanRow
                      key={row.uuid}
                      row={row}
                      maxOrders={maxOrdersPerCard}
                      competitionFactor={competitionFactor}
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
    </div>
  )
}
