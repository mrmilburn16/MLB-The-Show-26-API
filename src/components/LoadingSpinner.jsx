export default function LoadingSpinner() {
  return (
    <div className="loading-wrap">
      <div className="spinner" />
      <p style={{ color: '#8899aa', marginTop: 16 }}>Fetching market data...</p>
    </div>
  )
}
