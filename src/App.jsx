import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Header          from './components/Header'
import TabBar          from './components/TabBar'
import PresetBar       from './components/PresetBar'
import FiltersBar      from './components/FiltersBar'
import AdvancedFilters from './components/AdvancedFilters'
import VelocityBanner  from './components/VelocityBanner'
import ListingsTable   from './components/ListingsTable'
import HistoricalPanel from './components/HistoricalPanel'
import Pagination      from './components/Pagination'
import ErrorBox        from './components/ErrorBox'
import LoadingSpinner  from './components/LoadingSpinner'
import BargainScanner  from './components/BargainScanner'
import FullMarketScan  from './components/FullMarketScan'
import NearQSPanel     from './components/NearQSPanel'
import { useListings }    from './hooks/useListings'
import { useAutoMarket }  from './hooks/useAutoMarket'
import { useVelocity }    from './hooks/useVelocity'
import { usePresets }     from './hooks/usePresets'
import { medianOf }       from './utils/snipe'
import {
  DEFAULT_FILTERS, DEFAULT_ADV,
  loadInitialState, saveWorkingFilters,
} from './utils/presets'

// Computed once at module load — shared across all useState lazy initialisers
// so we only hit localStorage once per page load.
const _initState = loadInitialState()

// Columns that sort client-side on the full dataset
const CLIENT_SORT_COLS = new Set(['profit_per_min', 'snipe_discount', 'qs_premium'])

// Wide-spread threshold (multiple of rarity median spread)
const WIDE_SPREAD_MULTIPLIER = 2.0

// All columns have a client-side sort key
const FULL_SORT_KEY = {
  'profit_per_min':  '_profitPerMin',
  'snipe_discount':  '_snipeDiscount',
  'qs_premium':      '_premiumPct',
  'best_buy_price':  'best_buy_price',
  'best_sell_price': 'best_sell_price',
}

