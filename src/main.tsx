import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './demo.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
