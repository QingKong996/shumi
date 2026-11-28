import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve('src/renderer/src')
    }
  },
  test: {
    clearMocks: true,
    include: ['src/main/**/*.{test,spec}.ts', 'src/renderer/src/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true
  }
})
