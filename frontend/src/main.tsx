import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerLicenses } from './app/licenses'
import { applyTheme, useUi } from './app/store'
import { bootLive } from './app/data/live'
import './index.css'
import './app/styles/vendors.css'

registerLicenses()
applyTheme(useUi.getState().theme)

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 1500, retry: 1 } } })

// Live data is overlaid before the app module (and its id lookups) loads.
bootLive().finally(async () => {
  const { App } = await import('./app/App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
})
