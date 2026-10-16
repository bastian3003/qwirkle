import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // In development the game server runs separately on port 3000.
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
});
