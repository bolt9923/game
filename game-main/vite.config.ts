import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Tell Vite: telegraf aur Node built-ins sirf server ke liye hain,
    // browser bundle mein include mat karo
    optimizeDeps: {
      exclude: ['telegraf'],
    },
    build: {
      rollupOptions: {
        external: [
          'telegraf',
          'crypto',
          'http',
          'https',
          'url',
          'path',
          'fs',
          'fs/promises',
          'stream',
          'util',
          'net',
          'tls',
          'zlib',
          'os',
        ],
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