export default function App() {
  // ── All filter state initialised from saved working filters (or last preset, or defaults) ──
  const [activeTab,    setActiveTab]    = useState(_initState.activeTab)
  const [uiSort,       setUiSort]       = useState(_initState.uiSort)
  const [uiOrder,      setUiOrder]      = useState(_initState.uiOrder)
  const [apiSort,      setApiSort]      = useState(() =>
    CLIENT_SORT_COLS.has(_initState.uiSort) ? 'best_sell_price' : _initState.uiSort
  )
  const [apiOrder,     setApiOrder]     = useState(() =>
    CLIENT_SORT_COLS.has(_initState.uiSort) ? 'desc' : _initState.uiOrder
  )
  const [page,         setPage]         = useState(1)
  const [filters,      setFilters]      = useState(_initState.filters)
  const [advFilters,   setAdvFilters]   = useState(_initState.advFilters)
  const [selectedUuid, setSelectedUuid] = useState(null)

  // ── Auto-save working filter state to localStorage on every change ──
  useEffect(() => {
    saveWorkingFilters({ filters, advFilters, uiSort, uiOrder, activeTab })
  }, [filters, advFilters, uiSort, uiOrder, activeTab])

  // ── Data sources ──────────────────────────────────────────────
  // mlb_card: always auto-fetched on mount, full dataset in memory
  // equipment/stadium/etc: paginated via useListings (auto-scans ≤20 pages)
  const isMlbCard = !filters.type || filters.type === 'mlb_card'

  const autoMarket = useAutoMarket()   // always runs in background (mlb_card, no filters)
  const {
    isRefreshing, lastUpdated, isPaused, togglePause,
  } = autoMarket
  const {
    listings: otherListings, totalPages, loading: otherLoading,
    scanning: otherScanning, isFullData: otherFullData,
    scanProgress: otherProgress, error: otherError,
    fetchListings,
  } = useListings()

  // Active data source depending on selected type
  const listings      = isMlbCard ? autoMarket.allListings  : otherListings
  const isFullData    = isMlbCard ? autoMarket.isFullData    : otherFullData
  const scanning      = isMlbCard ? autoMarket.isScanning    : otherScanning
  const scanProgress  = isMlbCard ? autoMarket.scanProgress  : otherProgress
  const loading       = isMlbCard ? false                    : otherLoading
  const error         = isMlbCard ? null                     : otherError

  const { velocityMap, pendingCount, requestUuid } = useVelocity()

  // ── Proactively queue velocity for top 50 once full data loads ──
  const enrichedListingsRef = useRef([])
  useEffect(() => {
    if (!isFullData) return
    const top50 = [...enrichedListingsRef.current]
      .sort((a, b) => (b._profitAfterTax ?? 0) - (a._profitAfterTax ?? 0))
      .slice(0, 50)
    top50.forEach(l => {
      const uuid = l.uuid || l.item?.uuid
      if (uuid) requestUuid(uuid)
    })
  }, [isFullData, requestUuid])

  // ── Re-queue velocity every 5 minutes (cache TTL controls whether actual re-fetch happens) ──
  useEffect(() => {
    if (!isFullData) return
    const id = setInterval(() => {
      const top50 = [...enrichedListingsRef.current]
        .sort((a, b) => (b._profitAfterTax ?? 0) - (a._profitAfterTax ?? 0))
        .slice(0, 50)
      top50.forEach(l => {
        const uuid = l.uuid || l.item?.uuid
        if (uuid) requestUuid(uuid)
      })
    }, 5 * 60 * 1000) // 5 minutes
    return () => clearInterval(id)
  }, [isFullData, requestUuid]) // enrichedListingsRef is a ref — safe to omit from deps

  // ── Preset management ──
  const {
    presets, activeId: activePresetId, activePreset, isModified, presetError,
    selectPreset, saveAsNew, updateActive, deleteById,
  } = usePresets({ filters, advFilters, uiSort, uiOrder })

  function handlePresetSelect(id) {
    const preset = selectPreset(id)
    if (!preset) return
    setFilters({ ...DEFAULT_FILTERS, ...preset.filters })
    setAdvFilters({ ...DEFAULT_ADV, ...preset.advFilters })
    const sort  = preset.uiSort  ?? 'profit_per_min'
    const order = preset.uiOrder ?? 'desc'
    setUiSort(sort)
    setUiOrder(order)
    if (CLIENT_SORT_COLS.has(sort)) {
      setApiSort('best_sell_price')
      setApiOrder('desc')
    } else {
      setApiSort(sort)
      setApiOrder(order)
    }
    setPage(1)
  }

  // ── Fetch non-mlb_card types (equipment/stadium/etc) ──
  // mlb_card is handled entirely by useAutoMarket — no load() call needed.
  const load = useCallback(() => {
    if (isMlbCard) return
    fetchListings({ page, sort: apiSort, order: apiOrder, filters })
    setSelectedUuid(null)
  }, [page, apiSort, apiOrder, filters, fetchListings, isMlbCard])

  useEffect(() => { load() }, [load])

  // ── Sort handler ──
  function handleSort(col) {
    const newOrder = uiSort === col ? (uiOrder === 'desc' ? 'asc' : 'desc') : 'desc'
    setUiSort(col)
    setUiOrder(newOrder)

    // Full-data mode: everything sorts client-side, no API call needed
    if (isFullData) return

    // For non-mlb types in paginated mode
    if (!CLIENT_SORT_COLS.has(col)) {
      setApiSort(col)
      setApiOrder(newOrder)
      setPage(1)
    }
    // CLIENT_SORT_COLS on non-full data: just let the client-side sort run on
    // whatever is currently loaded (equipment auto-scan fills in quickly)
  }

  // ── Card click ──
  function handleSelectCard(uuid) {
    setSelectedUuid(prev => prev === uuid ? null : uuid)
    if (uuid) requestUuid(uuid)
  }

  // ── Enrich active listings with velocity data ──
  const enrichedListings = useMemo(() => {
    const result = listings.map(l => {
      const uuid = l.uuid || l.item?.uuid
      const vel  = uuid ? velocityMap[uuid] : null
      return {
        ...l,
        _salesPerMin:    vel?.salesPerMin    ?? null,
        _profitPerMin:   vel?.profitPerMin   ?? null,
        _snipeDiscount:  vel?.snipeDiscount  ?? null,
        _spreadPct:      vel?.spreadPct      ?? null,
        _volatilityPct:  vel?.volatilityPct  ?? null,
        _median:         vel?.median         ?? null,
        _avg:            vel?.avg            ?? null,
        _velocityLoaded: vel != null,
      }
    })
    enrichedListingsRef.current = result
    return result
  }, [listings, velocityMap])

  // ── Wide-spread detector ──
  const wideSpreadUuids = useMemo(() => {
    const byRarity = {}
    enrichedListings.forEach(l => {
      const rarity = l.item?.rarity
      if (!rarity || l._spreadPct == null) return
      ;(byRarity[rarity] = byRarity[rarity] || []).push(l._spreadPct)
    })
    const medianByRarity = {}
    Object.entries(byRarity).forEach(([r, arr]) => { medianByRarity[r] = medianOf(arr) })

    const flagged = new Set()
    enrichedListings.forEach(l => {
      const rarity = l.item?.rarity
      const uuid   = l.uuid || l.item?.uuid
      if (!rarity || !uuid || l._spreadPct == null) return
      const baseline = medianByRarity[rarity] ?? 0
      if (baseline > 0 && l._spreadPct > baseline * WIDE_SPREAD_MULTIPLIER && l._spreadPct > 10) {
        flagged.add(uuid)
      }
    })
    return flagged
  }, [enrichedListings])

  // ── "New" entry tracking — highlights cards that enter top results after a refresh ──
  const [newEntryUUIDs, setNewEntryUUIDs] = useState(new Set())
  const [newEntryCount, setNewEntryCount] = useState(0)
  const previousTopUUIDsRef = useRef(new Set())
  const isBaselineSetRef    = useRef(false)   // first scan sets baseline; second scan starts highlights
  const newClearTimerRef    = useRef(null)
  const lastUpdatedSeenRef  = useRef(null)

  // ── Filter pipeline ──
  // For mlb_card (full dataset in memory), apply server-side filter params client-side.
  // For equipment/etc, the API already filtered — just apply advanced filters.
  const filteredListings = useMemo(() => {
    const {
      minProfit, maxProfit, minROI, maxROI,
      minProfitPerMin, maxProfitPerMin,
      minSnipeDiscount, minSalesPerMin, minSpreadPct,
      maxPremiumPctOverQS,
      hideNoBids,
    } = advFilters

    return enrichedListings.filter(l => {
      // Hide cards with no effective buy price (no real bid AND no QS floor) or no sell price
      if (hideNoBids && (l._effectiveBuy == null || !(l.best_sell_price > 0))) return false
      const item = l.item || {}

      // ── Server-side params applied client-side for mlb_card full dataset ──
      if (isMlbCard) {
        if (filters.rarity   && item.rarity           !== filters.rarity)   return false
        if (filters.position && item.display_position !== filters.position) return false
        if (filters.team     && item.team             !== filters.team)     return false
        if (filters.name) {
          const hay = (l.listing_name || item.name || '').toLowerCase()
          if (!hay.includes(filters.name.toLowerCase())) return false
        }
        if (filters.set) {
          const setVal = (item.set_name || item.series || '').toLowerCase()
          if (!setVal.includes(filters.set.toLowerCase())) return false
        }
        if (filters.minBuyPrice  !== '' && l.best_buy_price  < +filters.minBuyPrice)  return false
        if (filters.maxBuyPrice  !== '' && l.best_buy_price  > +filters.maxBuyPrice)  return false
        if (filters.minSellPrice !== '' && l.best_sell_price < +filters.minSellPrice) return false
        if (filters.maxSellPrice !== '' && l.best_sell_price > +filters.maxSellPrice) return false
        if (filters.minRank !== '' && (item.ovr == null || +item.ovr < +filters.minRank)) return false
        if (filters.maxRank !== '' && (item.ovr == null || +item.ovr > +filters.maxRank)) return false
      }

      // ── Advanced (calculated) filters — applied for all types ──
      if (minProfit !== '' && (l._profitAfterTax == null || l._profitAfterTax < +minProfit)) return false
      if (maxProfit !== '' && (l._profitAfterTax == null || l._profitAfterTax > +maxProfit)) return false

      const roi = l._profitAfterTax != null && l.best_buy_price > 0
        ? (l._profitAfterTax / l.best_buy_price) * 100 : null
      if (minROI !== '' && (roi == null || roi < +minROI)) return false
      if (maxROI !== '' && (roi == null || roi > +maxROI)) return false

      if (minProfitPerMin  !== '' && (l._profitPerMin  == null || l._profitPerMin  < +minProfitPerMin))  return false
      if (maxProfitPerMin  !== '' && (l._profitPerMin  == null || l._profitPerMin  > +maxProfitPerMin))  return false
      if (minSnipeDiscount !== '' && (l._snipeDiscount == null || l._snipeDiscount < +minSnipeDiscount)) return false
      if (minSalesPerMin   !== '' && (l._salesPerMin   == null || l._salesPerMin   < +minSalesPerMin))   return false
      if (minSpreadPct        !== '' && (l._spreadPct   == null || l._spreadPct   < +minSpreadPct))        return false
      // Near-QS filter: only show cards within maxPremiumPctOverQS% of quicksell floor
      if (maxPremiumPctOverQS !== '' && (l._premiumPct  == null || l._premiumPct  > +maxPremiumPctOverQS)) return false

      return true
    })
  }, [enrichedListings, advFilters, filters, isMlbCard])

  // ── Client-side sort ──
  const displayListings = useMemo(() => {
    // In full-data mode every column sorts client-side.
    // In paginated mode (equipment mid-scan), only CLIENT_SORT_COLS do.
    const doClientSort = isFullData || CLIENT_SORT_COLS.has(uiSort)

    if (!doClientSort) return filteredListings

    const key = FULL_SORT_KEY[uiSort]
    if (!key) return filteredListings

    const nullVal = uiOrder === 'desc' ? -Infinity : Infinity
    return [...filteredListings].sort((a, b) => {
      let av, bv
      // For profit/min: fall back to profit-after-tax while velocity is loading
      if (uiSort === 'profit_per_min') {
        av = (a._profitPerMin ?? a._profitAfterTax) ?? nullVal
        bv = (b._profitPerMin ?? b._profitAfterTax) ?? nullVal
      } else {
        av = a[key] ?? nullVal
        bv = b[key] ?? nullVal
      }
      return uiOrder === 'desc' ? bv - av : av - bv
    })
  }, [filteredListings, uiSort, uiOrder, isFullData, isMlbCard])

  // ── "New" entry comparison — runs AFTER displayListings is declared ──
  // displayListings must be in scope before this useEffect so its deps array
  // doesn't reference an uninitialised const (temporal dead zone crash).
  useEffect(() => {
    if (!lastUpdated || lastUpdated === lastUpdatedSeenRef.current) return
    lastUpdatedSeenRef.current = lastUpdated

    const top50UUIDs = new Set(
      displayListings.slice(0, 50).map(l => l.uuid || l.item?.uuid).filter(Boolean)
    )

    if (!isBaselineSetRef.current) {
      previousTopUUIDsRef.current = top50UUIDs
      isBaselineSetRef.current = true
      return
    }

    const newEntries = new Set()
    top50UUIDs.forEach(uuid => {
      if (!previousTopUUIDsRef.current.has(uuid)) newEntries.add(uuid)
    })
    previousTopUUIDsRef.current = top50UUIDs

    if (newEntries.size > 0) {
      if (newClearTimerRef.current) clearTimeout(newClearTimerRef.current)
      setNewEntryUUIDs(newEntries)
      setNewEntryCount(newEntries.size)
      newClearTimerRef.current = setTimeout(() => {
        setNewEntryUUIDs(new Set())
        setNewEntryCount(0)
      }, 30_000)
    }
  }, [lastUpdated, displayListings])

  // ── Selected listing ──
  const selectedListing    = selectedUuid
    ? displayListings.find(l => (l.uuid || l.item?.uuid) === selectedUuid)
    : null
  const selectedVelocity   = selectedUuid ? velocityMap[selectedUuid] : null
  const selectedVelLoading = !!selectedUuid && !selectedVelocity && pendingCount > 0

  function handleFilterChange(changes) {
    setFilters(prev => ({ ...prev, ...changes }))
    setPage(1)
  }

  // Count active advanced filters: non-empty inputs + hideNoBids when turned OFF (non-default)
  const advActiveCount = Object.entries(advFilters).filter(([k, v]) =>
    k === 'hideNoBids' ? v === false : v !== ''
  ).length

  return (
    <>
      <Header
        listingCount={activeTab === 'market' ? displayListings.length : null}
        totalScanned={activeTab === 'market' && isMlbCard ? autoMarket.allListings.length : null}
        page={activeTab === 'market' && !isMlbCard ? page : null}
        totalPages={activeTab === 'market' && !isMlbCard ? totalPages : null}
        isRefreshing={isMlbCard ? isRefreshing : false}
        lastUpdated={isMlbCard ? lastUpdated : null}
        isPaused={isMlbCard ? isPaused : false}
        togglePause={isMlbCard ? togglePause : null}
        newEntryCount={isMlbCard ? newEntryCount : 0}
      />

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab !== 'scanner' && (
        <PresetBar
          presets={presets}
          activeId={activePresetId}
          activePreset={activePreset}
          isModified={isModified}
          presetError={presetError}
          onSelect={handlePresetSelect}
          onSaveNew={name => saveAsNew(name)}
          onUpdate={updateActive}
          onDelete={deleteById}
        />
      )}

      {activeTab !== 'scanner' && (
        <FiltersBar
          filters={filters}
          onFilterChange={handleFilterChange}
          onRefresh={activeTab === 'market' && !isMlbCard ? load : undefined}
        />
      )}

      {activeTab === 'market' && (
        <AdvancedFilters
          filters={advFilters}
          onChange={changes => setAdvFilters(prev => ({ ...prev, ...changes }))}
          activeCount={advActiveCount}
        />
      )}

      {activeTab === 'market' && <VelocityBanner pendingCount={pendingCount} />}

      {activeTab === 'scanner' && (
        <main className="main">
          <BargainScanner />
        </main>
      )}

      {/* Always mounted so scan state persists across tab switches */}
      <main className="main" style={activeTab !== 'fullscan' ? { display: 'none' } : undefined}>
        <FullMarketScan filters={filters} />
      </main>

      {activeTab === 'market' && (
        <main className="main">
          <ErrorBox message={error} />

          {/* ── Scan progress banner ── */}
          {scanning && (
            <div className="auto-scan-banner">
              <span className="auto-scan-dots"><span/><span/><span/></span>
              <span>
                {scanProgress.total > 0 ? (
                  <>
                    Loading full market…&ensp;
                    <strong>{scanProgress.page}</strong> / {scanProgress.total} pages
                    &ensp;·&ensp;
                    <strong>{listings.length.toLocaleString()}</strong> cards
                  </>
                ) : (
                  <>
                    Loading {filters.type || 'mlb_card'} listings…&ensp;
                    <strong>{listings.length.toLocaleString()}</strong> cards so far
                  </>
                )}
              </span>
            </div>
          )}

          {/* ── Near-QS deals panel (only meaningful with full market data) ── */}
          {isFullData && (
            <NearQSPanel
              listings={filteredListings}
              threshold={advFilters.maxPremiumPctOverQS !== '' ? +advFilters.maxPremiumPctOverQS : 5}
              onSort={() => {
                setUiSort('qs_premium')
                setUiOrder('asc')
              }}
              onSelectCard={handleSelectCard}
            />
          )}

          {/* ── Full-data confirmation note ── */}
          {isFullData && !scanning && listings.length > 0 && (
            <div className="full-data-note">
              ✓ All&nbsp;<strong>{listings.length.toLocaleString()}</strong>&nbsp;
              {isMlbCard ? 'MLB cards' : (filters.type || 'mlb_card') + ' listings'} loaded
              &mdash; sorting &amp; filtering across the complete market
            </div>
          )}

          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              <ListingsTable
                listings={displayListings}
                sort={uiSort}
                order={uiOrder}
                page={page}
                onSort={handleSort}
                onSelectCard={handleSelectCard}
                onVisible={requestUuid}
                selectedUuid={selectedUuid}
                wideSpreadUuids={wideSpreadUuids}
                newEntryUUIDs={newEntryUUIDs}
              />

              {selectedListing && (
                <HistoricalPanel
                  listing={selectedListing}
                  velocityData={selectedVelocity}
                  velocityLoading={selectedVelLoading}
                  onClose={() => setSelectedUuid(null)}
                />
              )}

              {/* Hide pagination for mlb_card (always full data) and when fully scanned */}
              {!isMlbCard && !isFullData && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </main>
      )}

      <footer className="footer">
        <p>
          Data sourced from the official MLB The Show 26 API · Prices update on refresh ·
          10% market tax · Velocity &amp; snipe stats fetched on scroll, cached 5 min ·
          Wide spread = {WIDE_SPREAD_MULTIPLIER}× rarity median
        </p>
      </footer>
    </>
  )
}
