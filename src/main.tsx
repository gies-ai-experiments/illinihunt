import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initSentry } from './lib/sentry'

// Initialize observability before anything else so init failures are captured
initSentry()

// Recover from stale lazy-loaded chunks after a deploy. Vite emits this event
// when an `import()` call resolves to a content-hashed asset that no longer
// exists (the user's tab was open across a deploy and the new build replaced
// the chunk with a different hash). One-time reload picks up the fresh index
// HTML, which references current chunk URLs. Guard with sessionStorage so a
// genuinely-broken deploy doesn't put the user in a refresh loop.
window.addEventListener('vite:preloadError', (event) => {
  const RELOAD_FLAG = 'illinihunt:preload-error-reloaded'
  if (sessionStorage.getItem(RELOAD_FLAG)) {
    // Already tried once this session — let the error surface so we see it
    // in Sentry rather than spinning indefinitely.
    return
  }
  event.preventDefault()
  sessionStorage.setItem(RELOAD_FLAG, '1')
  window.location.reload()
})

// Validate required environment variables before app initialization.
// Post-Azure-migration: Entra ID auth requires the Azure vars; the Supabase
// vars are optional (only needed for legacy un-migrated admin/moderation flows).
const requiredEnvVars = ['VITE_AZURE_TENANT_ID', 'VITE_AZURE_CLIENT_ID'] as const

function validateEnvironment(): string | null {
  for (const key of requiredEnvVars) {
    if (!import.meta.env[key]) {
      return `Missing required environment variable: ${key}`
    }
  }
  return null
}

function renderError(message: string) {
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui, sans-serif; padding: 2rem; text-align: center; background: #13294B; color: white;">
        <h1 style="font-size: 1.5rem; margin-bottom: 1rem; color: #FF6B35;">Configuration Error</h1>
        <p style="color: #94a3b8; max-width: 400px;">${message}</p>
        <p style="color: #64748b; font-size: 0.875rem; margin-top: 1rem;">Check your .env.local file and restart the development server.</p>
      </div>
    `
  }
}

// Check environment before initializing
const envError = validateEnvironment()
if (envError) {
  renderError(envError)
} else {
  // MSAL session restoration happens inside AuthProvider; just render.
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}