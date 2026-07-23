/**
 * Chrome Auto-Launcher
 *
 * Discovers a Chrome/Chromium installation on the current platform,
 * spawns it with `--remote-debugging-port`, and manages cleanup.
 *
 * Port auto-detection: tries 9222–9232, picks the first free port.
 * Process cleanup: kills the Chrome child process on server shutdown.
 */

import { spawn, execSync, type ChildProcess } from 'child_process';
import { createServer as createTcpServer } from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface ChromeLaunchResult {
    success: boolean;
    port: number;
    pid?: number;
    exe?: string;
    error?: string;
}

/** Default debug port range to scan. */
const PORT_START = 9222;
const PORT_END = 9232;

/**
 * Check if a TCP port is available (not in use).
 */
function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = createTcpServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port, '127.0.0.1');
    });
}

/**
 * Find the Chrome or Chromium executable path for the current platform.
 * Returns null if not found.
 */
function findChromeExe(): string | null {
    const platform = os.platform();

    if (platform === 'win32') {
        const candidates: string[] = [
            // ─── Google Chrome ────────────────────────────
            process.env.LOCALAPPDATA
                ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
                : '',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',

            // ─── Chromium ─────────────────────────────────
            process.env.LOCALAPPDATA
                ? path.join(process.env.LOCALAPPDATA, 'Chromium', 'Application', 'chrome.exe')
                : '',

            // ─── Brave ────────────────────────────────────
            process.env.LOCALAPPDATA
                ? path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
                : '',
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',

            // ─── Microsoft Edge (Chromium) ────────────────
            process.env.LOCALAPPDATA
                ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
                : '',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',

            // ─── Vivaldi (Chromium) ───────────────────────
            process.env.LOCALAPPDATA
                ? path.join(process.env.LOCALAPPDATA, 'Vivaldi', 'Application', 'vivaldi.exe')
                : '',
            'C:\\Program Files\\Vivaldi\\Application\\vivaldi.exe',

            // ─── Opera (Chromium-based since v15) ─────────
            process.env.LOCALAPPDATA
                ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Opera', 'opera.exe')
                : '',
            'C:\\Program Files\\Opera\\opera.exe',
        ];
        for (const p of candidates) {
            if (p && fs.existsSync(p)) return p;
        }
        return null;
    }

    if (platform === 'darwin') {
        const candidates: string[] = [
            // ─── Google Chrome ────────────────────────────
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),

            // ─── Chromium ─────────────────────────────────
            '/Applications/Chromium.app/Contents/MacOS/Chromium',

            // ─── Brave ────────────────────────────────────
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',

            // ─── Microsoft Edge (Chromium) ────────────────
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',

            // ─── Vivaldi (Chromium) ───────────────────────
            '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi',

            // ─── Opera (Chromium-based since v15) ─────────
            '/Applications/Opera.app/Contents/MacOS/Opera',
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) return p;
        }
        return null;
    }

    // Linux — uses `which` to find the binary in PATH
    const linuxCandidates: string[] = [
        'google-chrome',
        'google-chrome-stable',
        'chromium-browser',
        'chromium',
        'brave-browser',
        'microsoft-edge',
        'vivaldi',
        'opera',
    ];
    for (const name of linuxCandidates) {
        try {
            const resolved = execSync(`which ${name}`, { encoding: 'utf8' }).trim();
            if (resolved) return resolved;
        } catch {
            // not found
        }
    }
    return null;
}

export class ChromeLauncher {
    private proc: ChildProcess | null = null;
    private _port: number | null = null;

    /** The port Chrome was launched on. null if not launched. */
    get port(): number | null { return this._port; }

    /** Whether a Chrome process was spawned by this launcher. */
    get isRunning(): boolean {
        return this.proc !== null && this.proc.exitCode === null;
    }

