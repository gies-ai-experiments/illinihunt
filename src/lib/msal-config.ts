// MSAL configuration for the IlliniHunt frontend.
// Used by AuthContext to acquire Entra ID tokens for the Express API.

import type { Configuration } from '@azure/msal-browser'

const tenantId = import.meta.env.VITE_AZURE_TENANT_ID
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID
const apiClientId = import.meta.env.VITE_AZURE_API_CLIENT_ID ?? clientId

if (!tenantId || !clientId) {
  console.warn(
    '[msal] VITE_AZURE_TENANT_ID / VITE_AZURE_CLIENT_ID are not set — login will fail until configured.',
  )
}

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId ?? '',
    authority: `https://login.microsoftonline.com/${tenantId ?? 'common'}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
}

// Scopes requested when calling /api/* endpoints. The API verifies these tokens
// against its registered audience (`api://<client-id>`).
//
// NOTE: the scope name is whatever you exposed under "Expose an API" in the
// Entra app registration. We use `Files.Read` because that's what's currently
// configured. If you'd rather have something semantically clearer like
// `access_as_user`, add it in Entra → Expose an API → Add a scope, then update
// this constant.
export const apiScopes = [`api://${apiClientId}/Files.Read`]
