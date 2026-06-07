/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Entra ID (UIUC tenant)
  readonly VITE_AZURE_TENANT_ID: string
  readonly VITE_AZURE_CLIENT_ID: string
  readonly VITE_AZURE_API_CLIENT_ID?: string
  // Express API base URL (e.g. https://illinihunt.azurewebsites.net/api or /api)
  readonly VITE_API_URL?: string
  // Optional client-side Sentry DSN
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
