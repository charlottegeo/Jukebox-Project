import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname), 
  publicDir: 'public',
  plugins: [react()],
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 8080,
    host: true,
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: process.env.BACKEND_URL || 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },    
  },
});

