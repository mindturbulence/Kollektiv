import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const env = { ...process.env, ...loadEnv(mode, '.', '') };
    return {
      // Base path for AI Studio
      base: '/',
      plugins: [
        react(),
        // Copy RNNoise WASM + VAD ONNX model + ONNX Runtime WASM for voice pipeline
        viteStaticCopy({
            targets: [
                {
                    // magick-wasm: './magick.wasm' export maps to the x86
                    // (32-bit wasm) binary — the one matching the ESM glue in
                    // dist/index.js that Vite bundles into convertWorker.
                    // x64 needs 158 imports; the glue provides only 122
                    // (verified via WebAssembly.Module.imports) — pairing the
                    // two fails at instantiate with LinkError import #122.
                    src: 'node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm',
                    dest: '',
                },
                {
                    // ffmpeg single-thread core (plan W2/P3): pinned as a
                    // dependency and static-copied — never fetched from a CDN
                    // at runtime (local-first: zero external requests).
                    // MUST be the ESM variant: @ffmpeg/ffmpeg 0.12 spawns a
                    // module-type worker, where importScripts is undefined,
                    // so it loads the core via dynamic import — the UMD build
                    // has no default export and fails with
                    // ERROR_IMPORT_FAILURE ("failed to import ffmpeg-core.js").
                    src: 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js',
                    dest: 'ffmpeg',
                },
                {
                    src: 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',
                    dest: 'ffmpeg',
                },
                {
                    src: 'node_modules/simple-rnnoise-wasm/dist/rnnoise.wasm',
                    dest: '',
                },
                {
                    src: 'node_modules/simple-rnnoise-wasm/dist/rnnoise.worklet.js',
                    dest: '',
                },
                // VAD ONNX model files
                {
                    src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx',
                    dest: '.',
                },
                {
                    src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx',
                    dest: '.',
                },
                // ONNX Runtime WASM files — removed ort-wasm-simd-threaded.wasm
                // because it doesn't exist in the current onnxruntime-web package
                // and the missing file caused vite-plugin-static-copy to throw,
                // which triggered a full-page HMR reload loop. The library loads
                // its WASM dynamically at runtime from its own node_modules path.
            ],
        }),
        {
          name: 'silence-ollama-proxy-errors',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              const host = req.headers.host || '';
              const isCloud = !host.includes('localhost') && !host.includes('127.0.0.1');
              if (!isCloud) return next();

              const url = req.url || '';
              
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
        strictPort: false,
        allowedHosts: ['host.docker.internal'],
        watch: {
          // When the vault is the project directory, verifyAndRepairFiles writes
          // JSON manifest files there; without this, chokidar sees those writes
          // as source changes and Vite issues a full-reload over HMR.
          ignored: ['**/*_manifest.json', '**/*_manifest.json.bak'],
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
                // Don't replace 127.0.0.1 with localhost since IPv4 is usually safer for local tools
                return target;
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
        include: ['react-markdown', 'remark-gfm']
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify(env.NODE_ENV || 'development'),
        // Never inline the Gemini key into a production bundle. Users supply it at
        // runtime via Setup (settings.geminiApiKey). Dev builds may read .env.
        'process.env.API_KEY': JSON.stringify(mode === 'production' ? '' : (env.GEMINI_API_KEY || '')),
        'process.env.GEMINI_API_KEY': JSON.stringify(mode === 'production' ? '' : (env.GEMINI_API_KEY || '')),
        'process.env.OPENAI_API_KEY': JSON.stringify(mode === 'production' ? '' : (env.OPENAI_API_KEY || '')),
        'process.env.ELEVENLABS_API_KEY': JSON.stringify(mode === 'production' ? '' : (env.ELEVENLABS_API_KEY || '')),
        'process.env.YOUTUBE_CLIENT_ID': JSON.stringify(env.YOUTUBE_CLIENT_ID || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // Vitest config — exclude Playwright E2E tests
      // @ts-ignore
test: {
    timeout: 20000,
    exclude: ['e2e/**', 'node_modules/**', '.claude/**', 'test-results/**'],
    environment: 'jsdom',
    setupFiles: [],
},
    };
});
