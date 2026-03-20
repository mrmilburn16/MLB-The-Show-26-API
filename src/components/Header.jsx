import { useState, useEffect } from 'react'

/** Format seconds into a human-readable "Xs ago" / "Xm ago" string */
function timeAgoStr(secs) {
  if (secs < 5)   return 'just now'
  if (secs < 60)  return `${secs}s ago`
  return `${Math.floor(secs / 60)}m ago`
}

/** Ticks once per second to keep the "Xs ago" counter fresh */
function useSecondsAgo(timestamp) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!timestamp) { setSecs(0); return }
    const update = () => setSecs(Math.floor((Date.now() - timestamp) / 1000))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [timestamp])
  return secs
}

export default function Header({
  listingCount, totalScanned, page, totalPages,
  isRefreshing, lastUpdated, isPaused, togglePause,
  newEntryCount,
}) {
  const showScanned = totalScanned != null && totalScanned > 0
  const showLive    = lastUpdated != null || isRefreshing
  const secondsAgo  = useSecondsAgo(lastUpdated)

  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo-area">
          <div className="logo-icon">⚾</div>
          <div>
            <div className="title">STUB FLIPPER</div>
            <div className="subtitle">MLB The Show 26 Market Tool</div>
          </div>
        </div>

        <div className="header-stats">
          <div className="stat-chip">
            <span className="stat-label">SHOWING</span>
            <span className="stat-value">{listingCount != null ? listingCount.toLocaleString() : '—'}</span>
          </div>
          {showScanned ? (
            <div className="stat-chip">
              <span className="stat-label">CARDS LOADED</span>
              <span className="stat-value">{totalScanned.toLocaleString()}</span>
            </div>
          ) : (
            <>
              <div className="stat-chip">
                <span className="stat-label">PAGE</span>
                <span className="stat-value">{page || '—'}</span>
              </div>
              <div className="stat-chip">
                <span className="stat-label">TOTAL</span>
                <span className="stat-value">{totalPages || '—'}</span>
              </div>
            </>
          )}
        </div>

        {/* ── Live / Paused indicator ── */}
        {showLive && togglePause && (
          <button
            className={`live-indicator${isPaused ? ' live-indicator--paused' : ''}${isRefreshing ? ' live-indicator--refreshing' : ''}`}
            onClick={togglePause}
            title={isPaused ? 'Click to resume auto-refresh' : 'Click to pause auto-refresh'}
          >
            <span className={`live-dot${isPaused ? ' live-dot--paused' : isRefreshing ? ' live-dot--spin' : ' live-dot--pulse'}`} />
            <span className="live-label">
              {isRefreshing
                ? 'Refreshing…'
                : isPaused
                  ? 'Paused'
                  : `Live`}
            </span>
            {!isRefreshing && lastUpdated && (
              <span className="live-ago">
                {isPaused ? '' : `• ${timeAgoStr(secondsAgo)}`}
              </span>
            )}
            {newEntryCount > 0 && !isRefreshing && (
              <span className="live-new-count" title="Cards that just entered the top 50 results">
                {newEntryCount} new
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  )
}
