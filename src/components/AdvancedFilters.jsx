import { useState } from 'react'

const FIELD_GROUPS = [
  {
    label: 'Profit',
    fields: [
      { key: 'minProfit', label: 'Min Profit', unit: 'stubs' },
      { key: 'maxProfit', label: 'Max Profit', unit: 'stubs' },
    ],
  },
  {
    label: 'ROI',
    fields: [
      { key: 'minROI', label: 'Min ROI', unit: '%' },
      { key: 'maxROI', label: 'Max ROI', unit: '%' },
    ],
  },
  {
    label: 'Velocity',
    fields: [
      { key: 'minProfitPerMin', label: 'Min Profit/Min', unit: 'stubs/min' },
      { key: 'maxProfitPerMin', label: 'Max Profit/Min', unit: 'stubs/min' },
      { key: 'minSalesPerMin',  label: 'Min Sales/Min',  unit: 'sales/min', hint: 'filters dead cards' },
    ],
  },
  {
    label: 'Snipe Detector',
    accent: true,
    fields: [
      { key: 'minSnipeDiscount', label: 'Min Snipe %',   unit: '%',         hint: '>10% = 🎯' },
      { key: 'minSpreadPct',        label: 'Min Spread %',       unit: '%', hint: 'wide gap = opportunity' },
      { key: 'maxPremiumPctOverQS', label: 'Max QS Premium %',   unit: '%', hint: 'buy-now vs quicksell floor; low = risk-free buy' },
    ],
  },
]

const ALL_FIELDS = FIELD_GROUPS.flatMap(g => g.fields)

export default function AdvancedFilters({ filters, onChange, activeCount }) {
  const [open, setOpen] = useState(false)

  function handleInput(key, e) {
    onChange({ [key]: e.target.value })
  }

  function handleClear() {
    const cleared = Object.fromEntries(ALL_FIELDS.map(f => [f.key, '']))
    onChange({ ...cleared, hideNoBids: true })   // reset toggle to default ON
  }

  return (
    <div className="adv-filters-wrap">
      <button
        className="adv-toggle-btn"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="adv-toggle-icon">{open ? '▾' : '▸'}</span>
        Advanced Filters
        {activeCount > 0 && (
          <span className="adv-active-badge">{activeCount} active</span>
        )}
      </button>

      {open && (
        <div className="adv-filters-panel">
          <div className="adv-filter-groups">
            {FIELD_GROUPS.map(group => (
              <div key={group.label} className={`adv-filter-group ${group.accent ? 'adv-filter-group--accent' : ''}`}>
                <div className="adv-group-label">{group.label}</div>
                <div className="adv-filters-grid">
                  {group.fields.map(f => (
                    <div key={f.key} className="adv-field">
                      <label className="adv-label">
                        {f.label}
                        {f.hint && <span className="adv-field-hint">{f.hint}</span>}
                      </label>
                      <div className="adv-input-wrap">
                        <input
                          type="number"
                          className="adv-input"
                          placeholder="—"
                          value={filters[f.key]}
                          onChange={e => handleInput(f.key, e)}
                          min={0}
                        />
                        <span className="adv-unit">{f.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {/* Hide no-bids toggle */}
          <div className="adv-toggle-row">
            <label className="adv-toggle-label">
              <input
                type="checkbox"
                className="adv-toggle-check"
                checked={!!filters.hideNoBids}
                onChange={e => onChange({ hideNoBids: e.target.checked })}
              />
              <span className="adv-toggle-text">
                Hide cards with no active bids
                <span className="adv-field-hint">best_buy_price = 0</span>
              </span>
            </label>
          </div>

          <div className="adv-actions">
            <span className="adv-hint">⚡ Client-side — instant filtering on loaded listings</span>
            {activeCount > 0 && (
              <button className="adv-clear-btn" onClick={handleClear}>Clear All</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
