import { useRef } from 'react'
import { RARITIES, POSITIONS, TEAMS, SERIES_OPTIONS } from '../constants'

// ── Type definitions ──────────────────────────────────────────
// Controls which filter rows are visible per listing type.
// Keeps the UI clean: equipment has no position/team/series;
// stadiums/sponsors have no rarity/ovr either.

const TYPE_OPTIONS = [
  {
    value: 'mlb_card',    label: '⚾ Players',
    showRarity: true, showPosition: true, showTeam: true,
    showSeries: true, showSet: true, showOVR: true, showBrand: false,
  },
  {
    value: 'equipment',   label: '🏏 Equipment',
    showRarity: true, showPosition: false, showTeam: false,
    showSeries: false, showSet: false, showOVR: false, showBrand: true,
  },
  {
    value: 'stadium',     label: '🏟 Stadium',
    showRarity: false, showPosition: false, showTeam: false,
    showSeries: false, showSet: false, showOVR: false, showBrand: false,
  },
  {
    value: 'sponsorship', label: '💰 Sponsorship',
    showRarity: false, showPosition: false, showTeam: false,
    showSeries: false, showSet: false, showOVR: false, showBrand: false,
  },
  {
    value: 'unlockable',  label: '🎁 Unlockable',
    showRarity: true, showPosition: false, showTeam: false,
    showSeries: false, showSet: false, showOVR: false, showBrand: false,
  },
]

const SET_OPTIONS = [
  { value: 'legend',    label: 'Legends'    },
  { value: 'flashback', label: 'Flashbacks' },
]

const PRICE_PRESETS = [
  {
    label: 'Budget',
    title: 'Budget Flips  (500 – 5,000)',
    apply: { minBuyPrice: '500', maxBuyPrice: '5000', minSellPrice: '', maxSellPrice: '' },
  },
  {
    label: 'Mid-Range',
    title: 'Mid-Range  (5,000 – 25,000)',
    apply: { minBuyPrice: '5000', maxBuyPrice: '25000', minSellPrice: '', maxSellPrice: '' },
  },
  {
    label: 'High-End',
    title: 'High-End  (25,000+)',
    apply: { minBuyPrice: '25000', maxBuyPrice: '', minSellPrice: '', maxSellPrice: '' },
  },
]

const PRICE_CLEAR = { minBuyPrice: '', maxBuyPrice: '', minSellPrice: '', maxSellPrice: '' }

function NumInput({ label, filterKey, value, onChange, placeholder = '—' }) {
  return (
    <div className="fb-num-field">
      <label className="fb-num-label">{label}</label>
      <input
        type="number"
        className="fb-num-input"
        placeholder={placeholder}
        value={value}
        min={0}
        onChange={e => onChange({ [filterKey]: e.target.value })}
      />
    </div>
  )
}

