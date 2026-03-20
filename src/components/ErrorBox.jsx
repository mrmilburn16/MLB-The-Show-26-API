export default function ErrorBox({ message }) {
  if (!message) return null
  return (
    <div className="error-box">
      <span style={{ fontSize: 20 }}>⚠️</span>
      <div>
        <strong>API Error</strong>
        <p style={{ margin: '4px 0 0', opacity: 0.8 }}>{message}</p>
      </div>
    </div>
  )
}
