import { useState, useEffect, useCallback } from 'react'
import { loadCatalog, getCachedCatalog } from '../store/catalog'

/**
 * Auto-loads the shared items.json catalog when the component mounts.
 * Returns { catalog, loading, progress, error, reload }.
 */
export function useCollectionTracker() {
  const [catalog,  setCatalog]  = useState(getCachedCatalog)
  const [loading,  setLoading]  = useState(!getCachedCatalog())
  const [progress, setProgress] = useState({ page: 0, total: 0 })
  const [error,    setError]    = useState(null)

  const load = useCallback(async () => {
    if (getCachedCatalog()) {
      setCatalog(getCachedCatalog())
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const items = await loadCatalog(prog => setProgress(prog))
      setCatalog(items)
    } catch (e) {
      setError(e.message || 'Failed to load card catalog')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { catalog, loading, progress, error, reload: load }
}
