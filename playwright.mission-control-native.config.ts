import { defineConfig } from '@playwright/test';

/**
 * E2E for the native Mission Control tab.
 *
 * Unlike the default config (vite preview on 4173), this suite needs BOTH
 * processes: Kollektiv's Express server on 7500 (which serves `dist/` and
 * reverse-proxies /mission-control/*) and the vendored Mission Control fork on
 * 3100. Both are production-built and started by Playwright's webServer array.
 *
 * Run: pnpm test:e2e:mc
 *
 * Prerequisite: mission-control/.env (gitignored) must exist with seeded
 * AUTH_USER/AUTH_PASS — the login spec reads those credentials and the
 * Mission Control build/start requires them. Ports 7500 and 3100 must be free
 * (no `pnpm dev:all` running), since reuseExistingServer is false.
 *
 * The Mission Control webServer builds with Turbopack (`next build`, Next 16's
 * default) rather than the fork's `pnpm build` (which forces `--webpack`): the
 * webpack file-glob walks the user's home directory and aborts on the legacy
 * Windows `Application Data` junction (EPERM). Turbopack compiles clean.
 */
export default defineConfig({
    testDir: './e2e',
    testMatch: 'mission-control-native.spec.ts',
    timeout: 120_000,
    retries: 0,
    // All five specs share the two booted servers and boot the app shell from a
    // clean IndexedDB; serializing workers keeps the shared-server E2E stable.
    workers: 1,
    use: {
        baseURL: 'http://127.0.0.1:7500',
        trace: 'retain-on-failure',
    },
    webServer: [
        {
            // Kollektiv Express host (serves dist + MC reverse proxy). Port 7500.
            command: 'pnpm build && pnpm start',
            url: 'http://127.0.0.1:7500',
            reuseExistingServer: false,
            timeout: 240_000,
            env: {
                PORT: '7500',
            },
        },
        {
            // Vendored Mission Control fork (Next.js). Port 3100.
            // Turbopack build: the fork's webpack build (pnpm build) globs the
            // home dir and EPERMs on the Windows `Application Data` junction.
            command: 'cd mission-control && npx next build && pnpm start',
            // /api/health returns 200 unauthenticated; /api/auth/login returns
            // 405 on GET, which Playwright's readiness check does not accept.
            url: 'http://127.0.0.1:3100/mission-control/api/health',
            reuseExistingServer: false,
            timeout: 240_000,
            env: {
                PORT: '3100',
                // Bypass the fork's NON-critical rate limiters (read/mutation).
                // This is the fork's own CI escape hatch (src/lib/rate-limit.ts):
                // MC_DISABLE_RATE_LIMIT only takes effect with
                // MISSION_CONTROL_TEST_MODE=1 because NODE_ENV is 'production'
                // under `next start`. The critical login limiter (5/min per IP)
                // is deliberately NOT bypassed by these — the spec stays under
                // it by replaying one shared admin session (see beforeAll in
                // mission-control-native.spec.ts).
                MC_DISABLE_RATE_LIMIT: '1',
                MISSION_CONTROL_TEST_MODE: '1',
            },
        },
    ],
});
