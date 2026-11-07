import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // Same-origin browser API; development-only proxy to Express 4000.
    server: { proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false } } },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});