import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin /api in dev: no CORS config needed on the server.
    proxy: { '/api': process.env.API_URL || 'http://localhost:3001' },
  },
});
