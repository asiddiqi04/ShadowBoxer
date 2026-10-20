import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  appType: 'mpa', // No client routes: missing models/assets must remain 404s.
  plugins: [react(), tailwindcss()],
})
