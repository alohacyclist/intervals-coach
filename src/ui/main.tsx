// First, so every module after it is written in the athlete's language.
import './language.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import '@fontsource/overpass/latin-400.css'
import '@fontsource/overpass/latin-500.css'
import '@fontsource/overpass/latin-600.css'
import '@fontsource/overpass/latin-800.css'
import './styles.css'
import { registerServiceWorker } from './register-sw.ts'

const container = document.getElementById('root')
if (!container) throw new Error('Root element missing')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
