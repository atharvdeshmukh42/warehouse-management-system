import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Let ngrok (or any tunnel) hostnames reach the dev server
    allowedHosts: true,
    // Send /api/* to FastAPI, so the browser only ever talks to one address
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
