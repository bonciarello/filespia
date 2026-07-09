import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT) || 4600,
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT) || 4600,
  },
})
