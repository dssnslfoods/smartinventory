import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Split big vendor libraries into their own chunks so the main
    // app bundle stays small and the browser can cache vendor
    // separately across deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          // Charting library (used by Dashboard + Reports + Valuation)
          'vendor-charts':   ['recharts'],
          // Supabase client (used everywhere — kept small)
          'vendor-supabase': ['@supabase/supabase-js'],
          // TanStack Query
          'vendor-query':    ['@tanstack/react-query'],
          // Router
          'vendor-router':   ['react-router-dom'],
          // Form / validation (only used on a few pages)
          'vendor-forms':    ['react-hook-form', '@hookform/resolvers', 'zod'],
          // Icons — separate so the lucide tree-shake-friendly chunk
          // doesn't bloat the main app bundle
          'vendor-icons':    ['lucide-react'],
        },
      },
    },
    // Don't warn until 800KB — our largest legitimate chunks are
    // ExcelJS (already split) and the React+charts vendor.
    chunkSizeWarningLimit: 800,
  },
})
