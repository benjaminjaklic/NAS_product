import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/static/react/',
  build: {
    outDir: '../app/static/react',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.css')) {
            return 'css/[name][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/files': 'http://localhost:5000',
      '/auth': 'http://localhost:5000',
      '/settings': 'http://localhost:5000'
    }
  }
})
