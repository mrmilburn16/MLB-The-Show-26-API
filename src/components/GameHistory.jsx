import { useState, useEffect, useCallback, useMemo } from 'react'
import { API_BASE } from '../constants'

// ── Constants ────────────────────────────────────────────────────
const PLATFORMS = [
  { label: 'PSN',           value: 'psn'   },
  { label: 'Xbox',          value: 'xbl'   },
  { label: 'Switch',        value: 'nsw'   },
  { label: 'MLB The Show',  value: 'mlbts' },
]

const MODES = [
  { label: 'All',              value: 'all'        },
  { label: 'Diamond Dynasty',  value: 'arena'      },
  { label: 'Exhibition',       value: 'exhibition' },
]

const LS_USERNAME    = 'gh_username'
const LS_PLATFORM    = 'gh_platform'
const LS_MY_GAMERTAG = 'gh_my_gamertag'
const LS_FRIENDS     = 'gh_friend_tags'

// ── Helpers ──────────────────────────────────────────────────────

/** Strip MLB The Show colour-code escapes like ^b54^ or ^r^ */
function cleanTag(str) {
  return (str || '').replace(/\^[a-zA-Z]\d*\^/g, '').trim()
}

/**
 * Determine which side (home|away|null) the user is on.
 * Checks the searched gamertag AND any co-op friend tags against home_name / away_name.
 * Also handles CPU opponents as a fallback.
 */
function getUserSide(game, myGamertag, friendTags = []) {
  const allTags = [myGamertag, ...friendTags]
  const clean = str => (str || '').replace(/\^[a-z]\d+\^/g, '').trim().toLowerCase()
  const homeName = clean(game.home_name)
  const awayName = clean(game.away_name)

  for (const tag of allTags) {
    const t = (tag || '').toLowerCase().trim()
    if (!t) continue
    if (homeName.includes(t) || t.includes(homeName)) return 'home'
    if (awayName.includes(t) || t.includes(awayName)) return 'away'
  }

  if (homeName === 'cpu') return 'away'
  if (awayName === 'cpu') return 'home'

  return null
}

/** Format a date string nicely: "Mar 19, 2:47 AM" */
function fmtDate(raw) {
  if (!raw) return '—'
  try {
    const d = new Date(raw)
    if (isNaN(d)) return raw
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return raw
  }
}

/** Compute summary stats from a list of augmented game rows */
function computeStats(rows) {
  let wins = 0, losses = 0, runsFor = 0, runsAgainst = 0
  let streak = 0, streakType = null

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r.result === 'W') { wins++; runsFor += r.userScore; runsAgainst += r.oppScore }
    else if (r.result === 'L') { losses++; runsFor += r.userScore; runsAgainst += r.oppScore }

    // streak: count from index 0 until result changes
    if (r.result === 'W' || r.result === 'L') {
      if (i === 0) { streakType = r.result; streak = 1 }
      else if (r.result === streakType) { streak++ }
      // stop counting streak once it breaks
    }
  }

  const total  = wins + losses
  const winPct = total > 0 ? Math.round((wins / total) * 100) : 0
  const avgFor = total > 0 ? (runsFor / total).toFixed(1) : '—'
  const avgAgainst = total > 0 ? (runsAgainst / total).toFixed(1) : '—'

  return { wins, losses, total, winPct, runsFor, runsAgainst, avgFor, avgAgainst, streak, streakType }
}

// ── Sub-components ───────────────────────────────────────────────

function ModeBadge({ mode }) {
  if (!mode) return null
  const upper = mode.toUpperCase()
  if (upper === 'ARENA') return <span className="gh-badge gh-badge--dd">DD</span>
  return <span className="gh-badge gh-badge--ex">EX</span>
}

function ResultBadge({ result }) {
  if (result === 'W') return <span className="gh-result gh-result--w">W</span>
  if (result === 'L') return <span className="gh-result gh-result--l">L</span>
  return <span className="gh-result gh-result--u">—</span>
}

