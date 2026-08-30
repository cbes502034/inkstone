import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { OfflineNotice } from './components/OfflineNotice'
import { CursorTrail } from './components/CursorTrail'
import { StarField } from './components/StarField'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 錯誤邊界放最外層 —— 任何元件渲染時丟例外，
        預設行為是整棵樹被卸載，使用者只看到全白的畫面 */}
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <StarField />
        {/* 游標軌跡畫在最上層，所以不跟星空共用畫布 */}
        <CursorTrail />
        <OfflineNotice />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
