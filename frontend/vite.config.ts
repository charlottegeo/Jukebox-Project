import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname), 
  publicDir: 'public',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 8080,
    host: true,
    watch: {
      usePolling: !!process.env.CHOKIDAR_USEPOLLING,
    },
    allowedHosts: process.env.VITE_ALLOWED_HOSTS?.split(',') || ['http://localhost:8080'],
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      '/downloads': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },    
  },
  cacheDir: '/tmp/.vite',
});