function SummaryBar({ stats, total }) {
  const { wins, losses, winPct, runsFor, runsAgainst, avgFor, avgAgainst, streak, streakType } = stats
  return (
    <div className="gh-summary">
      <div className="gh-summary-chip">
        <span className="gh-summary-label">Record</span>
        <span className="gh-summary-value">
          <span className="gh-w">{wins}W</span>
          {' – '}
          <span className="gh-l">{losses}L</span>
          <span className="gh-pct"> ({winPct}%)</span>
        </span>
      </div>
      <div className="gh-summary-chip">
        <span className="gh-summary-label">Runs Scored</span>
        <span className="gh-summary-value">{runsFor}</span>
      </div>
      <div className="gh-summary-chip">
        <span className="gh-summary-label">Runs Allowed</span>
        <span className="gh-summary-value">{runsAgainst}</span>
      </div>
      <div className="gh-summary-chip">
        <span className="gh-summary-label">Avg Scored / Game</span>
        <span className="gh-summary-value">{avgFor}</span>
      </div>
      <div className="gh-summary-chip">
        <span className="gh-summary-label">Avg Allowed / Game</span>
        <span className="gh-summary-value">{avgAgainst}</span>
      </div>
      {streak > 0 && (
        <div className="gh-summary-chip gh-summary-chip--streak">
          <span className="gh-summary-label">Streak</span>
          <span className={`gh-summary-value gh-streak--${streakType?.toLowerCase()}`}>
            {streakType}{streak}
          </span>
        </div>
      )}
      <div className="gh-summary-chip">
        <span className="gh-summary-label">This Page</span>
        <span className="gh-summary-value">{total} games</span>
      </div>
    </div>
  )
}

function GameRow({ row }) {
  const {
    date, mode, result, userScore, oppScore,
    userTeam, opponent, oppTeam, pitcherInfo,
  } = row

  return (
    <tr className={`gh-row gh-row--${result?.toLowerCase() || 'u'}`}>
      <td className="gh-td gh-td--date">{date}</td>
      <td className="gh-td gh-td--mode"><ModeBadge mode={mode} /></td>
      <td className="gh-td gh-td--result"><ResultBadge result={result} /></td>
      <td className="gh-td gh-td--score">
        <span className="gh-score">
          <span className={result === 'W' ? 'gh-score-win' : 'gh-score-lose'}>{userScore}</span>
          <span className="gh-score-sep"> – </span>
          <span className={result === 'L' ? 'gh-score-win' : 'gh-score-lose'}>{oppScore}</span>
        </span>
      </td>
      <td className="gh-td gh-td--team">{userTeam || '—'}</td>
      <td className="gh-td gh-td--opp">{opponent || '—'}</td>
      <td className="gh-td gh-td--oppteam">{oppTeam || '—'}</td>
      <td className="gh-td gh-td--pitcher">{pitcherInfo || '—'}</td>
    </tr>
  )
}

// ── Main Component ───────────────────────────────────────────────

