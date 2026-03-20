export const API_BASE = '/apis'

export const RARITY_COLORS = {
  Diamond: { glow: '#4da6ff', text: '#c8e4ff', badge: '#0d4f8f' },
  Gold:    { glow: '#ffd644', text: '#fff8e1', badge: '#8f7210' },
  Silver:  { glow: '#b0c4de', text: '#e8eef5', badge: '#5a6a7e' },
  Bronze:  { glow: '#c9884a', text: '#f5e6d5', badge: '#6b4828' },
  Common:  { glow: '#888',    text: '#ddd',    badge: '#333'    },
}

export const TEAMS = [
  'BAL','BOS','NYY','TB','TOR','CWS','CLE','DET','KC','MIN',
  'HOU','LAA','OAK','SEA','TEX','ATL','MIA','NYM','PHI','WAS',
  'CHC','CIN','MIL','PIT','STL','ARI','COL','LAD','SD','SF','FA',
]

export const RARITIES = ['Diamond', 'Gold', 'Silver', 'Bronze', 'Common']

export const POSITIONS = ['SP','RP','CP','C','1B','2B','3B','SS','LF','CF','RF']

export const SERIES_OPTIONS = [
  { label: 'Live',               value: '1337'  },
  { label: 'Rookie',             value: '10001' },
  { label: 'Breakout',           value: '10002' },
  { label: 'All-Star',           value: '10004' },
  { label: 'Awards',             value: '10005' },
  { label: 'Postseason',         value: '10006' },
  { label: 'Signature',          value: '10009' },
  { label: 'Prime',              value: '10013' },
  { label: 'Milestone',          value: '10022' },
  { label: 'World Baseball Classic', value: '10028' },
  { label: 'Standout',           value: '10034' },
  { label: "St. Patrick's Day",  value: '10062' },
]

export const MARKET_TAX = 0.10

// ── Diamond quicksell values (stubs) ──────────────────────────
// Live Series values verified in-game. Non-Live = floor(Live / 2).
// 93–99: unverified — kept null until confirmed.
export const QUICKSELL_LIVE = {
  85: 3000,
  86: 3750,
  87: 4500,
  88: 5500,
  89: 7000,
  90: 7500,
  91: 8000,
  92: 8500,
  93: null,
  94: null,
  95: null,
  96: null,
  97: null,
  98: null,
  99: null,
}

export const QUICKSELL_NON_LIVE = {
  85: Math.floor(3000 / 2),   // 1500
  86: Math.floor(3750 / 2),   // 1875
  87: Math.floor(4500 / 2),   // 2250
  88: Math.floor(5500 / 2),   // 2750
  89: Math.floor(7000 / 2),   // 3500
  90: Math.floor(7500 / 2),   // 3750
  91: Math.floor(8000 / 2),   // 4000
  92: Math.floor(8500 / 2),   // 4250
  93: null,
  94: null,
  95: null,
  96: null,
  97: null,
  98: null,
  99: null,
}

/**
 * Returns the quicksell floor for a card, or null if unknown.
 * `isLive` — true when the card's series_id is the Live Series (1337).
 */
export function getQuicksellFloor(ovr, isLive) {
  if (ovr == null || ovr < 85) return null   // only Diamond cards have meaningful floors
  const table = isLive ? QUICKSELL_LIVE : QUICKSELL_NON_LIVE
  return table[ovr] ?? null
}
