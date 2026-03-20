export default function VelocityBanner({ pendingCount }) {
  if (!pendingCount) return null

  return (
    <div className="vel-banner">
      <div className="vel-banner-inner">
        <span className="vel-banner-icon">⚡</span>
        <span className="vel-banner-text">
          Loading velocities…
        </span>
        <div className="vel-pulse-dots">
          <span /><span /><span />
        </div>
        <span className="vel-banner-queue">
          {pendingCount} {pendingCount === 1 ? 'card' : 'cards'} remaining
        </span>
      </div>
    </div>
  )
}
