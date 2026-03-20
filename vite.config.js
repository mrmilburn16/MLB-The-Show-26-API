import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/apis': {
        target: 'https://mlb26.theshow.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
