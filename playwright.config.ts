import { defineConfig } from '@playwright/test';

// E2E runs against a production build served by `vite preview` on 4173.
// NEVER point this at the dev server: a second dev instance collides with
// Vite's HMR websocket and reload-loops (see docs/ARCHITECTURE.md §13).
export default defineConfig({
    testDir: './e2e',
    timeout: 120_000,
    retries: 0,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'pnpm build && pnpm preview --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: false,
        timeout: 180_000,
    },
});
