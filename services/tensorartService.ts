/**
 * Tensor Art OpenAPI client.
 *
 * API docs: https://openapi.tensor.art | https://openapi.tusiart.cn
 * Key prefixes: ak_tensor (global) → tensor.art,  ak_tusi (China) → tusiart.cn
 */

const API_HOSTS: Record<string, string> = {
    ak_tensor: 'https://openapi.tensor.art/openworks/v1',
    ak_tusi: 'https://openapi.tusiart.cn/openworks/v1',
};
const DEFAULT_BASE_URL = 'https://openapi.tensor.art/openworks/v1';

/** Determine the correct API base URL from the key prefix. */
function getBaseUrl(apiKey: string): string {
    for (const [prefix, url] of Object.entries(API_HOSTS)) {
        if (apiKey.startsWith(prefix)) return url;
    }
    return DEFAULT_BASE_URL;
}

/** Internal POST helper. */
async function apiPost<T = any>(
    path: string,
    body: Record<string, any>,
    apiKey: string,
): Promise<T> {
    const url = `${getBaseUrl(apiKey)}/${path}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Echo-Access-Key': apiKey,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { detail = await res.text(); } catch { /* ignore */ }
        throw new Error(`Tensor Art API error: ${detail}`);
    }
    return res.json();
}

// --- Public API ---

export interface TensorArtTool {
    name: string;
    description?: string;
    inputs: { name: string; type: string; description?: string }[];
    outputs: { type: string; description?: string }[];
    estimatedCost?: number;
    tags?: string[];
}

export interface TensorArtTask {
    taskId: string;
    status: string;
}

export interface TensorArtTaskResult {
    taskId: string;
    status: string;
    outputs?: { type: string; url?: string; data?: string }[];
    error?: string;
}

/** List all available generation tools/models. */
export async function listTools(apiKey: string): Promise<TensorArtTool[]> {
    const resp = await apiPost<any>('tool/list', {}, apiKey);
    if (resp.code !== '0') {
        throw new Error(`Failed to list tools: ${JSON.stringify(resp)}`);
    }
    return resp.data?.tools ?? [];
}

/** Create a generation task. Inputs is a positional array matching the tool's input schema. */
export async function createTask(
    apiKey: string,
    toolName: string,
    inputs: { type: string; value: any }[],
): Promise<TensorArtTask> {
    const resp = await apiPost<any>('task', { toolName, inputs }, apiKey);
    if (resp.code !== '0') {
        throw new Error(`Failed to create task: ${JSON.stringify(resp)}`);
    }
    const task = resp.data?.task;
    return { taskId: task.id, status: task.status };
}

/** Query a single task's status. */
export async function queryTask(
    apiKey: string,
    taskId: string,
): Promise<TensorArtTaskResult> {
    const resp = await apiPost<any>('task/query', { taskIds: [taskId] }, apiKey);
    if (resp.code !== '0') {
        throw new Error(`Failed to query task: ${JSON.stringify(resp)}`);
    }
    const task = resp.data?.tasks?.[0];
    if (!task) throw new Error(`Task ${taskId} not found`);
    return {
        taskId: task.id,
        status: task.status,
        outputs: task.outputs,
        error: task.errorReason,
    };
}

/** Poll a task until it reaches a terminal state, or until the timeout. */
export async function pollTask(
    apiKey: string,
    taskId: string,
    maxAttempts = 30,
    intervalMs = 3000,
): Promise<TensorArtTaskResult> {
    const TERMINAL = new Set(['FINISH', 'EXCEPTION', 'CANCELED']);
    for (let i = 1; i <= maxAttempts; i++) {
        const result = await queryTask(apiKey, taskId);
        if (TERMINAL.has(result.status)) return result;
        if (i < maxAttempts) await new Promise(r => setTimeout(r, intervalMs));
    }
    // Timeout — return the last known state
    return queryTask(apiKey, taskId);
}

/** Validate the API key by listing tools. */
export async function testConnection(apiKey: string): Promise<{ ok: boolean; message: string }> {
    try {
        const tools = await listTools(apiKey);
        return { ok: true, message: `Connected — ${tools.length} models available.` };
    } catch (e: any) {
        return { ok: false, message: e?.message || 'Connection failed.' };
    }
}
