import { useState, useCallback } from 'react'
import { RARITY_COLORS } from '../constants'
import { DEFAULT_SNIPE_FILTERS } from '../hooks/useSnipeAlerts'

// ── Formatting helpers ─────────────────────────────────────────────
function fmt(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString()
}

function relativeTime(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000)
  if (sec < 60)   return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  return `${Math.floor(sec / 3600)}h ago`
}

const ALL_RARITIES = ['Diamond', 'Gold', 'Silver', 'Bronze', 'Common']

// ── Copy button ────────────────────────────────────────────────────
function CopyBtn({ name }) {
  const [copied, setCopied] = useState(false)
  function handle(e) {
    e.stopPropagation()
    navigator.clipboard.writeText(name).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button className="snipe-copy-btn" onClick={handle}>
      {copied ? '✓ Copied' : '⧉ Copy Name'}
    </button>
  )
}

// ── Single alert card ──────────────────────────────────────────────
function AlertCard({ alert, onDismiss }) {
  const { listing, discount, avg, currentBuyNow, estProfit, detectedAt } = alert
  const item       = listing?.item || {}
  const name       = listing?.listing_name || item?.name || 'Unknown'
  const rarity     = item?.rarity || 'Common'
  const ovr        = item?.ovr
  const team       = item?.team || ''
  const position   = item?.display_position || ''
  const series     = item?.series || item?.set_name || ''
  const img        = item?.baked_img || item?.img
  const colors     = RARITY_COLORS[rarity] || RARITY_COLORS.Common
  const profitable = estProfit > 0

  return (
    <div className="sat-alert-card" style={{ '--snipe-glow': colors.glow, borderColor: `${colors.glow}30` }}>
      {/* Rarity glow strip */}
      <div className="sat-card-strip" style={{ background: colors.glow }} />

      <div className="sat-card-body">
        {/* Image */}
        <div className="sat-card-img-wrap">
          {img
            ? <img src={img} alt={name} className="sat-card-img"
                   onError={e => { e.currentTarget.style.display = 'none' }} />
            : <div className="sat-card-img sat-card-img--ph">?</div>}
        </div>

        {/* Info */}
        <div className="sat-card-info">
          <div className="sat-card-meta-row">
            <span className="rarity-badge"
                  style={{ background: colors.badge, color: colors.text }}>
              {rarity}
            </span>
            {ovr    && <span className="sat-ovr">OVR {ovr}</span>}
            {team   && <span className="sat-team">{team}</span>}
            {position && <span className="sat-pos">{position}</span>}
            {series && <span className="sat-series">{series}</span>}
            <span className="sat-time">{relativeTime(detectedAt)}</span>
          </div>

          <div className="sat-card-name">{name}</div>

          <div className="sat-prices">
            <div className="sat-price-block sat-price-block--buy">
              <span className="sat-price-label">BUY NOW</span>
              <span className="sat-price-val">{fmt(currentBuyNow)}</span>
            </div>
            <span className="sat-price-arrow">→</span>
            <div className="sat-price-block">
              <span className="sat-price-label">AVG SOLD</span>
              <span className="sat-price-val sat-price-val--avg">{fmt(avg)}</span>
            </div>
            <div className="sat-price-block">
              <span className="sat-price-label">DISCOUNT</span>
              <span className="sat-price-val sat-price-val--discount">▼{discount.toFixed(1)}%</span>
            </div>
            <div className="sat-price-block">
              <span className="sat-price-label">EST. PROFIT</span>
              <span className={`sat-price-val ${profitable ? 'sat-price-val--profit' : 'sat-price-val--neg'}`}>
                {profitable ? '+' : ''}{fmt(estProfit)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="sat-card-actions">
          <CopyBtn name={name} />
          <button className="sat-dismiss-btn" onClick={() => onDismiss(alert.id)} title="Dismiss">✕</button>
        </div>
      </div>
    </div>
  )
}

// ── History row ────────────────────────────────────────────────────
function HistoryRow({ entry }) {
  const { listing, discount, avg, currentBuyNow, estProfit, detectedAt, stillAvailable } = entry
  const item   = listing?.item || {}
  const name   = listing?.listing_name || item?.name || 'Unknown'
  const rarity = item?.rarity || 'Common'
  const colors = RARITY_COLORS[rarity] || RARITY_COLORS.Common
  return (
    <div className="sat-history-row">
      <span className="sat-history-name" style={{ color: colors.glow }}>{name}</span>
      <span className="sat-history-meta muted">{item?.display_position || ''} {item?.team || ''}</span>
      <span className="sat-history-price mono">{fmt(currentBuyNow)}</span>
      <span className="sat-history-arrow muted">→</span>
      <span className="sat-history-avg mono">{fmt(avg)}</span>
      <span className="sat-history-disc" style={{ color: '#f87171' }}>−{discount.toFixed(1)}%</span>
      <span className={`sat-history-profit mono ${(estProfit ?? 0) > 0 ? 'green' : 'red'}`}>
        {(estProfit ?? 0) > 0 ? '+' : ''}{fmt(estProfit)}
      </span>
      <span className="sat-history-time muted">{relativeTime(detectedAt)}</span>
      <span className={`sat-avail-dot ${stillAvailable ? 'sat-avail-dot--live' : 'sat-avail-dot--gone'}`}>
        {stillAvailable ? '● live' : '○ gone'}
      </span>
    </div>
  )
}

// ── Filter panel ───────────────────────────────────────────────────
function FilterPanel({ filters, setFilters, soundEnabled, setSoundEnabled }) {
  function setField(key, val) {
    setFilters(prev => ({ ...prev, [key]: val }))
  }

  function toggleRarity(r) {
    setFilters(prev => {
      const has  = prev.rarities.includes(r)
      const next = has ? prev.rarities.filter(x => x !== r) : [...prev.rarities, r]
      return { ...prev, rarities: next }
    })
  }

  function reset() { setFilters(DEFAULT_SNIPE_FILTERS) }

  return (
    <div className="sat-filters">
      <div className="sat-filter-row">
        <div className="sat-filter-group">
          <label className="sat-filter-label">Min Buy Now</label>
          <input className="cf-num-input" type="number" min="0" step="100"
                 value={filters.minBuyNow}
                 onChange={e => setField('minBuyNow', e.target.value === '' ? '' : +e.target.value)}
                 placeholder="0" />
        </div>
        <div className="sat-filter-group">
          <label className="sat-filter-label">Max Buy Now</label>
          <input className="cf-num-input" type="number" min="0" step="100"
                 value={filters.maxBuyNow}
                 onChange={e => setField('maxBuyNow', e.target.value === '' ? '' : +e.target.value)}
                 placeholder="No limit" />
        </div>
        <div className="sat-filter-group">
          <label className="sat-filter-label">Min Discount %</label>
          <input className="cf-num-input" type="number" min="1" max="99" step="1"
                 value={filters.minDiscount}
                 onChange={e => setField('minDiscount', +e.target.value || 1)}
                 placeholder="20" />
        </div>
        <div className="sat-filter-group">
          <label className="sat-filter-label">Sound</label>
          <button className={`snipe-sound-toggle ${soundEnabled ? 'snipe-sound-toggle--on' : ''}`}
                  onClick={() => setSoundEnabled(s => !s)}>
            {soundEnabled ? '🔔 On' : '🔕 Off'}
          </button>
        </div>
        <button className="sat-reset-btn" onClick={reset} title="Reset filters">↺ Reset</button>
      </div>

      <div className="sat-filter-row sat-filter-row--rarities">
        <span className="sat-filter-label">Rarity</span>
        {ALL_RARITIES.map(r => {
          const active = filters.rarities.includes(r)
          const c      = RARITY_COLORS[r] || RARITY_COLORS.Common
          return (
            <button key={r}
                    className={`sat-rarity-btn ${active ? 'sat-rarity-btn--on' : ''}`}
                    style={active ? { background: c.badge, color: c.text, borderColor: c.glow } : {}}
                    onClick={() => toggleRarity(r)}>
              {r}
            </button>
          )
        })}
        <button className="sat-rarity-all-btn"
                onClick={() => setFilters(prev => ({ ...prev, rarities: [...ALL_RARITIES] }))}>
          All
        </button>
        <button className="sat-rarity-all-btn"
                onClick={() => setFilters(prev => ({ ...prev, rarities: [] }))}>
          None
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main tab component
// ═══════════════════════════════════════════════════════════════════
export default function SnipeAlertsTab({
  alerts,
  filteredAlerts,
  history,
  historyOpen, setHistoryOpen,
  filters, setFilters,
  soundEnabled, setSoundEnabled,
  dismissAlert,
  dismissAll,
  clearHistory,
}) {
  const [filtersOpen, setFiltersOpen] = useState(true)

  const hasAlerts  = filteredAlerts.length > 0
  const hasHistory = history.length > 0
  const hiddenCount = alerts.length - filteredAlerts.length

  return (
    <div className="sat-wrap">

      {/* ── Header ── */}
      <div className="sat-header">
        <div className="sat-header-left">
          <span className="sat-title">
            <span className="snipe-pulse-dot" />
            Snipe Alerts
            {alerts.length > 0 && (
              <span className="sat-total-badge">{alerts.length}</span>
            )}
          </span>
          {hasAlerts && (
            <span className="sat-subtitle">
              {filteredAlerts.length} matching · sorted by estimated profit
            </span>
          )}
          {hiddenCount > 0 && (
            <span className="sat-hidden-note">
              {hiddenCount} filtered out by price/rarity settings
            </span>
          )}
        </div>
        <div className="sat-header-right">
          <button className="sat-filters-toggle"
                  onClick={() => setFiltersOpen(o => !o)}>
            {filtersOpen ? '▾' : '▸'} Filters
          </button>
          {hasAlerts && (
            <button className="snipe-dismiss-all-btn" onClick={dismissAll}>
              Dismiss All
            </button>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      {filtersOpen && (
        <FilterPanel
          filters={filters}
          setFilters={setFilters}
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
        />
      )}

      {/* ── Empty state ── */}
      {!hasAlerts && (
        <div className="sat-empty">
          <div className="sat-empty-icon">🎯</div>
          <div className="sat-empty-title">
            {alerts.length === 0
              ? 'No snipes detected yet'
              : `${hiddenCount} alert${hiddenCount !== 1 ? 's' : ''} filtered by current settings`}
          </div>
          <div className="sat-empty-sub">
            {alerts.length === 0
              ? 'Snipe detection runs automatically on every market refresh. Cards must have velocity data (completed orders) to be checked.'
              : 'Adjust the Min Buy Now, Min Discount %, or Rarity filters above to see more alerts.'}
          </div>
          {alerts.length === 0 && (
            <div className="sat-empty-hint">
              Tip: set Min Buy Now to 1,000+ stubs to filter out cheap commons.
              Cards need at least 10 completed orders in their history before they can be snipe-checked.
            </div>
          )}
        </div>
      )}

      {/* ── Alert cards — sorted by estimated profit ── */}
      {hasAlerts && (
        <div className="sat-alerts-list">
          {filteredAlerts.map(alert => (
            <AlertCard key={alert.id} alert={alert} onDismiss={dismissAlert} />
          ))}
        </div>
      )}

      {/* ── History ── */}
      {hasHistory && (
        <div className="sat-history-section">
          <div className="sat-history-toggle"
               role="button" tabIndex={0}
               onClick={() => setHistoryOpen(o => !o)}
               onKeyDown={e => e.key === 'Enter' && setHistoryOpen(o => !o)}>
            <span>{historyOpen ? '▾' : '▸'} Snipe History</span>
            <span className="sat-history-count">
              {history.length} alert{history.length !== 1 ? 's' : ''} this session
            </span>
            <button className="snipe-clear-history-btn"
                    onClick={e => { e.stopPropagation(); clearHistory() }}>
              Clear
            </button>
          </div>

          {historyOpen && (
            <div className="sat-history-list">
              <div className="sat-history-header">
                <span>Card</span>
                <span></span>
                <span>Buy Now</span>
                <span></span>
                <span>Avg</span>
                <span>Disc %</span>
                <span>Profit</span>
                <span>When</span>
                <span>Status</span>
              </div>
              {history.map((entry, i) => (
                <HistoryRow key={entry.id ?? i} entry={entry} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
