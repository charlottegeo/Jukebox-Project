import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,  // Frontend port
    proxy: {
      // Proxy all HTTP API requests to the backend
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Proxy WebSocket connections to the backend
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,  // WebSocket proxying
      },
    },
  },
});
