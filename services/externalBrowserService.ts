export interface CDPTarget {
    id: string;
    title: string;
    url: string;
    wsUrl: string;
}

let _connected = false;
let _targetId: string | null = null;
let _targetTitle: string | null = null;
let _captureW = 1024;
let _captureH = 768;

function apiBase() { return ''; }

async function api(path: string, options?: RequestInit): Promise<any> {
    const res = await fetch(`${apiBase()}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    return res.json();
}

export const externalBrowserService = {
    get connected() { return _connected; },
    get targetId() { return _targetId; },
    get targetTitle() { return _targetTitle; },

    setCaptureSize(w: number, h: number) {
        _captureW = w;
        _captureH = h;
    },

    async status(): Promise<{ connected: boolean; targetId: string | null; targetTitle: string | null }> {
        const data = await api('/api/cdp/status');
        _connected = data.connected;
        _targetId = data.targetId;
        _targetTitle = data.targetTitle;
        return data;
    },

    async connect(port = 9222): Promise<{ success: boolean; browser?: string; error?: string }> {
        const data = await api('/api/cdp/connect', {
            method: 'POST',
            body: JSON.stringify({ port }),
        });
        return data;
    },

    async getTargets(port = 9222): Promise<{ success: boolean; targets: CDPTarget[]; error?: string }> {
        return api(`/api/cdp/targets?port=${port}`);
    },

    async selectTarget(targetId: string, wsUrl: string, title?: string): Promise<{ success: boolean; error?: string; viewport?: any }> {
        const data = await api('/api/cdp/select', {
            method: 'POST',
            body: JSON.stringify({ targetId, wsUrl, title }),
        });
        if (data.success) {
            _connected = true;
            _targetId = targetId;
            _targetTitle = title || null;
        }
        return data;
    },

    async disconnect(): Promise<void> {
        await api('/api/cdp/disconnect', { method: 'POST' });
        _connected = false;
        _targetId = null;
        _targetTitle = null;
    },

    async click(nx: number, ny: number): Promise<string> {
        const data = await api('/api/cdp/click', {
            method: 'POST',
            body: JSON.stringify({ nx, ny, captureW: _captureW, captureH: _captureH }),
        });
        return data.success ? data.result : `Error: ${data.error}`;
    },

    async doubleClick(nx: number, ny: number): Promise<string> {
        const data = await api('/api/cdp/double_click', {
            method: 'POST',
            body: JSON.stringify({ nx, ny, captureW: _captureW, captureH: _captureH }),
        });
        return data.success ? data.result : `Error: ${data.error}`;
    },

    async rightClick(nx: number, ny: number): Promise<string> {
        const data = await api('/api/cdp/right_click', {
            method: 'POST',
            body: JSON.stringify({ nx, ny, captureW: _captureW, captureH: _captureH }),
        });
        return data.success ? data.result : `Error: ${data.error}`;
    },

    async hover(nx: number, ny: number): Promise<string> {
        const data = await api('/api/cdp/hover', {
            method: 'POST',
            body: JSON.stringify({ nx, ny, captureW: _captureW, captureH: _captureH }),
        });
        return data.success ? data.result : `Error: ${data.error}`;
    },

    async type(text: string): Promise<string> {
        const data = await api('/api/cdp/type', {
            method: 'POST',
            body: JSON.stringify({ text }),
        });
        return data.success ? data.result : `Error: ${data.error}`;
    },

    async pressKey(key: string): Promise<string> {
        const data = await api('/api/cdp/press_key', {
            method: 'POST',
            body: JSON.stringify({ key }),
        });
        return data.success ? data.result : `Error: ${data.error}`;
    },

    async scroll(dx: number, dy: number): Promise<string> {
        const data = await api('/api/cdp/scroll', {
            method: 'POST',
            body: JSON.stringify({ dx, dy }),
        });
        return data.success ? data.result : `Error: ${data.error}`;
    },

    async scrollTo(frac: number): Promise<string> {
        const data = await api('/api/cdp/scroll_to', {
            method: 'POST',
            body: JSON.stringify({ frac }),
        });
        return data.success ? data.result : `Error: ${data.error}`;
    },

    async navigate(url: string): Promise<string> {
        const data = await api('/api/cdp/navigate', {
            method: 'POST',
            body: JSON.stringify({ url }),
        });
        return data.success ? data.result : `Error: ${data.error}`;
    },

    async readContent(): Promise<{ success: boolean; title?: string; url?: string; content?: string; error?: string }> {
        return api('/api/cdp/content');
    },

    async readStructure(): Promise<string> {
        const data = await api('/api/cdp/structure');
        return data.success ? data.structure : `Error: ${data.error}`;
    },
};
