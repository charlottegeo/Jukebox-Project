import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dotenv from 'dotenv'

dotenv.config()

export default defineConfig({
  server: {
    port: parseInt(process.env.PORT as string, 10) || 8080,
  },
  plugins: [react()],
})