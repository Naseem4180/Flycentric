import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/theme.css'
// Loaded last so the responsive corrections win over the base layout rules
// without needing !important on every declaration.
import './styles/responsive.css'
import App from './App.jsx'
import { ToastProvider } from './ui/Toast'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
