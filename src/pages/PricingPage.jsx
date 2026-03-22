import { useState, useEffect } from 'react'

// ── Tier definitions ───────────────────────────────────────────────

const TIERS = [
  {
    key:      'free',
    rarity:   'FREE',
    name:     'Free',
    color:    '#9aafc0',
    glow:     '#7a8a9e',
    badge:    'rgba(122,138,158,0.22)',
    popular:  false,
    price:    { monthly: 0, annual: 0 },
    cta:      'Get Started',
    ctaStyle: 'outline',
    included: [
      'Browse market listings (25 per page)',
      'Basic filters — rarity, position, team',
      'Card detail popups with attributes',
      'Price history charts',
      'Game history lookup',
      'Collection tracker',
    ],
    locked: [
      'Full market scan (1,600+ cards)',
      'Profit/min & velocity rankings',
      'Snipe alerts with custom thresholds',
      'Auto-refresh every 60 seconds',
      'Advanced filters & ROI metrics',
      'Card comparison tool',
      'Bargain scanner',
    ],
  },
  {
    key:      'gold',
    rarity:   'GOLD',
    name:     'Gold',
    color:    '#ffd644',
    glow:     '#ffc800',
    badge:    'rgba(255,214,68,0.2)',
    popular:  true,
    price:    { monthly: 5, annual: 40 },
    cta:      'Go Gold',
    ctaStyle: 'gold',
    included: [
      'Everything in Free, plus:',
      'Full market scan — all 1,600+ cards',
      'Profit/min & sales velocity rankings',
      'Snipe alerts with custom thresholds',
      'Auto-refresh every 60 seconds',
      '"New" entry highlighting on refresh',
      'Advanced filters — profit, ROI, spread',
      'Equipment & stadium flipping',
      'Near-quicksell deal finder',
      'Saved filter presets',
      'Card comparison tool',
      'Card finder by attributes',
      'Pitch arsenal viewer',
      'Bargain scanner',
      'Roster update tracker & alerts',
      'Flip queue with session tracker',
    ],
    locked: [],
  },
]

const FAQ = [
  {
    q: 'How does Profit/min work?',
    a: 'Profit/min combines the estimated profit per flip (sell price after 10% tax minus buy order price) with the sales velocity (completed orders per minute from recent market history). A card with a $2,000 profit that sells 3× per minute scores higher than a $5,000 profit card that sells once per hour.',
  },
  {
    q: 'Where does the market data come from?',
    a: 'All data is fetched directly from the official MLB The Show 26 market API at mlb26.theshow.com. Stub Flipper does not store or resell any game data — it reads the same public market listings you can see in-game, just faster and with more analysis.',
  },
  {
    q: 'Can I cancel my subscription anytime?',
    a: 'Yes, cancel anytime. No contracts, no cancellation fees. If you cancel an annual plan mid-year we\'ll prorate a refund for unused months. Payment integration is coming soon — join the waitlist to be notified.',
  },
  {
    q: 'Is using this tool against the game\'s rules?',
    a: 'Stub Flipper is a read-only market analysis tool. It only reads public market data — it never automates actions in-game, never modifies any game files, and never interacts with Sony\'s game servers directly. It\'s the equivalent of using a spreadsheet to analyze prices. Always check SDS\'s current Terms of Service for the latest guidance.',
  },
]

// ── Small components ───────────────────────────────────────────────

function RarityBadge({ rarity, color, badge }) {
  return (
    <span className="pr-rarity-badge" style={{ background: badge, color, borderColor: `${color}50` }}>
      {rarity}
    </span>
  )
}

function CheckIcon() {
  return <span className="pr-check">✓</span>
}

function LockIcon() {
  return <span className="pr-lock">✕</span>
}

function Toast({ msg, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2800)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div className="pr-toast">
      🚀 {msg}
    </div>
  )
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pr-faq-item">
      <button className="pr-faq-q" onClick={() => setOpen(o => !o)}>
        <span>{q}</span>
        <span className="pr-faq-arrow">{open ? '▾' : '▸'}</span>
      </button>
      {open && <p className="pr-faq-a">{a}</p>}
    </div>
  )
}

// ── Tier card ──────────────────────────────────────────────────────

