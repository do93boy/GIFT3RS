import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
    // Exclude Deno-only Edge Function tests — run those with: deno test
    exclude: ['node_modules/**', 'supabase/**'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
    },
  },
})
