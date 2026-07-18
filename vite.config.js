import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Port 3000 matches the Supabase project's default Site URL, so magic-link
  // emails redirect back to the local dev server. All backend traffic goes
  // through the Express API server (see server/index.js).
  server: {
    port: 3000,
    proxy: { '/api': 'http://localhost:8787' }
  },
})
