import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    plugins: [
      react(), 
      tailwindcss(),
      viteSingleFile(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: '/',
          name: 'Quantum Link',
          short_name: 'QuantumLink',
          description: 'Secure P2P file transfer and encrypted communication suite with QR-based handshaking.',
          theme_color: '#090d16',
          background_color: '#090d16',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      {
        name: 'download-html-plugin',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/QuantumLink.html') {
              try {
                console.log("Rebuilding for offline export...");
                require('child_process').execSync('npx vite build', { stdio: 'inherit' });
                // Also copy the file so it exists
                require('child_process').execSync('cp dist/index.html dist/QuantumLink.html', { stdio: 'inherit' });
              } catch (e) {
                console.error("Build failed:", e);
              }
              const file = path.resolve(__dirname, 'dist/QuantumLink.html');
              if (fs.existsSync(file)) {
                res.setHeader('Content-disposition', 'attachment; filename=QuantumLink.html');
                res.setHeader('Content-type', 'application/octet-stream');
                res.end(fs.readFileSync(file));
                return;
              } else {
                res.statusCode = 404;
                res.end('Please run "npm run build" to generate the standalone HTML first.');
                return;
              }
            }
            if (req.url === '/user/transfer.html') {
              try {
                console.log("Rebuilding transfer app...");
                require('child_process').execSync('npx vite build -c vite.transfer.config.ts', { stdio: 'inherit' });
              } catch(e) {
                console.error("Transfer Build failed:", e);
              }
              const file = path.resolve(__dirname, 'user/transfer.html');
              if (fs.existsSync(file)) {
                res.setHeader('Content-type', 'text/html');
                res.end(fs.readFileSync(file));
                return;
              } else {
                res.statusCode = 404;
                res.end('Not found');
                return;
              }
            }
            next();
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