export default function FiltersBar({ filters, onFilterChange, onRefresh }) {
  const searchRef   = useRef(null)
  const debounceRef = useRef(null)

  const currentType = TYPE_OPTIONS.find(t => t.value === (filters.type || 'mlb_card'))
    ?? TYPE_OPTIONS[0]

  function handleTypeChange(newType) {
    const cfg = TYPE_OPTIONS.find(t => t.value === newType) ?? TYPE_OPTIONS[0]
    // Clear filters that don't apply to the new type so stale values don't sneak into the query
    const clear = {}
    if (!cfg.showPosition) clear.position = ''
    if (!cfg.showTeam)     clear.team     = ''
    if (!cfg.showSeries)   clear.series   = ''
    if (!cfg.showSet)      clear.set      = ''
    if (!cfg.showOVR)    { clear.minRank  = ''; clear.maxRank = '' }
    if (!cfg.showRarity)   clear.rarity   = ''
    if (!cfg.showBrand)    clear.brand    = ''
    onFilterChange({ type: newType, ...clear })
  }

  function handleSearchInput(e) {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onFilterChange({ name: e.target.value.trim() })
    }, 400)
  }

  const hasPriceFilter =
    filters.minBuyPrice || filters.maxBuyPrice ||
    filters.minSellPrice || filters.maxSellPrice

  return (
    <div className="filters-bar">

      {/* ── Row 0: Type switcher ── */}
      <div className="filters-inner filters-inner--type">
        <span className="fb-type-label">TYPE</span>
        <div className="fb-type-tabs">
          {TYPE_OPTIONS.map(t => (
            <button
              key={t.value}
              className={`fb-type-tab${currentType.value === t.value ? ' fb-type-tab--active' : ''}`}
              onClick={() => handleTypeChange(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Row 1: Price range + OVR + quick presets ── */}
      <div className="filters-inner filters-inner--price">

        <div className="fb-price-group">
          <span className="fb-group-label">BUY ORDER RANGE</span>
          <div className="fb-price-row">
            <NumInput label="Min" filterKey="minBuyPrice"  value={filters.minBuyPrice}  onChange={onFilterChange} placeholder="0" />
            <span className="fb-range-sep">–</span>
            <NumInput label="Max" filterKey="maxBuyPrice"  value={filters.maxBuyPrice}  onChange={onFilterChange} placeholder="∞" />
          </div>
        </div>

        <div className="fb-price-group">
          <span className="fb-group-label">SELL ORDER RANGE</span>
          <div className="fb-price-row">
            <NumInput label="Min" filterKey="minSellPrice" value={filters.minSellPrice} onChange={onFilterChange} placeholder="0" />
            <span className="fb-range-sep">–</span>
            <NumInput label="Max" filterKey="maxSellPrice" value={filters.maxSellPrice} onChange={onFilterChange} placeholder="∞" />
          </div>
        </div>

        {currentType.showOVR && (
          <div className="fb-price-group">
            <span className="fb-group-label">OVR RANGE</span>
            <div className="fb-price-row">
              <NumInput label="Min" filterKey="minRank" value={filters.minRank} onChange={onFilterChange} placeholder="0"   />
              <span className="fb-range-sep">–</span>
              <NumInput label="Max" filterKey="maxRank" value={filters.maxRank} onChange={onFilterChange} placeholder="99" />
            </div>
          </div>
        )}

        <div className="fb-divider" />

        <div className="fb-presets">
          <span className="fb-group-label">QUICK PRESET</span>
          <div className="fb-preset-row">
            {PRICE_PRESETS.map(p => (
              <button
                key={p.label}
                className={`fb-preset-btn${Object.entries(p.apply).every(([k, v]) => filters[k] === v) ? ' fb-preset-btn--active' : ''}`}
                title={p.title}
                onClick={() => onFilterChange(p.apply)}
              >
                {p.label}
              </button>
            ))}
            {hasPriceFilter && (
              <button
                className="fb-preset-btn fb-preset-btn--clear"
                onClick={() => onFilterChange(PRICE_CLEAR)}
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: Categorical filters (type-aware) + search + refresh ── */}
      <div className="filters-inner filters-inner--cats">
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input
            ref={searchRef}
            type="text"
            className="search-input"
            placeholder={`Search ${currentType.label.split(' ').slice(1).join(' ').toLowerCase() || 'player'} name...`}
            defaultValue={filters.name}
            onChange={handleSearchInput}
          />
        </div>

        {currentType.showRarity && (
          <select className="filter-select" value={filters.rarity} onChange={e => onFilterChange({ rarity: e.target.value })}>
            <option value="">All Rarities</option>
            {RARITIES.map(r => <option key={r} value={r.toLowerCase()}>{r}</option>)}
          </select>
        )}

        {currentType.showPosition && (
          <select className="filter-select" value={filters.position} onChange={e => onFilterChange({ position: e.target.value })}>
            <option value="">All Positions</option>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}

        {currentType.showTeam && (
          <select className="filter-select" value={filters.team} onChange={e => onFilterChange({ team: e.target.value })}>
            <option value="">All Teams</option>
            {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        {currentType.showSeries && (
          <select className="filter-select" value={filters.series} onChange={e => onFilterChange({ series: e.target.value })}>
            <option value="">All Series</option>
            {SERIES_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        )}

        {currentType.showSet && (
          <select className="filter-select" value={filters.set} onChange={e => onFilterChange({ set: e.target.value })}>
            <option value="">All Sets</option>
            {SET_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        )}

        {currentType.showBrand && (
          <div className="fb-num-field" style={{ flexShrink: 0 }}>
            <label className="fb-num-label">Brand ID</label>
            <input
              type="number"
              className="fb-num-input"
              style={{ width: 80 }}
              placeholder="—"
              value={filters.brand}
              min={0}
              onChange={e => onFilterChange({ brand: e.target.value })}
            />
          </div>
        )}

        {onRefresh && (
          <button className="page-btn refresh-btn" onClick={onRefresh}>⟳ Refresh</button>
        )}
      </div>
    </div>
  )
}
