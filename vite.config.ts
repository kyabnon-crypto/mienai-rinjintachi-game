import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        namidabin: resolve(__dirname, 'namidabin.html'),
        kagemichi: resolve(__dirname, 'kagemichi.html'),
      },
    },
  },
});
