import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/400-italic.css'
import '@fontsource/courier-prime/700.css'
import '@fontsource/courier-prime/700-italic.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
