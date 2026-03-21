/**
 * Vercel serverless proxy for mlb26.theshow.com
 *
 * Vercel rewrites /apis/:path* → /api/proxy?apipath=:path*
 * and automatically appends the original query string, so:
 *
 *   /apis/listings.json?type=mlb_card&page=1
 *   → req.query = { apipath: 'listings.json', type: 'mlb_card', page: '1' }
 *   → upstream: https://mlb26.theshow.com/apis/listings.json?type=mlb_card&page=1
 *
 * The frontend code needs zero changes — API_BASE stays '/apis'.
 */
export default async function handler(req, res) {
  const { apipath, ...rest } = req.query

  if (!apipath) {
    return res.status(400).json({ error: 'Missing apipath parameter' })
  }

  const qs = new URLSearchParams(rest).toString()
  const url = `https://mlb26.theshow.com/apis/${apipath}${qs ? `?${qs}` : ''}`

  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'application/json' },
    })

    const data = await upstream.json()

    // Cache at the edge: fresh for 60 s, serve stale for up to 2 min while revalidating
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
    res.status(upstream.status).json(data)
  } catch (err) {
    res.status(502).json({ error: 'Upstream fetch failed', detail: String(err) })
  }
}
