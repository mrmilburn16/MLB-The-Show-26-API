import { useState, useRef, useCallback } from 'react'

/**
 * Renders a card/item name that copies itself to the clipboard when clicked.
 * Uses e.stopPropagation() so it doesn't bubble up to row-selection handlers.
 */
export default function CopyableName({ name }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  const handleClick = useCallback(e => {
    e.stopPropagation()
    navigator.clipboard.writeText(name).then(() => {
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }, [name])

  return (
    <span
      className={`card-name-text${copied ? ' card-name-text--copied' : ''}`}
      onClick={handleClick}
      title="Click to copy name"
    >
      {copied ? <><span className="copy-check">✓</span> Copied!</> : name}
    </span>
  )
}
