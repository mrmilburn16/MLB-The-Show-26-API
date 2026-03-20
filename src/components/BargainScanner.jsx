import { useState, useMemo } from 'react'
import { useBargainScanner } from '../hooks/useBargainScanner'
import { fmt, fmtProfit, rarityColors, profitClass } from '../utils/format'

const RARITY_OPTS = ['Diamond', 'Gold', 'Silver', 'Bronze', 'Common']

const DEFAULT_CONFIG = {
  minPrice:        '',
  maxPrice:        '',
  rarities:        ['diamond', 'gold', 'silver'],
  pagesToScan:     5,
  minDealDiscount: 3,     // 3% — reasonable on an active early-cycle market
  minSpread:       5,     // 5% — low enough to catch Flip Finder candidates too
  avgMethod:       'recent',
  minProfitPerMin: 500,   // 500 stubs/min threshold for Flip Finder
}

const PRICE_PRESETS = [
  { label: 'Budget',   apply: { minPrice: '500',   maxPrice: '5000'  } },
  { label: 'Mid',      apply: { minPrice: '5000',  maxPrice: '25000' } },
  { label: 'High-End', apply: { minPrice: '25000', maxPrice: ''      } },
]

const NEAR_DEAL_LIMIT = 25

// ── Helpers ───────────────────────────────────────────────────

function Arrow({ active, dir }) {
  if (!active) return <span style={{ opacity: 0.22, fontSize: 10 }}>↕</span>
  return <span style={{ fontSize: 10 }}>{dir === 'desc' ? '▼' : '▲'}</span>
}

// ── Mode toggle ───────────────────────────────────────────────

function ModeToggle({ mode, onChange }) {
  return (
    <div className="sc-mode-bar">
      {[
        { key: 'bargain',    icon: '🎯', label: 'Bargain Hunter',
          hint: 'Finds cards priced below their historical average' },
        { key: 'flipfinder', icon: '⚡', label: 'Flip Finder',
          hint: 'Finds high profit/min via spread × velocity — no "bargain" required' },
      ].map(m => (
        <button
          key={m.key}
          className={`sc-mode-btn${mode === m.key ? ' sc-mode-btn--active' : ''}`}
          title={m.hint}
          onClick={() => onChange(m.key)}
        >
          <span className="sc-mode-icon">{m.icon}</span>
          <span className="sc-mode-label">{m.label}</span>
          {mode === m.key && <span className="sc-mode-desc">{m.hint}</span>}
        </button>
      ))}
    </div>
  )
}

// ── Config panel ──────────────────────────────────────────────

