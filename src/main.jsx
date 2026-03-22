import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PricingPage from './pages/PricingPage.jsx'

const isPricing = window.location.pathname.startsWith('/pricing')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPricing ? <PricingPage /> : <App />}
  </StrictMode>,
)
