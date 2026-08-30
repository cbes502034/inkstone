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
        {/* 前景的幾隻蝴蝶。主群在卡片後面會被卡片的半透明底吃掉，
            手機上尤其明顯 —— 卡片幾乎佔滿寬度。這一層浮在內容之上，
            但很淡、很少、也比較小，只負責製造景深而不搶字 */}
        {/* 光線自己一層，用 screen 混合模式疊在內容上 ——
            它必須整張畫布加亮才看得見，而那個模式會讓深色的蝴蝶消失，
            所以不能跟蝴蝶共用 */}
        <StarField layer="rays" />
        <StarField layer="butterflies" />
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
