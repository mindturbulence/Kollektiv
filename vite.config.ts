import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = { ...process.env, ...loadEnv(mode, '.', '') };
    return {
      // Base path for AI Studio
      base: '/',
      plugins: [
        react(),
        {
          name: 'silence-ollama-proxy-errors',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              const host = req.headers.host || '';
              const isCloud = !host.includes('localhost') && !host.includes('127.0.0.1');
              if (!isCloud) return next();

              const url = req.url || '';
              
              // Intercept local Ollama requests
              if (url.startsWith('/ollama-local')) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Local Ollama unreachable in cloud', code: 'ECONNREFUSED_SILENT' }));
                return;
              }

              // Intercept remote proxy requests targeting local addresses
              if (url.startsWith('/proxy-remote')) {
                const target = req.headers['x-target-url'];
                const isLocal = !target || (typeof target === 'string' && (target.includes('localhost') || target.includes('127.0.0.1')));
                
                if (isLocal) {
                    res.statusCode = 502;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Local target unreachable in cloud', code: 'ECONNREFUSED_SILENT' }));
                    return;
                }
              }
              
              next();
            });
          }
        }
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
            rewrite: (path) => path.replace(/^\/ollama-local/, ''),
            configure: (proxy, _options) => {
                process.nextTick(() => {
                    proxy.removeAllListeners('error');
                    proxy.on('error', (err, _req: any, res: any) => {
                        if ((err as any).code === 'ECONNREFUSED') {
                            if (res && !res.writableEnded && typeof res.writeHead === 'function') {
                                res.writeHead(502, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Local Ollama unreachable', code: 'ECONNREFUSED' }));
                            }
                            return;
                        }
                        console.error('[Proxy Error: Local]', err.message);
                    });
                });
            }
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
                process.nextTick(() => {
                    proxy.removeAllListeners('error');
                    proxy.on('error', (err, _req: any, res: any) => {
                        if ((err as any).code === 'ECONNREFUSED') {
                            if (res && !res.writableEnded && typeof res.writeHead === 'function') {
                                res.writeHead(502, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Service Unavailable', code: 'ECONNREFUSED' }));
                            }
                            return;
                        }
                        console.error('[Proxy Error]', err.message);
                    });
                });
            }
          }
        }
      },
      optimizeDeps: {
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
        include: ['react-markdown', 'remark-gfm', 'vfile']
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
