import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // Base path for AI Studio
      base: '/',
      plugins: [
        react(),
      ],
      server: {
        host: true,  
        port: 3000,
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
          'Cross-Origin-Embedder-Policy': 'credentialless',
        },
        proxy: {
          '/ollama-local': {
            target: 'http://127.0.0.1:11434',
            changeOrigin: true,
            secure: false,
            rewrite: (path) => path.replace(/^\/ollama-local/, '')
          },
          '/google-api': {
            target: 'https://www.googleapis.com',
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/google-api/, ''),
            configure: (proxy, _options) => {
              proxy.on('proxyRes', (proxyRes, req, _res) => {
                if (proxyRes.headers.location) {
                  const origin = req.headers.referer || req.headers.origin || 'http://localhost:3000';
                  const originBase = new URL(origin).origin;
                  proxyRes.headers.location = proxyRes.headers.location.replace(
                    'https://www.googleapis.com',
                    originBase + '/google-api'
                  );
                }
              });
            }
          },
          '/proxy-remote': {
            target: 'http://127.0.0.1:11434',
            changeOrigin: true,
            secure: false,
            ws: true,
            timeout: 600000, 
            proxyTimeout: 600000,
            router: (req: any) => {
                let target = req.headers['x-target-url'];
                if (!target || typeof target !== 'string') return 'http://127.0.0.1:11434';
                return target.replace('localhost', '127.0.0.1');
            },
            rewrite: (path) => path.replace(/^\/proxy-remote/, ''),
            configure: (proxy, _options) => {
                proxy.on('error', (err, req: any, _res) => {
                    console.error('[Vite Proxy Error]', {
                        message: err.message,
                        code: (err as any).code,
                        target: req.headers['x-target-url'] || 'local-ollama'
                    });
                });
            }
          }
        }
      },
      optimizeDeps: {
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.YOUTUBE_CLIENT_ID': JSON.stringify(env.YOUTUBE_CLIENT_ID)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
    };
});
