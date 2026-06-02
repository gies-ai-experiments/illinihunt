/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(process.env.ANALYZE === 'true' ? [visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    })] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/types/**',
        'src/main.tsx',
      ],
    },
  },
  build: {
    // esbuild minifier (Vite default) — terser was producing broken cross-chunk
    // re-exports for shadcn/ui components (e.g. `Export 'Avatar' is not defined`).
    minify: 'esbuild',
    chunkSizeWarningLimit: 600,
    sourcemap: false,
    // No manualChunks — Vite's automatic chunking handles shadcn/ui + Radix
    // re-export patterns cleanly. Manual splits broke when the avatar.tsx
    // wrapper ended up in one chunk while consumers were in another.
  },
})
