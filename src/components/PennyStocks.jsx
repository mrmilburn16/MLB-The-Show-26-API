import { useState, useEffect, useMemo, useCallback } from 'react'
import { API_BASE } from '../constants'
import { getQuicksellFloor } from '../constants'
import { rarityColors } from '../utils/format'
import CopyableName from './CopyableName'

const DEFAULT_MAX_BUY = 100
/** Empty = no cap. A numeric default (e.g. 50) hid most rows when Max Buy Now is 100 (risk = buy minus QS is often above 50). */
const DEFAULT_MAX_RISK = ''

function isLiveSeries(item) {
  return String(item?.series_id) === '1337' || item?.series === 'Live'
}

/** Raw best bid for display (listing or nested item). */
function listingBestBid(l) {
  const v = l.best_buy_price ?? l.item?.best_buy_price
  if (v == null || v === '' || v === '-') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** No active bids — server-side max_best_buy_price would hide these rows, so we filter in the client only. */
function isNoBidListing(l) {
  const b = l.best_buy_price ?? l.item?.best_buy_price
  return b === 0 || b === null || b === undefined || b === '-' || b === ''
}

function enrichPenny(l) {
  const item     = l.item || {}
  const isLive   = isLiveSeries(item)
  const ovr      = typeof item.ovr === 'number' ? item.ovr : parseInt(item.ovr, 10)
  const qsFloor  = getQuicksellFloor(ovr, isLive, item.rarity)
  const buyNow   = typeof l.best_sell_price === 'number' && l.best_sell_price > 0 ? l.best_sell_price : null
  const bestBid  = listingBestBid(l)
  const risk     = buyNow != null && qsFloor != null ? buyNow - qsFloor : null

  return { ...l, _qsFloor: qsFloor, _buyNow: buyNow, _bestBid: bestBid, _risk: risk, _isLive: isLive }
}

const MAX_PAGES = 20

/** Cheap cards only — never pass max_best_buy_price (it excludes best_buy_price: 0 listings). */
async function fetchAllPenny(maxBuyNow) {
  const results = []
  let page = 1
  let totalPages = 1
  do {
    const params = new URLSearchParams({
      type:                'mlb_card',
      max_best_sell_price: String(maxBuyNow),
      sort:                'best_sell_price',
      order:               'asc',
      page:                String(page),
    })
    const res = await fetch(`${API_BASE}/listings.json?${params}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    results.push(...(data.listings || []))
    totalPages = data.total_pages ?? 1
    page++
  } while (page <= totalPages && page <= MAX_PAGES)

  return results
}

export default function PennyStocks() {
  const [maxBuyNow,    setMaxBuyNow]    = useState(DEFAULT_MAX_BUY)
  const [maxRisk,      setMaxRisk]      = useState(DEFAULT_MAX_RISK)
  const [rarityFilter, setRarityFilter] = useState('all')   // 'all' | 'Common' | 'Bronze'
  const [qsFilter,     setQsFilter]     = useState('all')   // 'all' | '5' | '25'
  const [sortBy,       setSortBy]       = useState('price_asc') // 'price_asc' | 'price_desc' | 'lowest_risk'
  const [noBidsOnly,   setNoBidsOnly]   = useState(false)
  const [rawListings,  setRawListings]  = useState([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)
  const [fetchedMax,   setFetchedMax]   = useState(null)

  const load = useCallback(async max => {
    setLoading(true)
    setError(null)
    try {
      const raw = await fetchAllPenny(max)
      setRawListings(raw.map(enrichPenny))
      setFetchedMax(max)
    } catch (e) {
      setError(e.message || 'Failed to load penny stocks')
      setRawListings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(maxBuyNow) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function togglePriceSort() {
    setSortBy(prev => prev === 'price_asc' ? 'price_desc' : 'price_asc')
  }

  const displayListings = useMemo(() => {
    let list = rawListings

    if (noBidsOnly) {
      list = list.filter(l => isNoBidListing(l))
    }

    // Rarity filter
    if (rarityFilter !== 'all') {
      list = list.filter(l => (l.item?.rarity || '') === rarityFilter)
    }

    // QS value filter
    if (qsFilter !== 'all') {
      const target = Number(qsFilter)
      list = list.filter(l => l._qsFloor === target)
    }

    // Max risk filter
    if (maxRisk !== '' && maxRisk != null) {
      list = list.filter(l => l._risk != null && l._risk <= Number(maxRisk))
    }

    // Sort
    if (sortBy === 'lowest_risk') {
      list = [...list].sort((a, b) => (a._risk ?? Infinity) - (b._risk ?? Infinity))
    } else if (sortBy === 'price_desc') {
      list = [...list].sort((a, b) => (b._buyNow ?? 0) - (a._buyNow ?? 0))
    }
    // price_asc: API already returns cheapest-first, no re-sort needed

    return list
  }, [rawListings, noBidsOnly, rarityFilter, qsFilter, maxRisk, sortBy])

  function handleSearch(e) {
    e.preventDefault()
    load(maxBuyNow)
  }

  const hasNoQS = displayListings.filter(l => l._qsFloor == null).length

  return (
    <div className="ps-wrap">
      {/* ── Header ── */}
      <div className="ps-header">
        <div className="ps-header-title">
          <span className="ps-header-icon">💰</span>
          <div>
            <div className="ps-title">Penny Stocks</div>
            <div className="ps-subtitle">
              Ultra-cheap cards near quicksell value — bulk exchange fodder or lottery tickets for roster updates
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <form className="ps-filters" onSubmit={handleSearch}>
        <div className="ps-filter-row">
          <div className="ps-field">
            <label className="ps-label">Max Buy Now</label>
            <input
              type="number"
              className="ps-input"
              min={1}
              max={10000}
              value={maxBuyNow}
              onChange={e => setMaxBuyNow(Number(e.target.value))}
            />
          </div>

          <div className="ps-field">
            <label className="ps-label" title="Buy now minus quicksell; leave blank to show all">
              Max Risk (stubs)
            </label>
            <input
              type="number"
              className="ps-input"
              min={0}
              placeholder="Any (no cap)"
              value={maxRisk}
              onChange={e => setMaxRisk(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>

          <div className="ps-field">
            <label className="ps-label">Rarity</label>
            <select
              className="ps-select"
              value={rarityFilter}
              onChange={e => setRarityFilter(e.target.value)}
            >
              <option value="all">Common + Bronze</option>
              <option value="Common">Common only</option>
              <option value="Bronze">Bronze only</option>
            </select>
          </div>

          <div className="ps-field">
            <label className="ps-label">QS Value</label>
            <select
              className="ps-select"
              value={qsFilter}
              onChange={e => setQsFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="5">5 stubs only (≤64 OVR Common)</option>
              <option value="25">25 stubs only (65–74 OVR Bronze)</option>
            </select>
          </div>

          <div className="ps-field">
            <label className="ps-label">Sort By</label>
            <select
              className="ps-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="price_asc">Cheapest first</option>
              <option value="price_desc">Most expensive first</option>
              <option value="lowest_risk">Lowest risk first</option>
            </select>
          </div>

          <label
            className="ps-toggle-label"
            title="Client-side only: best_buy_price 0, null, or &quot;-&quot;. The API cannot filter this server-side without hiding 0-bid cards."
          >
            <input
              type="checkbox"
              className="ps-toggle-cb"
              checked={noBidsOnly}
              onChange={e => setNoBidsOnly(e.target.checked)}
            />
            <span className="ps-toggle-text">No bids only</span>
          </label>

          <button type="submit" className="ps-search-btn" disabled={loading}>
            {loading ? 'Loading…' : '🔄 Refresh'}
          </button>
        </div>
      </form>

      {/* ── Status bar ── */}
      {!loading && fetchedMax != null && (
        <div className="ps-status">
          <span>
            {displayListings.length.toLocaleString()} card{displayListings.length !== 1 ? 's' : ''} shown
            {fetchedMax !== maxBuyNow && (
              <> · <span className="ps-stale">Showing results for ≤{fetchedMax} — click Refresh to update</span></>
            )}
          </span>
          {hasNoQS > 0 && (
            <span className="ps-no-qs-note">
              {hasNoQS} card{hasNoQS !== 1 ? 's' : ''} with unknown QS value (Gold/Silver) excluded from risk calc
            </span>
          )}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="ps-error">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="ps-loading">
          <div className="spinner" />
          <span>Fetching cheap cards…</span>
        </div>
      )}

      {/* ── Table ── */}
      {!loading && displayListings.length > 0 && (
        <div className="ps-table-wrap">
          <table className="ps-table">
            <thead>
              <tr>
                <th className="ps-th ps-th--name">Card</th>
                <th className="ps-th ps-th--ovr">OVR</th>
                <th className="ps-th ps-th--rarity">Rarity</th>
                <th className="ps-th ps-th--series">Series</th>
                <th className="ps-th ps-th--team">Team</th>
                <th
                  className="ps-th ps-th--price ps-th--sortable"
                  onClick={togglePriceSort}
                  title="Click to toggle sort order"
                >
                  Buy Now
                  <span className="ps-sort-icon">
                    {sortBy === 'price_asc' ? ' ▲' : sortBy === 'price_desc' ? ' ▼' : ''}
                  </span>
                </th>
                <th className="ps-th ps-th--qs">QS Value</th>
                <th className="ps-th ps-th--risk">Risk</th>
                <th className="ps-th ps-th--bid">Best Bid</th>
              </tr>
            </thead>
            <tbody>
              {displayListings.map((l, i) => {
                const item  = l.item || {}
                const r     = rarityColors(item.rarity)
                const risk  = l._risk
                const riskClass = risk == null ? 'ps-risk--unknown'
                  : risk <= 5  ? 'ps-risk--zero'
                  : risk <= 20 ? 'ps-risk--low'
                  : risk <= 50 ? 'ps-risk--mid'
                  : 'ps-risk--high'

                return (
                  <tr key={l.uuid || i} className="ps-row">
                    <td className="ps-td ps-td--name">
                      <CopyableName name={l.listing_name || item.name || '—'} />
                    </td>
                    <td className="ps-td ps-td--ovr">{item.ovr || '—'}</td>
                    <td className="ps-td ps-td--rarity">
                      <span
                        className="rarity-badge"
                        style={{ background: r.badge, color: r.text, fontSize: 9 }}
                      >
                        {(item.rarity || '').toUpperCase()}
                      </span>
                    </td>
                    <td className="ps-td ps-td--series">
                      {l._isLive
                        ? <span className="ps-live-badge">LIVE</span>
                        : <span className="ps-series-text">{item.series || '—'}</span>
                      }
                    </td>
                    <td className="ps-td ps-td--team">{item.team || '—'}</td>
                    <td className="ps-td ps-td--price sell-color">
                      {l._buyNow != null ? l._buyNow.toLocaleString() : '—'}
                    </td>
                    <td className="ps-td ps-td--qs ps-qs-val">
                      {l._qsFloor != null ? l._qsFloor.toLocaleString() : '—'}
                    </td>
                    <td className={`ps-td ps-td--risk ${riskClass}`}>
                      {risk != null ? `+${risk.toLocaleString()}` : '—'}
                    </td>
                    <td className="ps-td ps-td--bid ps-bid-val">
                      {l._bestBid != null ? l._bestBid.toLocaleString() : '0'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && fetchedMax != null && displayListings.length === 0 && (
        <div className="ps-empty">
          <div className="ps-empty-icon">💸</div>
          <div className="ps-empty-title">No cards match your filters</div>
          <div className="ps-empty-sub">
            {rawListings.length > 0 ? (
              noBidsOnly ? (
                <>
                  Loaded <strong>{rawListings.length}</strong> cheap card{rawListings.length !== 1 ? 's' : ''} — none had
                  <strong> no bids</strong> (best_buy_price 0, null, or &quot;-&quot;), or other filters removed the
                  rest. Raise Max Buy Now and Refresh to scan more pages, or turn off &quot;No bids only&quot;.
                </>
              ) : (
                <>
                  Loaded <strong>{rawListings.length}</strong> card{rawListings.length !== 1 ? 's' : ''} from the API, but
                  client filters removed all of them. <strong>Clear Max Risk</strong> (leave blank for no cap — risk is
                  buy now minus QS, so a cap of 50 hides most cards priced toward your max buy).
                </>
              )
            ) : (
              <>
                The API returned no listings for this query (cheap cards with your max buy). Try a higher Max Buy Now,
                click Refresh, or turn off &quot;No bids only&quot; temporarily.
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Info callout ── */}
      <div className="ps-info">
        <strong>How to use:</strong> Buy cheap Common/Bronze cards for bulk set exchanges, or hold as lottery tickets —
        if a player gets a roster update, their card can spike from 5 stubs to hundreds.
        Worst case you quicksell for the QS value shown. Risk = how many stubs you lose in the worst case.
      </div>
    </div>
  )
}
