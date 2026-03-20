import { useState, useEffect } from 'react'

export default function Pagination({ page, totalPages, onPageChange }) {
  const [inputVal, setInputVal] = useState(page)

  useEffect(() => { setInputVal(page) }, [page])

  function go(p) {
    const clamped = Math.max(1, Math.min(totalPages, p))
    if (clamped !== page) onPageChange(clamped)
  }

  function handleInputChange(e) {
    setInputVal(e.target.value)
  }

  function handleInputCommit(e) {
    const n = parseInt(e.target.value, 10)
    if (!isNaN(n)) go(n)
  }

  return (
    <div className="pagination">
      <button className="page-btn" disabled={page <= 1} onClick={() => go(1)}>⟪</button>
      <button className="page-btn" disabled={page <= 1} onClick={() => go(page - 1)}>← Prev</button>

      <div className="page-info">
        <input
          type="number"
          className="page-input"
          min={1}
          max={totalPages}
          value={inputVal}
          onChange={handleInputChange}
          onBlur={handleInputCommit}
          onKeyDown={e => e.key === 'Enter' && handleInputCommit(e)}
        />
        <span style={{ color: '#667' }}>
          of <span style={{ color: '#c8d6e5' }}>{totalPages}</span>
        </span>
      </div>

      <button className="page-btn" disabled={page >= totalPages} onClick={() => go(page + 1)}>Next →</button>
      <button className="page-btn" disabled={page >= totalPages} onClick={() => go(totalPages)}>⟫</button>
    </div>
  )
}
