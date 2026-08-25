import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    root: 'src/transfer',
    build: {
      outDir: '../../user',
      emptyOutDir: false,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/transfer/transfer.html'),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      viteSingleFile(),
      {
        name: 'replace-module-script',
        enforce: 'post',
        transformIndexHtml(html: string) {
          return html.replace(/<script type="module" crossorigin/g, '<script defer');
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'motion/react': path.resolve(__dirname, 'src/transfer/motion-mock.tsx')
      },
    },
  };
});
