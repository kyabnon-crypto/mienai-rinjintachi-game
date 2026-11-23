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
        hoshihakobi: resolve(__dirname, 'hoshihakobi.html'),
        tomerun: resolve(__dirname, 'tomerun.html'),
        kazoeru: resolve(__dirname, 'kazoeru.html'),
        tsumazuki: resolve(__dirname, 'tsumazuki.html'),
        henjiro: resolve(__dirname, 'henjiro.html'),
        nukumori: resolve(__dirname, 'nukumori.html'),
        wasuredama: resolve(__dirname, 'wasuredama.html'),
        susunomi: resolve(__dirname, 'susunomi.html'),
        tokitsugi: resolve(__dirname, 'tokitsugi.html'),
        namidabin: resolve(__dirname, 'namidabin.html'),
        kagemichi: resolve(__dirname, 'kagemichi.html'),
      },
    },
  },
});