function ConfigPanel({ config, mode, onChange, onScan, onStop, scanning }) {
  function set(key, val) { onChange({ [key]: val }) }

  function toggleRarity(r) {
    const lower = r.toLowerCase()
    set('rarities', config.rarities.includes(lower)
      ? config.rarities.filter(x => x !== lower)
      : [...config.rarities, lower])
  }

  const hasPriceFilter = config.minPrice || config.maxPrice

  return (
    <div className="sc-config">
      <div className="sc-config-grid">

        {/* Price range */}
        <div className="sc-field-group">
          <div className="sc-group-label">Buy Price Range</div>
          <div className="sc-price-row">
            <div className="sc-num-wrap">
              <label className="sc-num-label">Min</label>
              <input type="number" className="sc-num-input" min={0} placeholder="0"
                value={config.minPrice} onChange={e => set('minPrice', e.target.value)} />
            </div>
            <span className="sc-sep">–</span>
            <div className="sc-num-wrap">
              <label className="sc-num-label">Max</label>
              <input type="number" className="sc-num-input" min={0} placeholder="∞"
                value={config.maxPrice} onChange={e => set('maxPrice', e.target.value)} />
            </div>
          </div>
          <div className="sc-presets">
            {PRICE_PRESETS.map(p => (
              <button key={p.label} className="sc-preset-btn" onClick={() => onChange(p.apply)}>
                {p.label}
              </button>
            ))}
            {hasPriceFilter && (
              <button className="sc-preset-btn sc-preset-btn--clear"
                onClick={() => onChange({ minPrice: '', maxPrice: '' })}>
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Pages to scan */}
        <div className="sc-field-group">
          <div className="sc-group-label">Pages to Scan</div>
          <div className="sc-slider-wrap">
            <input type="range" className="sc-slider" min={1} max={10}
              value={config.pagesToScan}
              onChange={e => set('pagesToScan', Number(e.target.value))} />
            <span className="sc-slider-val">{config.pagesToScan}</span>
          </div>
          <div className="sc-slider-hint">≈ {config.pagesToScan * 25} cards scanned</div>
        </div>

        {/* Min spread — Pass 1 candidate gate (both modes) */}
        <div className="sc-field-group">
          <div className="sc-group-label">Min Bid/Ask Spread</div>
          <div className="sc-num-wrap">
            <input type="number" className="sc-num-input sc-num-input--wide" min={0} max={100}
              value={config.minSpread}
              onChange={e => set('minSpread', Number(e.target.value))} />
            <span className="sc-unit">%</span>
          </div>
          <div className="sc-slider-hint">Pass 1 candidate gate</div>
        </div>

        {/* Mode-specific threshold */}
        {mode === 'bargain' && (
          <>
            <div className="sc-field-group">
              <div className="sc-group-label">Min Deal Discount</div>
              <div className="sc-num-wrap">
                <input type="number" className="sc-num-input sc-num-input--wide" min={0} max={100}
                  value={config.minDealDiscount}
                  onChange={e => set('minDealDiscount', Number(e.target.value))} />
                <span className="sc-unit">%</span>
              </div>
              <div className="sc-slider-hint">below historical avg (3% = good on live market)</div>
            </div>

            <div className="sc-field-group">
              <div className="sc-group-label">Average Method</div>
              <div className="sc-toggle-group">
                {[
                  { key: 'recent', label: 'Recent Sales', hint: 'completed_orders mean' },
                  { key: 'weekly', label: '7-Day',        hint: 'price_history midpoints' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    className={`sc-toggle-btn${config.avgMethod === opt.key ? ' sc-toggle-btn--active' : ''}`}
                    title={opt.hint}
                    onClick={() => set('avgMethod', opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {mode === 'flipfinder' && (
          <div className="sc-field-group">
            <div className="sc-group-label">Min Profit/Min</div>
            <div className="sc-num-wrap">
              <input type="number" className="sc-num-input sc-num-input--wide" min={0}
                value={config.minProfitPerMin}
                onChange={e => set('minProfitPerMin', Number(e.target.value))} />
              <span className="sc-unit" style={{ right: 4, fontSize: 8 }}>stubs/m</span>
            </div>
            <div className="sc-slider-hint">spread × velocity ≥ this to show</div>
          </div>
        )}

        {/* Rarity filter */}
        <div className="sc-field-group sc-field-group--wide">
          <div className="sc-group-label">Rarity Filter</div>
          <div className="sc-rarity-row">
            {RARITY_OPTS.map(r => {
              const active = config.rarities.includes(r.toLowerCase())
              const colors = rarityColors(r)
              return (
                <button key={r}
                  className={`sc-rarity-btn${active ? ' sc-rarity-btn--active' : ''}`}
                  style={active ? { borderColor: colors.glow, color: colors.glow, background: `${colors.glow}18` } : {}}
                  onClick={() => toggleRarity(r)}>
                  {r}
                </button>
              )
            })}
            <button className="sc-rarity-btn sc-rarity-btn--all"
              onClick={() => set('rarities', [])}>
              All
            </button>
          </div>
        </div>

      </div>

      <div className="sc-actions">
        {scanning
          ? <button className="sc-stop-btn" onClick={onStop}>■ Stop Scan</button>
          : <button className="sc-run-btn" onClick={onScan}>
              ▶ Run {mode === 'flipfinder' ? 'Flip Finder' : 'Bargain Scanner'}
            </button>
        }
      </div>
    </div>
  )
}

// ── Progress ──────────────────────────────────────────────────

function ScanProgress({ progress, rawCount }) {
  const { phase, p1Page, p1Total, p2Done, p2Total, candidates } = progress
  const p1Pct = p1Total > 0 ? Math.round((p1Page / p1Total) * 100) : 0
  const p2Pct = p2Total > 0 ? Math.round((p2Done  / p2Total) * 100) : 0

  return (
    <div className="sc-progress">
      <div className="sc-progress-row">
        <span className="sc-progress-label">
          Pass 1 — Page scan
          {phase === 'pass1' && <span className="sc-progress-dots"><span/><span/><span/></span>}
        </span>
        <span className="sc-progress-stat">
          {p1Page}/{p1Total} pages · {candidates} candidates
        </span>
        <div className="sc-progress-track">
          <div className="sc-progress-fill sc-progress-fill--p1" style={{ width: `${p1Pct}%` }} />
        </div>
      </div>

      {(phase === 'pass2' || phase === 'done') && (
        <div className="sc-progress-row">
          <span className="sc-progress-label">
            Pass 2 — Deep analysis
            {phase === 'pass2' && <span className="sc-progress-dots"><span/><span/><span/></span>}
          </span>
          <span className="sc-progress-stat">
            {p2Done}/{p2Total} analyzed ·{' '}
            <strong style={{ color: '#ffd644' }}>{rawCount} with data</strong>
          </span>
          <div className="sc-progress-track">
            <div className="sc-progress-fill sc-progress-fill--p2" style={{ width: `${p2Pct}%` }} />
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="sc-done-banner">
          ✓ Scan complete — {p1Total} pages · {p2Total} candidates analyzed
        </div>
      )}
    </div>
  )
}

// ── Results table ─────────────────────────────────────────────

function ResultsTable({ results, mode, avgMethod, dimmed, nearDealThreshold }) {
  const defaultSortKey = mode === 'flipfinder' ? '_profitPerMin' : '_dealDiscount'
  const [sort, setSort] = useState({ key: defaultSortKey, dir: 'desc' })

  function toggleSort(key) {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: 'desc' }
    )
  }

  const sorted = useMemo(() => {
    const nullVal = sort.dir === 'desc' ? -Infinity : Infinity
    return [...results].sort((a, b) => {
      const av = a[sort.key] ?? nullVal
      const bv = b[sort.key] ?? nullVal
      return sort.dir === 'desc' ? bv - av : av - bv
    })
  }, [results, sort])

  const avgLabel = avgMethod === 'weekly' ? '7-Day Avg' : 'Recent Avg'
  const avgKey   = avgMethod === 'weekly' ? '_weekAvg'  : '_recentAvg'

  return (
    <div className={`sc-results${dimmed ? ' sc-results--dimmed' : ''}`}>
      <div className="sc-results-header">
        <span className="sc-results-title">
          {dimmed
            ? <><span style={{ opacity: 0.5 }}>🔍</span> Closest Candidates</>
            : mode === 'flipfinder'
              ? <>⚡ Top Flips</>
              : <>🎯 Bargain Deals</>}
          <span className="sc-results-count">{results.length}</span>
        </span>
        <span className="sc-results-hint">click headers to re-sort</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            {mode === 'bargain' ? (
              <tr>
                <th style={{ textAlign: 'left', minWidth: 240 }}>CARD</th>
                <th>OVR</th>
                <th className="sortable" onClick={() => toggleSort('best_sell_price')}>
                  BUY NOW <Arrow active={sort.key === 'best_sell_price'} dir={sort.dir} />
                </th>
                <th className="sortable" onClick={() => toggleSort(avgKey)}>
                  {avgLabel.toUpperCase()} <Arrow active={sort.key === avgKey} dir={sort.dir} />
                </th>
                <th>{avgMethod === 'weekly' ? 'RECENT AVG' : '7-DAY AVG'}</th>
                <th className="sortable" onClick={() => toggleSort('_dealDiscount')}>
                  DEAL % <Arrow active={sort.key === '_dealDiscount'} dir={sort.dir} />
                </th>
                <th className="sortable" onClick={() => toggleSort('_estProfit')}>
                  EST. PROFIT <Arrow active={sort.key === '_estProfit'} dir={sort.dir} />
                </th>
                <th className="sortable" onClick={() => toggleSort('_salesPerMin')}>
                  SALES/MIN <Arrow active={sort.key === '_salesPerMin'} dir={sort.dir} />
                </th>
                <th>SPREAD %</th>
              </tr>
            ) : (
              <tr>
                <th style={{ textAlign: 'left', minWidth: 240 }}>CARD</th>
                <th>OVR</th>
                <th className="sortable" onClick={() => toggleSort('best_buy_price')}>
                  BUY <Arrow active={sort.key === 'best_buy_price'} dir={sort.dir} />
                </th>
                <th className="sortable" onClick={() => toggleSort('best_sell_price')}>
                  SELL <Arrow active={sort.key === 'best_sell_price'} dir={sort.dir} />
                </th>
                <th className="sortable" onClick={() => toggleSort('_profitAfterTax')}>
                  PROFIT <Arrow active={sort.key === '_profitAfterTax'} dir={sort.dir} />
                </th>
                <th className="sortable" onClick={() => toggleSort('_spreadPct')}>
                  SPREAD % <Arrow active={sort.key === '_spreadPct'} dir={sort.dir} />
                </th>
                <th className="sortable" onClick={() => toggleSort('_salesPerMin')}>
                  SALES/MIN <Arrow active={sort.key === '_salesPerMin'} dir={sort.dir} />
                </th>
                <th className="sortable" onClick={() => toggleSort('_profitPerMin')}>
                  PROFIT/MIN <Arrow active={sort.key === '_profitPerMin'} dir={sort.dir} />
                </th>
              </tr>
            )}
          </thead>
          <tbody>
            {sorted.map((l, i) => {
              const item   = l.item || {}
              const r      = rarityColors(item.rarity)
              const imgSrc = item.baked_img || item.img || ''
              const uuid   = l.uuid || l.item?.uuid
              const pc     = profitClass(l._profitAfterTax ?? l._estProfit)

              // Bargain mode highlighting
              const discount   = l._dealDiscount ?? -Infinity
              const isHot      = discount >= 20
              const isGood     = discount >= nearDealThreshold && !isHot
              const discColor  = isHot ? '#4ade80' : discount >= 3 ? '#fbbf24' : '#6a8aa0'

              // Flip finder highlighting
              const ppm      = l._profitPerMin ?? 0
              const ppmColor = ppm >= 5000 ? '#4ade80' : ppm >= 1000 ? '#fbbf24' : '#c8d6e5'

              const rowClass = isHot ? 'row-snipe' : isGood ? 'row-snipe-good' : ''

              return (
                <tr key={uuid || i}
                  className={rowClass}
                  style={{ borderLeft: `3px solid ${r.glow}`, opacity: dimmed ? 0.6 : 1 }}>
                  <td style={{ textAlign: 'left' }}>
                    <div className="card-cell">
                      {imgSrc && (
                        <img className="card-img" src={imgSrc} alt=""
                          onError={e => { e.currentTarget.style.display = 'none' }} />
                      )}
                      <div>
                        <div className="card-name">{l.listing_name || item.name}</div>
                        <div className="card-meta">
                          <span className="rarity-badge"
                            style={{ background: r.badge, color: r.text }}>
                            {(item.rarity || '').toUpperCase()}
                          </span>
                          {item.team   && <span className="team-name">{item.team}</span>}
                          {item.series && <span className="series-name">{item.series}</span>}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td style={{ fontWeight: 700, color: r.glow, fontSize: 16 }}>
                    {item.ovr || '—'}
                  </td>

                  {mode === 'bargain' ? (
                    <>
                      {/* BUY NOW = lowest ask */}
                      <td className="mono sell-color" style={{ fontWeight: 700 }}>
                        {fmt(l.best_sell_price)}
                      </td>
                      {/* Primary avg */}
                      <td className="mono" style={{ color: '#a78bfa' }}>
                        {(avgMethod === 'weekly' ? l._weekAvg : l._recentAvg) != null
                          ? (avgMethod === 'weekly' ? l._weekAvg : l._recentAvg)
                              .toLocaleString(undefined, { maximumFractionDigits: 0 })
                          : '—'}
                      </td>
                      {/* Alternate avg */}
                      <td className="mono" style={{ color: '#818cf8', fontSize: 12 }}>
                        {(avgMethod === 'weekly' ? l._recentAvg : l._weekAvg) != null
                          ? (avgMethod === 'weekly' ? l._recentAvg : l._weekAvg)
                              .toLocaleString(undefined, { maximumFractionDigits: 0 })
                          : '—'}
                      </td>
                      {/* Deal % */}
                      <td>
                        {l._dealDiscount != null ? (
                          <span className="sc-deal-badge"
                            style={{ color: discColor, borderColor: `${discColor}44` }}>
                            {isHot && '🎯 '}
                            {l._dealDiscount > 0
                              ? `${l._dealDiscount.toFixed(1)}% off`
                              : `+${Math.abs(l._dealDiscount).toFixed(1)}% over`}
                          </span>
                        ) : '—'}
                      </td>
                      {/* Est. profit */}
                      <td className={`mono ${pc}`} style={{ fontWeight: 700 }}>
                        {l._estProfit != null ? fmtProfit(Math.round(l._estProfit)) : '—'}
                      </td>
                      {/* Sales/min */}
                      <td className="mono" style={{ color: '#34d399', fontSize: 12 }}>
                        {l._salesPerMin > 0
                          ? (l._salesPerMin < 0.01 ? '<0.01' : l._salesPerMin.toFixed(2))
                          : '—'}
                      </td>
                      {/* Spread % */}
                      <td className="mono" style={{ color: '#fbbf24', fontSize: 12 }}>
                        {l._spreadPct != null ? `${l._spreadPct.toFixed(1)}%` : '—'}
                      </td>
                    </>
                  ) : (
                    <>
                      {/* BUY = highest bid */}
                      <td className="mono buy-color" style={{ fontWeight: 600 }}>
                        {fmt(l.best_buy_price)}
                      </td>
                      {/* SELL = lowest ask */}
                      <td className="mono sell-color" style={{ fontWeight: 600 }}>
                        {fmt(l.best_sell_price)}
                      </td>
                      {/* Profit after tax */}
                      <td className={`mono ${pc}`} style={{ fontWeight: 700 }}>
                        {l._profitAfterTax != null ? fmtProfit(l._profitAfterTax) : '—'}
                      </td>
                      {/* Spread % */}
                      <td className="mono" style={{ color: '#fbbf24', fontSize: 12 }}>
                        {l._spreadPct != null ? `${l._spreadPct.toFixed(1)}%` : '—'}
                      </td>
                      {/* Sales/min */}
                      <td className="mono" style={{ color: '#34d399', fontSize: 12 }}>
                        {l._salesPerMin > 0
                          ? (l._salesPerMin < 0.01 ? '<0.01' : l._salesPerMin.toFixed(2))
                          : '—'}
                      </td>
                      {/* Profit/min */}
                      <td className="mono" style={{ fontWeight: 700, color: ppmColor }}>
                        {ppm > 0
                          ? `+${Math.round(ppm).toLocaleString()}`
                          : '—'}
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export default function BargainScanner() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [mode,   setMode]   = useState('bargain')   // 'bargain' | 'flipfinder'

  const { status, progress, results, error, scan, abort, reset } = useBargainScanner()

  function handleConfigChange(changes) {
    setConfig(prev => ({ ...prev, ...changes }))
  }

  function handleScan() { scan(config) }

  const scanning    = status === 'scanning'
  const isDone      = status === 'done'
  const showProgress = scanning || isDone

  // Apply mode-specific threshold filter to the raw results from the hook
  const filteredResults = useMemo(() => {
    if (mode === 'bargain') {
      return results.filter(r => (r._dealDiscount ?? -Infinity) >= config.minDealDiscount)
    } else {
      return results.filter(r => (r._profitPerMin ?? 0) >= config.minProfitPerMin)
    }
  }, [results, mode, config.minDealDiscount, config.minProfitPerMin])

  // Near deals — top 25 when nothing meets threshold (component-level fallback)
  const nearDeals = useMemo(() => {
    if (filteredResults.length > 0 || results.length === 0) return null
    const sortKey = mode === 'bargain' ? '_dealDiscount' : '_profitPerMin'
    const nullVal = -Infinity
    return [...results]
      .sort((a, b) => (b[sortKey] ?? nullVal) - (a[sortKey] ?? nullVal))
      .slice(0, NEAR_DEAL_LIMIT)
  }, [filteredResults, results, mode])

  return (
    <div className="sc-wrap">
      {/* Hero */}
      <div className="sc-hero">
        <div className="sc-hero-icon">{mode === 'flipfinder' ? '⚡' : '🎯'}</div>
        <div>
          <div className="sc-hero-title">
            {mode === 'flipfinder' ? 'Flip Finder' : 'Bargain Scanner'}
          </div>
          <div className="sc-hero-sub">
            {mode === 'flipfinder'
              ? 'Finds cards where spread × velocity = highest profit per minute. No below-average price required — pure flip opportunity.'
              : 'Finds cards where the current ask is below the recent historical average. Buy now, sell at normal price.'}
          </div>
        </div>
        {status !== 'idle' && (
          <button className="sc-reset-btn" onClick={reset}>New Scan</button>
        )}
      </div>

      {/* Mode toggle */}
      <ModeToggle mode={mode} onChange={setMode} />

      {/* Config */}
      <ConfigPanel
        config={config}
        mode={mode}
        onChange={handleConfigChange}
        onScan={handleScan}
        onStop={abort}
        scanning={scanning}
      />

      {/* Progress */}
      {showProgress && (
        <ScanProgress progress={progress} rawCount={results.length} />
      )}

      {/* Error */}
      {error && (
        <div className="error-box" style={{ margin: '12px 0' }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div><strong>Scan error</strong><p style={{ opacity: 0.8 }}>{error}</p></div>
        </div>
      )}

      {/* Results above threshold */}
      {filteredResults.length > 0 && (
        <ResultsTable
          results={filteredResults}
          mode={mode}
          avgMethod={config.avgMethod}
          nearDealThreshold={config.minDealDiscount}
        />
      )}

      {/* Near-deals fallback */}
      {nearDeals && (
        <>
          <div className="sc-near-banner">
            <span className="sc-near-icon">📊</span>
            <div>
              <strong>
                No cards currently meet your{' '}
                {mode === 'bargain'
                  ? `${config.minDealDiscount}% discount`
                  : `${config.minProfitPerMin.toLocaleString()} stubs/min`}{' '}
                threshold.
              </strong>
              <span className="sc-near-sub">
                {mode === 'bargain'
                  ? ' The market is efficient right now — these are the closest candidates. Consider lowering the threshold or rescanning later.'
                  : ' Try lowering the Min Profit/Min threshold or widening the price range.'}
              </span>
            </div>
          </div>

          <ResultsTable
            results={nearDeals}
            mode={mode}
            avgMethod={config.avgMethod}
            dimmed
            nearDealThreshold={config.minDealDiscount}
          />
        </>
      )}

      {/* True empty — no candidates at all */}
      {isDone && results.length === 0 && (
        <div className="sc-empty">
          <div style={{ fontSize: 32 }}>🔍</div>
          <p>No candidates found — all cards had flat spreads.</p>
          <p style={{ fontSize: 12, color: '#445', marginTop: 6 }}>
            Try lowering Min Spread, scanning more pages, or widening the price range.
          </p>
        </div>
      )}
    </div>
  )
}
