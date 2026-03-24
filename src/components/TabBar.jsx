const TABS = [
  { key: 'market',       label: '📊 Market',          hint: 'Live listings, flip metrics, snipe detector' },
  { key: 'snipealerts',  label: '🎯 Snipe Alerts',    hint: 'Real-time snipe opportunities sorted by profit' },
  { key: 'fullscan',     label: '🔭 Full Scan',        hint: 'Fetch every card in the market and sort by any metric' },
  { key: 'scanner',      label: '📡 Bargain Scanner',  hint: 'Multi-page sweep for cards priced below average' },
  { key: 'cardfinder',   label: '🃏 Card Finder',      hint: 'Search every card by attribute thresholds' },
  { key: 'collections',  label: '📦 Collections',      hint: 'Collection cost tracker by team, rarity, and series' },
  { key: 'rosterupdates',label: '📈 Roster Updates',   hint: 'Track rating changes and price impact from roster updates' },
  { key: 'gamehistory',  label: '📜 Game History',     hint: 'Look up any player\'s recent Diamond Dynasty game log' },
  { key: 'pennystocks',  label: '💰 Penny Stocks',     hint: 'Ultra-cheap cards near quicksell value — bulk exchange fodder or roster update lottery tickets' },
  { key: 'flipplanner', label: '📋 Flip Planner',     hint: 'Optimize your stub allocation across cards — respects the 20-order-per-card game limit' },
]

export default function TabBar({ activeTab, onTabChange, alertCount = 0 }) {
  return (
    <div className="tab-bar">
      <div className="tab-bar-inner">
        {TABS.map(tab => {
          const showBadge = tab.key === 'snipealerts' && alertCount > 0
          return (
            <button
              key={tab.key}
              className={`tab-btn${activeTab === tab.key ? ' tab-btn--active' : ''}`}
              title={tab.hint}
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label}
              {showBadge && (
                <span className="tab-alert-badge">{alertCount}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
