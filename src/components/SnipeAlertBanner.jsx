import { useState, useCallback } from 'react'
import { RARITY_COLORS } from '../constants'

function fmt(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString()
}

function relativeTime(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000)
  if (sec < 60)  return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  return `${Math.floor(sec / 3600)}h ago`
}

function CopyBtn({ name }) {
  const [copied, setCopied] = useState(false)
  function handleCopy(e) {
    e.stopPropagation()
    navigator.clipboard.writeText(name).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button className="snipe-copy-btn" onClick={handleCopy}>
      {copied ? '✓ Copied' : '⧉ Copy Name'}
    </button>
  )
}

function AlertCard({ alert, onDismiss }) {
  const { listing, discount, avg, currentBuyNow, estProfit, detectedAt } = alert
  const item     = listing?.item || {}
  const name     = listing?.listing_name || item?.name || 'Unknown'
  const rarity   = item?.rarity || 'Common'
  const ovr      = item?.ovr
  const img      = item?.img
  const colors   = RARITY_COLORS[rarity] || RARITY_COLORS.Common
  const profitable = estProfit > 0

  return (
    <div className={`snipe-alert-card snipe-alert-card--${rarity.toLowerCase()}`}
         style={{ '--snipe-glow': colors.glow }}>
      <div className="snipe-alert-pulse-border" />

      <div className="snipe-alert-body">
        {/* Left: card image */}
        <div className="snipe-alert-img-wrap">
          {img
            ? <img src={img} alt={name} className="snipe-alert-img" />
            : <div className="snipe-alert-img snipe-alert-img--placeholder">?</div>
          }
        </div>

        {/* Center: info */}
        <div className="snipe-alert-info">
          <div className="snipe-alert-badge-row">
            <span className="rarity-badge"
                  style={{ background: colors.badge, color: colors.text }}>
              {rarity}
            </span>
            {ovr && <span className="snipe-alert-ovr">OVR {ovr}</span>}
            <span className="snipe-alert-time">{relativeTime(detectedAt)}</span>
          </div>

          <div className="snipe-alert-name">{name}</div>

          <div className="snipe-alert-prices">
            <div className="snipe-alert-price-block snipe-alert-price-block--buy">
              <span className="snipe-alert-price-label">BUY NOW</span>
              <span className="snipe-alert-price-value">{fmt(currentBuyNow)}</span>
            </div>
            <div className="snipe-alert-price-arrow">→</div>
            <div className="snipe-alert-price-block">
              <span className="snipe-alert-price-label">AVG SOLD</span>
              <span className="snipe-alert-price-value snipe-alert-price-value--avg">{fmt(avg)}</span>
            </div>
          </div>

          <div className="snipe-alert-stats">
            <span className="snipe-alert-discount">
              ▼ {discount.toFixed(1)}% below avg
            </span>
            <span className={`snipe-alert-profit ${profitable ? 'snipe-alert-profit--pos' : 'snipe-alert-profit--neg'}`}>
              Est. profit: {profitable ? '+' : ''}{fmt(estProfit)} stubs
            </span>
          </div>
        </div>

        {/* Right: actions */}
        <div className="snipe-alert-actions">
          <CopyBtn name={name} />
          <button className="snipe-dismiss-btn" onClick={() => onDismiss(alert.id)}
                  title="Dismiss">✕</button>
        </div>
      </div>
    </div>
  )
}

function HistoryRow({ entry }) {
  const { listing, discount, currentBuyNow, detectedAt, stillAvailable } = entry
  const item = listing?.item || {}
  const name = listing?.listing_name || item?.name || 'Unknown'
  return (
    <div className="snipe-history-row">
      <span className="snipe-history-name">{name}</span>
      <span className="snipe-history-price">{fmt(currentBuyNow)}</span>
      <span className="snipe-history-discount">−{discount.toFixed(1)}%</span>
      <span className="snipe-history-time">{relativeTime(detectedAt)}</span>
      <span className={`snipe-history-avail ${stillAvailable ? 'snipe-history-avail--yes' : 'snipe-history-avail--gone'}`}>
        {stillAvailable ? '● live' : '○ gone'}
      </span>
    </div>
  )
}

export default function SnipeAlertBanner({
  alerts,
  history,
  historyOpen,
  setHistoryOpen,
  threshold,
  setThreshold,
  soundEnabled,
  setSoundEnabled,
  dismissAlert,
  dismissAll,
  clearHistory,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleThreshold = useCallback((e) => {
    const v = Number(e.target.value)
    if (Number.isFinite(v) && v > 0 && v <= 99) setThreshold(v)
  }, [setThreshold])

  const hasAlerts  = alerts.length > 0
  const hasHistory = history.length > 0

  if (!hasAlerts && !hasHistory) return null

  return (
    <div className="snipe-banner-wrap">
      {/* ── Active alerts ── */}
      {hasAlerts && (
        <div className="snipe-alerts-section">
          <div className="snipe-alerts-header">
            <span className="snipe-alerts-title">
              <span className="snipe-pulse-dot" />
              SNIPE ALERTS
              <span className="snipe-count-badge">{alerts.length}</span>
            </span>
            <div className="snipe-header-actions">
              <button className="snipe-settings-btn"
                      onClick={() => setSettingsOpen(o => !o)}>
                ⚙ Settings
              </button>
              <button className="snipe-dismiss-all-btn" onClick={dismissAll}>
                Dismiss All
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {settingsOpen && (
            <div className="snipe-settings-panel">
              <label className="snipe-setting-row">
                <span className="snipe-setting-label">Alert threshold</span>
                <div className="snipe-setting-input-wrap">
                  <input
                    type="number"
                    min="1" max="99" step="1"
                    value={threshold}
                    onChange={handleThreshold}
                    className="snipe-threshold-input"
                  />
                  <span className="snipe-setting-unit">% below avg</span>
                </div>
              </label>
              <label className="snipe-setting-row snipe-setting-row--toggle">
                <span className="snipe-setting-label">Sound notification</span>
                <button
                  className={`snipe-sound-toggle ${soundEnabled ? 'snipe-sound-toggle--on' : ''}`}
                  onClick={() => setSoundEnabled(s => !s)}
                >
                  {soundEnabled ? '🔔 On' : '🔕 Off'}
                </button>
              </label>
            </div>
          )}

          {/* Alert cards — newest on top */}
          <div className="snipe-alerts-list">
            {alerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} onDismiss={dismissAlert} />
            ))}
          </div>
        </div>
      )}

      {/* ── Snipe History ── */}
      {hasHistory && (
        <div className="snipe-history-section">
          <div
            className="snipe-history-toggle"
            role="button"
            tabIndex={0}
            onClick={() => setHistoryOpen(o => !o)}
            onKeyDown={e => e.key === 'Enter' && setHistoryOpen(o => !o)}
          >
            <span>{historyOpen ? '▾' : '▸'} Snipe History</span>
            <span className="snipe-history-count">{history.length} alert{history.length !== 1 ? 's' : ''} this session</span>
            {hasHistory && (
              <button className="snipe-clear-history-btn"
                      onClick={(e) => { e.stopPropagation(); clearHistory() }}>
                Clear
              </button>
            )}
          </div>

          {historyOpen && (
            <div className="snipe-history-list">
              <div className="snipe-history-header-row">
                <span>Card</span>
                <span>Price</span>
                <span>Discount</span>
                <span>Detected</span>
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