function TierCard({ tier, annual, idx, onCta }) {
  const price  = annual ? tier.price.annual : tier.price.monthly
  const perMo  = annual && price > 0 ? (price / 12).toFixed(2) : null
  const isFree = price === 0

  return (
    <div
      className={`pr-tier-card-wrap ${tier.popular ? 'pr-tier-card-wrap--popular' : ''}`}
      style={{ animationDelay: `${idx * 0.12}s` }}
    >
      {/* Recommended badge — outside the card so it's never clipped */}
      {tier.popular && (
        <div className="pr-popular-badge">⭐ RECOMMENDED</div>
      )}

      <div
        className={`pr-tier-card pr-tier-card--${tier.key} ${tier.popular ? 'pr-tier-card--popular' : ''}`}
        style={{ '--tier-color': tier.color, '--tier-glow': tier.glow }}
      >
      {/* Top border accent */}
      <div className="pr-tier-top-bar" style={{ background: `linear-gradient(90deg, ${tier.glow}, transparent)` }} />

      <div className="pr-tier-inner">
        {/* Header */}
        <div className="pr-tier-header">
          <RarityBadge rarity={tier.rarity} color={tier.color} badge={tier.badge} />
        </div>

        {/* Price */}
        <div className="pr-tier-price">
          {isFree ? (
            <>
              <span className="pr-price-currency">$</span>
              <span className="pr-price-free">0</span>
              <span className="pr-price-period">/mo</span>
            </>
          ) : (
            <>
              <span className="pr-price-currency">$</span>
              <span className="pr-price-amount">{annual ? perMo : price}</span>
              <span className="pr-price-period">/mo</span>
            </>
          )}
          {annual && !isFree && (
            <div className="pr-price-annual">
              billed ${price}/yr
            </div>
          )}
          {!annual && !isFree && (
            <div className="pr-price-annual" style={{ color: '#3a6a8a' }}>
              or ${tier.price.annual}/yr — save 33%
            </div>
          )}
        </div>

        {/* CTA button */}
        <button
          className={`pr-cta-btn pr-cta-btn--${tier.ctaStyle}`}
          onClick={() => onCta(tier)}
        >
          {tier.cta}
        </button>

        {/* Included features */}
        <ul className="pr-features-list">
          {tier.included.map((f, i) => (
            <li key={i} className="pr-feature pr-feature--on">
              <CheckIcon />
              <span>{f}</span>
            </li>
          ))}
          {tier.locked.map((f, i) => (
            <li key={i} className="pr-feature pr-feature--off">
              <LockIcon />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────

export default function PricingPage() {
  const [annual,  setAnnual]  = useState(false)
  const [toast,   setToast]   = useState(null)

  function handleCta(tier) {
    if (tier.price.monthly === 0) {
      window.location.href = '/'
    } else {
      setToast('Gold plan — payment integration coming soon! Join the waitlist.')
    }
  }

  function dismissToast() { setToast(null) }

  return (
    <div className="pr-page">

      {/* ── Nav ── */}
      <nav className="pr-nav">
        <a href="/" className="pr-nav-logo">
          <span className="pr-nav-icon">⚾</span>
          <span className="pr-nav-title">STUB FLIPPER</span>
        </a>
        <a href="/" className="pr-nav-back">← Back to App</a>
      </nav>

      {/* ── Hero ── */}
      <div className="pr-hero">
        <div className="pr-hero-eyebrow">MLB The Show 26 Market Tool</div>
        <h1 className="pr-hero-title">
          Flip smarter.<br />
          <span className="pr-hero-accent">Earn more stubs.</span>
        </h1>
        <p className="pr-hero-sub">
          Real-time market data, profit rankings, and snipe detection
          for Diamond Dynasty investors.
        </p>

        {/* Billing toggle */}
        <div className="pr-toggle-wrap">
          <button
            className={`pr-toggle-btn ${!annual ? 'pr-toggle-btn--active' : ''}`}
            onClick={() => setAnnual(false)}
          >
            Monthly
          </button>
          <button
            className={`pr-toggle-btn ${annual ? 'pr-toggle-btn--active' : ''}`}
            onClick={() => setAnnual(true)}
          >
            Annual
            <span className="pr-save-badge">SAVE 33%</span>
          </button>
        </div>
      </div>

      {/* ── Tier cards ── */}
      <div className="pr-tiers-grid">
        {TIERS.map((tier, idx) => (
          <TierCard
            key={tier.key}
            tier={tier}
            annual={annual}
            idx={idx}
            onCta={handleCta}
          />
        ))}
      </div>

      {/* ── Feature comparison note ── */}
      <div className="pr-compare-note">
        All tiers read the same live SDS market data · No bots · No automation · Read-only
      </div>

      {/* ── FAQ ── */}
      <section className="pr-faq-section">
        <h2 className="pr-section-title">Frequently Asked Questions</h2>
        <div className="pr-faq-list">
          {FAQ.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="pr-footer">
        <p className="pr-footer-disclaimer">
          Stub Flipper is an independent fan tool and is not affiliated with, endorsed by,
          or sponsored by Sony Interactive Entertainment, San Diego Studio, or MLB.
          MLB The Show® is a registered trademark of Sony Interactive Entertainment LLC.
        </p>
        <div className="pr-footer-links">
          <a href="/">← Back to App</a>
        </div>
      </footer>

      {/* ── Toast ── */}
      {toast && <Toast msg={toast} onClose={dismissToast} />}
    </div>
  )
}
