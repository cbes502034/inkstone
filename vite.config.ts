import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  build: {
    rolldownOptions: {
      output: {
        /**
         * 把不常變動的第三方套件拆成獨立檔案。
         *
         * 全部打成一包的問題是：只要改一行自己的程式碼，
         * 使用者就要重新下載整個 500KB —— 包含完全沒變的 React。
         * 拆開之後，套件那幾包會一直命中瀏覽器快取，
         * 每次更新只需要下載真正變動的部分。
         *
         * 依「變動頻率」分組，不是依大小 —— 分組的目的是快取命中率。
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return

          // 幾乎不會動
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)/.test(id)) {
            return 'react'
          }
          // 版本升級時才動
          if (id.includes('@tanstack')) return 'query'
          // 動畫與圖示：體積大但穩定
          if (id.includes('motion')) return 'motion'
          if (id.includes('lucide-react')) return 'icons'

          return 'vendor'
        },
      },
    },
  },
})
