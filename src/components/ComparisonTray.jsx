import { useState } from 'react'
import { RARITY_COLORS } from '../constants'

function relTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)   return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export default function ComparisonTray({
  tray,
  history,
  isTrayFull,
  onRemove,
  onClear,
  onCompareNow,
  onClearHistory,
}) {
  const [showHistory, setShowHistory] = useState(false)

  if (tray.length === 0 && history.length === 0) return null

  const canCompare = tray.length >= 2

  return (
    <div className="cmp-tray">
      <div className="cmp-tray-inner">

        {/* ── Left: label + cards ── */}
        <div className="cmp-tray-left">
          <span className="cmp-tray-label">
            COMPARE
            <span className="cmp-tray-count">{tray.length}/{3}</span>
          </span>

          <div className="cmp-tray-cards">
            {tray.map(({ uuid, listing }) => {
              const item    = listing.item || {}
              const name    = listing.listing_name || item.name || uuid
              const rarity  = item.rarity || 'Common'
              const colors  = RARITY_COLORS[rarity] || RARITY_COLORS.Common
              const imgSrc  = item.baked_img || item.img || ''
              return (
                <div key={uuid} className="cmp-tray-chip"
                     style={{ borderColor: `${colors.glow}55` }}>
                  {imgSrc && (
                    <img src={imgSrc} alt="" className="cmp-tray-chip-img"
                         onError={e => { e.currentTarget.style.display = 'none' }} />
                  )}
                  <div className="cmp-tray-chip-info">
                    <span className="cmp-tray-chip-name">{name}</span>
                    <span className="cmp-tray-chip-meta" style={{ color: colors.glow }}>
                      {item.display_position || ''}
                      {item.ovr ? ` · OVR ${item.ovr}` : ''}
                    </span>
                  </div>
                  <button className="cmp-tray-chip-remove" onClick={() => onRemove(uuid)}
                          title="Remove from comparison">✕</button>
                </div>
              )
            })}

            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 2 - tray.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="cmp-tray-chip cmp-tray-chip--empty">
                <span>+ Add card</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: actions ── */}
        <div className="cmp-tray-actions">
          {history.length > 0 && (
            <div className="cmp-history-wrap">
              <button
                className="cmp-tray-btn cmp-tray-btn--ghost"
                onClick={() => setShowHistory(v => !v)}
              >
                🕐 Recent {history.length > 0 && `(${history.length})`}
              </button>

              {showHistory && (
                <div className="cmp-history-dropdown">
                  <div className="cmp-history-header">
                    <span>Recent Comparisons</span>
                    <button className="cmp-history-clear" onClick={() => { onClearHistory(); setShowHistory(false) }}>
                      Clear All
                    </button>
                  </div>
                  {history.map(entry => (
                    <div key={entry.id} className="cmp-history-entry">
                      <div className="cmp-history-cards">
                        {entry.cards.map(c => (
                          <span key={c.uuid} className="cmp-history-card-name">
                            {c.name}
                            {c.ovr ? <span className="cmp-history-ovr"> OVR{c.ovr}</span> : ''}
                          </span>
                        ))}
                      </div>
                      <span className="cmp-history-time">{relTime(entry.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tray.length > 0 && (
            <button className="cmp-tray-btn cmp-tray-btn--clear" onClick={onClear}>
              Clear
            </button>
          )}

          <button
            className={`cmp-tray-btn cmp-tray-btn--compare ${!canCompare ? 'cmp-tray-btn--disabled' : ''}`}
            onClick={canCompare ? onCompareNow : undefined}
            title={!canCompare ? 'Add at least 2 cards to compare' : 'Open comparison'}
            disabled={!canCompare}
          >
            ⚡ Compare Now
            {isTrayFull && <span className="cmp-full-badge">MAX</span>}
          </button>
        </div>
      </div>
    </div>
  )
}
