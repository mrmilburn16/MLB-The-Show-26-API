/**
 * Shared pitch-arsenal utilities used by HistoricalPanel, ComparisonModal,
 * CardFinder, and useCardFinder.
 */

// ── Speed bar scale ──────────────────────────────────────────────
export const SPEED_MIN = 70   // MPH → 0 %
export const SPEED_MAX = 102  // MPH → 100 %

export function speedBarPct(speed) {
  if (speed == null) return 0
  return Math.min(100, Math.max(0, ((speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100))
}

// ── Pitch-type classification + colour ──────────────────────────

/**
 * Returns { color, category } for a pitch name string.
 *
 * Categories:
 *   Fastball  — 4-seam, 2-seam, sinker             → red
 *   Cutter    — cutter                              → orange  (check before Fastball)
 *   Breaking  — slider, sweeper, curve, slurve      → indigo/purple
 *   Offspeed  — changeup, splitter, fork, screwball → green
 *   Specialty — knuckleball, etc.                   → violet
 */
export function pitchTypeInfo(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('cutter'))                                                      return { color: '#f97316', category: 'Cutter'    }
  if (n.includes('fastball') || n.includes('sinker') || n.includes('two-seam')) return { color: '#ef4444', category: 'Fastball'  }
  if (n.includes('slider') || n.includes('sweeper') || n.includes('slurve') ||
      n.includes('curve'))                                                        return { color: '#818cf8', category: 'Breaking'  }
  if (n.includes('change') || n.includes('splitter') || n.includes('fork') ||
      n.includes('screwball') || n.includes('palm'))                             return { color: '#34d399', category: 'Offspeed'  }
  if (n.includes('knuckle'))                                                     return { color: '#c084fc', category: 'Specialty' }
  return { color: '#6ab0e8', category: 'Other' }
}

// ── Aggregate stats from a pitches array ────────────────────────

/**
 * Computes summary stats for an array of pitch objects.
 * Each pitch: { name, speed, control, movement }
 */
export function pitchArsenalStats(pitches) {
  if (!pitches?.length) return null
  const speeds = pitches.map(p => p.speed).filter(v => v != null && v > 0)
  const ctrls  = pitches.map(p => p.control).filter(v => v != null && v > 0)
  const movs   = pitches.map(p => p.movement).filter(v => v != null && v > 0)

  const fastest    = speeds.length ? Math.max(...speeds) : null
  const slowest    = speeds.length ? Math.min(...speeds) : null
  const speedRange = (fastest != null && slowest != null && speeds.length > 1) ? fastest - slowest : 0

  return {
    count:       pitches.length,
    fastest,
    slowest,
    speedRange,
    avgControl:  ctrls.length  ? Math.round(ctrls.reduce((a, b)  => a + b, 0) / ctrls.length)  : null,
    avgMovement: movs.length   ? Math.round(movs.reduce((a, b)   => a + b, 0) / movs.length)   : null,
  }
}

// ── Pitch type options for the Card Finder dropdown ──────────────

export const PITCH_TYPE_OPTIONS = [
  { label: 'Any pitch',          value: '' },
  { label: '4-Seam Fastball',    value: '4-seam' },
  { label: '2-Seam Fastball',    value: '2-seam' },
  { label: 'Sinker',             value: 'sinker' },
  { label: 'Cutter',             value: 'cutter' },
  { label: 'Slider',             value: 'slider' },
  { label: 'Sweeper',            value: 'sweeper' },
  { label: 'Curveball',          value: 'curve' },
  { label: 'Changeup',           value: 'changeup' },
  { label: 'Circle Changeup',    value: 'circle change' },
  { label: 'Splitter',           value: 'splitter' },
  { label: 'Knuckleball',        value: 'knuckle' },
]

/** True if the pitches array contains a pitch matching the type slug */
export function hasPitchType(pitches, typeSlug) {
  if (!typeSlug || !pitches?.length) return true   // no filter
  return pitches.some(p => (p.name || '').toLowerCase().includes(typeSlug.toLowerCase()))
}
