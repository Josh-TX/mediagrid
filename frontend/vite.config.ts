/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: '../backend/web/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/media': 'http://localhost:8080',
      '/thumbnail': 'http://localhost:8080',
      '/highlight': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
  },
})
