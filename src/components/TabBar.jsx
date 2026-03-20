const TABS = [
  { key: 'market',   label: '📊 Market',          hint: 'Live listings, flip metrics, snipe detector' },
  { key: 'fullscan', label: '🔭 Full Scan',        hint: 'Fetch every card in the market and sort by any metric' },
  { key: 'scanner',  label: '🎯 Bargain Scanner',  hint: 'Multi-page sweep for cards priced below average' },
]

export default function TabBar({ activeTab, onTabChange }) {
  return (
    <div className="tab-bar">
      <div className="tab-bar-inner">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`tab-btn${activeTab === tab.key ? ' tab-btn--active' : ''}`}
            title={tab.hint}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}