    /**
     * Find and launch Chrome with remote debugging enabled.
     *
     * @param preferredPort  Starting port (default 9222). Will scan upward until a free port is found.
     * @param userDataDir    Optional custom user-data-dir. If omitted, uses a temp dir.
     */
    async launch(preferredPort = PORT_START, userDataDir?: string): Promise<ChromeLaunchResult> {
        if (this.isRunning) {
            return {
                success: true,
                port: this._port!,
                pid: this.proc!.pid,
                exe: (this.proc as any).spawnfile,
                error: 'Chrome is already running.',
            };
        }

        const exe = findChromeExe();
        if (!exe) {
            return {
                success: false,
                port: preferredPort,
                error: `No Chrome/Chromium installation found. Install Google Chrome, or start it manually with --remote-debugging-port=${preferredPort}.`,
            };
        }

        // Find a free port
        let port = preferredPort;
        let found = false;
        for (let p = preferredPort; p <= PORT_END; p++) {
            if (await isPortAvailable(p)) {
                port = p;
                found = true;
                break;
            }
        }
        if (!found) {
            return {
                success: false,
                port: preferredPort,
                error: `All ports ${preferredPort}-${PORT_END} are in use. Close some applications or start Chrome manually.`,
            };
        }

        // Create a temp user-data-dir if none provided
        const dataDir = userDataDir || path.join(os.tmpdir(), 'kollektiv-chrome-debug');

        if (!fs.existsSync(dataDir)) {
            try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
        }

        const args = [
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${dataDir}`,
            '--no-first-run',
            '--no-default-browser-check',
            // Disable features that interfere with headless-like automation
            '--disable-extensions',
            '--disable-sync',
            '--disable-translate',
            '--disable-gpu',
            '--hide-crash-restore-bubble',
        ];

        return new Promise((resolve) => {
            try {
                const child = spawn(exe, args, {
                    stdio: ['ignore', 'pipe', 'pipe'],
                    detached: false,
                    // Windows: avoid showing a console window for Chrome
                    ...(os.platform() === 'win32' ? { windowsHide: true } : {}),
                });

                // Log any stderr output (Chrome writes diagnostic info here)
                child.stderr?.on('data', (data: Buffer) => {
                    const msg = data.toString().trim();
                    if (msg) console.debug(`[Chrome Launcher] ${msg}`);
                });

                child.stdout?.on('data', (data: Buffer) => {
                    const msg = data.toString().trim();
                    if (msg) console.debug(`[Chrome Launcher] ${msg}`);
                });

                let settled = false;

                const onError = (err: Error) => {
                    if (settled) return;
                    settled = true;
                    this.proc = null;
                    resolve({
                        success: false,
                        port,
                        error: `Failed to launch Chrome: ${err.message}`,
                    });
                };

                child.on('error', onError);

                child.on('exit', (code, signal) => {
                    console.log(`[Chrome Launcher] exited with code=${code} signal=${signal}`);
                    this.proc = null;
                    if (!settled) {
                        settled = true;
                        resolve({
                            success: false,
                            port,
                            error: `Chrome exited unexpectedly (code ${code}, signal ${signal})`,
                            exe,
                        });
                    }
                });

                // Give Chrome time to initialize, then consider it launched.
                // The endpoint's polling loop (up to 15s) independently verifies
                // CDP reachability, so a generous delay here is safe — it avoids
                // prematurely declaring success before Chrome has opened its port.
                setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    this.proc = child;
                    this._port = port;
                    console.log(`[Chrome Launcher] Launched ${exe} on port ${port} (pid ${child.pid})`);
                    resolve({
                        success: true,
                        port,
                        pid: child.pid,
                        exe,
                    });
                }, 5000);
            } catch (err: any) {
                resolve({
                    success: false,
                    port,
                    error: `Failed to spawn Chrome: ${err.message}`,
                });
            }
        });
    }

    /**
     * Kill the Chrome child process.
     * On Windows uses taskkill /T /F for the process tree.
     * On Unix uses SIGTERM then SIGKILL after 3s.
     */
    kill(): void {
        const proc = this.proc;
        if (!proc || proc.exitCode !== null) {
            this.proc = null;
            return;
        }

        const pid = proc.pid;
        console.log(`[Chrome Launcher] Killing Chrome (pid ${pid})...`);

        if (os.platform() === 'win32') {
            // taskkill /T kills the entire process tree
            try {
                spawn('taskkill', ['/T', '/F', '/PID', String(pid)], {
                    stdio: 'ignore',
                    windowsHide: true,
                });
            } catch (err) {
                console.error('[Chrome Launcher] taskkill failed:', err);
                proc.kill('SIGKILL');
            }
        } else {
            proc.kill('SIGTERM');
            // Force kill after 3s if it didn't exit
            setTimeout(() => {
                try {
                    if (proc.exitCode === null) proc.kill('SIGKILL');
                } catch {}
            }, 3000);
        }

        this.proc = null;
        this._port = null;
    }
}

/** Singleton instance used by the server. */
export const chromeLauncher = new ChromeLauncher();