export default function GameHistory() {
  // ── My Players settings ──
  const [myGamertag,   setMyGamertag]   = useState(() => localStorage.getItem(LS_MY_GAMERTAG) || '')
  const [friendTags,   setFriendTags]   = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_FRIENDS) || '[]') } catch { return [] }
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [friendInput,  setFriendInput]  = useState('')

  // ── Search state ──
  const [username, setUsername] = useState(
    () => localStorage.getItem(LS_MY_GAMERTAG) || localStorage.getItem(LS_USERNAME) || ''
  )
  const [platform, setPlatform] = useState(
    () => localStorage.getItem(LS_PLATFORM) || 'psn'
  )
  const [mode,       setMode]       = useState('all')
  const [page,       setPage]       = useState(1)
  const [games,      setGames]      = useState([])
  const [totalPages, setTotalPages] = useState(1)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [searched,   setSearched]   = useState('')

  // Persist settings
  useEffect(() => { localStorage.setItem(LS_MY_GAMERTAG, myGamertag) }, [myGamertag])
  useEffect(() => { localStorage.setItem(LS_FRIENDS, JSON.stringify(friendTags)) }, [friendTags])
  useEffect(() => { localStorage.setItem(LS_PLATFORM, platform) }, [platform])

  // Auto-fill the search field when My Gamertag is saved
  useEffect(() => {
    if (myGamertag) setUsername(myGamertag)
  }, [myGamertag])

  // Friends helpers
  function addFriend() {
    const t = friendInput.trim()
    if (!t || friendTags.includes(t)) return
    setFriendTags(prev => [...prev, t])
    setFriendInput('')
  }
  function removeFriend(tag) {
    setFriendTags(prev => prev.filter(f => f !== tag))
  }

  const fetchGames = useCallback(async (user, plat, mod, pg) => {
    if (!user.trim()) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page:     pg,
        username: user.trim(),
        platform: plat,
        mode:     mod,
      })
      const res  = await fetch(`${API_BASE}/game_history.json?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const gameList = data.game_history || data.games || []
      setGames(gameList)
      setTotalPages(data.total_pages || 1)
      setSearched(user.trim())
    } catch (e) {
      setError(e.message || 'Failed to load game history')
      setGames([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleSearch(e) {
    e.preventDefault()
    setPage(1)
    fetchGames(username, platform, mode, 1)
  }

  function handlePageChange(newPage) {
    setPage(newPage)
    fetchGames(searched || username, platform, mode, newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Augment raw API rows with derived fields
  const rows = useMemo(() => {
    if (!games.length || !searched) return []

    return games.map(g => {
      const side = getUserSide(g, searched, friendTags)

      const isHome   = side === 'home'
      const isAway   = side === 'away'
      const unknown  = !isHome && !isAway

      const homeScore = Number(g.home_score ?? 0)
      const awayScore = Number(g.away_score ?? 0)

      const userScore = unknown ? null : (isHome ? homeScore : awayScore)
      const oppScore  = unknown ? null : (isHome ? awayScore : homeScore)

      // Result: prefer the explicit display_result for the user's side if present
      let result = null
      if (!unknown) {
        const raw = isHome ? (g.home_display_result || g.display_result) : (g.away_display_result || g.display_result)
        if (raw) {
          result = raw.toUpperCase().startsWith('W') ? 'W' : raw.toUpperCase().startsWith('L') ? 'L' : null
        }
        // Fallback: derive from scores
        if (!result && userScore != null && oppScore != null) {
          result = userScore > oppScore ? 'W' : userScore < oppScore ? 'L' : 'T'
        }
      }

      const userTeam = isHome ? (g.home_team_full_name || g.home_full_name || g.home_team || '')
                               : (g.away_team_full_name || g.away_full_name || g.away_team || '')
      const oppTeam  = isHome ? (g.away_team_full_name || g.away_full_name || g.away_team || '')
                               : (g.home_team_full_name || g.home_full_name || g.home_team || '')

      const opponent = isHome ? cleanTag(g.away_name) : cleanTag(g.home_name)

      return {
        id:          g.id ?? Math.random(),
        date:        fmtDate(g.display_date || g.date),
        mode:        g.game_mode,
        result,
        userScore:   userScore ?? '?',
        oppScore:    oppScore  ?? '?',
        userTeam,
        opponent,
        oppTeam,
        pitcherInfo: g.display_pitcher_info || g.pitcher_info || '',
        side,
      }
    })
  }, [games, searched, friendTags])

  const stats = useMemo(() => computeStats(rows), [rows])

  const hasResults = rows.length > 0

  return (
    <div className="gh-wrap">

      {/* ── My Players settings panel ── */}
      <div className="gh-settings-bar">
        <button
          type="button"
          className={`gh-settings-toggle${settingsOpen ? ' gh-settings-toggle--open' : ''}`}
          onClick={() => setSettingsOpen(o => !o)}
        >
          ⚙ My Players
          {(myGamertag || friendTags.length > 0) && (
            <span className="gh-settings-badge">
              {[myGamertag, ...friendTags].filter(Boolean).length}
            </span>
          )}
        </button>

        {settingsOpen && (
          <div className="gh-settings-panel">
            {/* My Gamertag */}
            <div className="gh-settings-section">
              <label className="gh-settings-label">My Gamertag</label>
              <p className="gh-settings-hint">Used to auto-fill the search field and identify your side in games.</p>
              <div className="gh-settings-row">
                <input
                  type="text"
                  className="gh-input"
                  placeholder="Your gamertag…"
                  value={myGamertag}
                  onChange={e => setMyGamertag(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* My Friends */}
            <div className="gh-settings-section">
              <label className="gh-settings-label">My Friends (co-op partners)</label>
              <p className="gh-settings-hint">Add gamertags of players you play co-op with (2v2, 3v3). Their tags help identify your side.</p>
              <div className="gh-settings-row">
                <input
                  type="text"
                  className="gh-input"
                  placeholder="Friend's gamertag…"
                  value={friendInput}
                  onChange={e => setFriendInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFriend() } }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="gh-settings-add-btn"
                  onClick={addFriend}
                  disabled={!friendInput.trim()}
                >
                  + Add
                </button>
              </div>
              {friendTags.length > 0 && (
                <div className="gh-friend-list">
                  {friendTags.map(tag => (
                    <span key={tag} className="gh-friend-chip">
                      {tag}
                      <button
                        type="button"
                        className="gh-friend-remove"
                        onClick={() => removeFriend(tag)}
                        title={`Remove ${tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Search form ── */}
      <form className="gh-search-form" onSubmit={handleSearch}>
        <div className="gh-search-row">
          <div className="gh-field gh-field--username">
            <label className="gh-label">Gamertag</label>
            <input
              type="text"
              className="gh-input"
              placeholder="Enter gamertag…"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="gh-field">
            <label className="gh-label">Platform</label>
            <select
              className="gh-select"
              value={platform}
              onChange={e => setPlatform(e.target.value)}
            >
              {PLATFORMS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="gh-field">
            <label className="gh-label">Mode</label>
            <select
              className="gh-select"
              value={mode}
              onChange={e => setMode(e.target.value)}
            >
              {MODES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="gh-search-btn"
            disabled={loading || !username.trim()}
          >
            {loading ? 'Loading…' : '🔍 Search'}
          </button>
        </div>
      </form>

      {/* ── Error ── */}
      {error && (
        <div className="gh-error">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Loading spinner ── */}
      {loading && (
        <div className="gh-loading">
          <div className="spinner" />
          <span>Fetching game history…</span>
        </div>
      )}

      {/* ── Results ── */}
      {!loading && hasResults && (
        <>
          <div className="gh-results-header">
            <span className="gh-results-title">
              Game History — <strong>{searched}</strong>
            </span>
            <span className="gh-results-page">
              Page {page} of {totalPages}
            </span>
          </div>

          <SummaryBar stats={stats} total={rows.length} />

          <div className="gh-table-wrap">
            <table className="gh-table">
              <thead>
                <tr>
                  <th className="gh-th">Date</th>
                  <th className="gh-th">Mode</th>
                  <th className="gh-th">Result</th>
                  <th className="gh-th">Score</th>
                  <th className="gh-th">Your Team</th>
                  <th className="gh-th">Opponent</th>
                  <th className="gh-th">Opp Team</th>
                  <th className="gh-th">Pitcher Info</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <GameRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="gh-pagination">
              <button
                className="gh-page-btn"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
              >
                ← Prev
              </button>

              {/* Show up to 7 page numbers around current page */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push('…')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === '…'
                    ? <span key={`ellipsis-${i}`} className="gh-page-ellipsis">…</span>
                    : (
                      <button
                        key={p}
                        className={`gh-page-btn ${p === page ? 'gh-page-btn--active' : ''}`}
                        onClick={() => p !== page && handlePageChange(p)}
                      >
                        {p}
                      </button>
                    )
                )
              }

              <button
                className="gh-page-btn"
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && searched && !hasResults && (
        <div className="gh-empty">
          <div className="gh-empty-icon">⚾</div>
          <div className="gh-empty-title">No games found</div>
          <div className="gh-empty-sub">
            Check the gamertag spelling, platform, and mode and try again.
          </div>
        </div>
      )}

      {/* ── Initial idle state ── */}
      {!loading && !error && !searched && (
        <div className="gh-idle">
          <div className="gh-idle-icon">🎮</div>
          <div className="gh-idle-title">Player Game History</div>
          <div className="gh-idle-sub">
            Enter a gamertag and platform above to look up any player's recent Diamond Dynasty games.
          </div>
        </div>
      )}
    </div>
  )
}
