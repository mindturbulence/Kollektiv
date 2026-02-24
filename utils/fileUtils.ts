
import JSZip from 'jszip';
import { getHandle, setHandle } from './db';
import type { AuthContextType } from '../contexts/AuthContext';
import type { LLMSettings } from '../types';

// --- Interfaces and Types ---
interface IFileSystemManager {
    initialize(settings: LLMSettings, auth: AuthContextType): Promise<boolean>;
    saveFile(filePath: string, content: Blob): Promise<string>;
    readFile(filePath: string): Promise<string | null>;
    getFileAsBlob(filePath: string): Promise<Blob | null>;
    deleteFile(filePath: string): Promise<void>;
    listDirectoryContents(path: string): AsyncGenerator<FileSystemHandle>;
    reset(): Promise<void>;
    isDirectorySelected(): boolean;
    selectAndSetAppDataDirectory(): Promise<FileSystemDirectoryHandle | null>;
    requestExistingPermission(): Promise<boolean>;
    calculateTotalSize(): Promise<number>;
}

// --- Local File System Implementation ---
class LocalFileSystemManager implements IFileSystemManager {
    private appDirHandle: FileSystemDirectoryHandle | null = null;
    public appDirectoryName: string | null = null;
    private isInitialized: boolean = false;
    private initPromise: Promise<boolean> | null = null;

    private async verifyPermission(handle: FileSystemDirectoryHandle, interactive: boolean = false): Promise<boolean> {
        const options = { mode: 'readwrite' as const };
        
        try {
            if ((await (handle as any).queryPermission(options)) === 'granted') {
                return true;
            }
            
            if (interactive) {
                if ((await (handle as any).requestPermission(options)) === 'granted') {
                    return true;
                }
            }
        } catch (e) {
            console.warn("Permission verification failure:", e);
        }
        
        return false;
    }

    async initialize(_settings: LLMSettings, _auth: AuthContextType): Promise<boolean> {
        if (this.isInitialized) return true;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                const handle = await getHandle<FileSystemDirectoryHandle>('app-data-dir');
                if (handle && (await this.verifyPermission(handle, false))) {
                    this.appDirHandle = handle;
                    this.appDirectoryName = handle.name;
                    this.isInitialized = true;
                    return true;
                }
            } catch (error) {
                console.error("Error during LocalFileSystemManager init:", error);
            } finally {
                this.initPromise = null;
            }
            
            this.isInitialized = false;
            return false;
        })();

        return this.initPromise;
    }

    public async requestExistingPermission(): Promise<boolean> {
        try {
            const handle = await getHandle<FileSystemDirectoryHandle>('app-data-dir');
            if (handle && (await this.verifyPermission(handle, true))) {
                this.appDirHandle = handle;
                this.appDirectoryName = handle.name;
                this.isInitialized = true;
                return true;
            }
        } catch (error) {
            console.error("Error requesting existing permission:", error);
        }
        return false;
    }

    public isDirectorySelected(): boolean {
        return this.isInitialized && !!this.appDirHandle;
    }

    public async selectAndSetAppDataDirectory(): Promise<FileSystemDirectoryHandle | null> {
        if (typeof window === 'undefined') return null;

        const isFirefox = (window as any).navigator?.userAgent.toLowerCase().includes('firefox');
        
        if (!('showDirectoryPicker' in window)) {
            if (isFirefox) {
                (window as any).alert('File System Access is not supported in Firefox. Please use a Chromium-based browser like Chrome or Edge.');
            } else {
                (window as any).alert('Your browser does not support the File System Access API.');
            }
            return null;
        }

        /* 
        // Removed for AI Studio Preview compatibility
        if ((window as any).self !== (window as any).top) {
            (window as any).alert("This application must be opened in its own browser tab to access the local file system.");
            return null;
        }
        */
        
        try {
            const handle = await (window as any).showDirectoryPicker({ id: 'kollektiv-app-data-dir', mode: 'readwrite' });
            if (await this.verifyPermission(handle, true)) {
                await setHandle('app-data-dir', handle);
                this.appDirHandle = handle;
                this.appDirectoryName = handle.name;
                this.isInitialized = true;
                return handle;
            }
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
                console.error("Error picking directory:", err);
            }
        }
        return null;
    }

    private async getHandle(): Promise<FileSystemDirectoryHandle> {
        if (!this.isInitialized || !this.appDirHandle) {
            throw new Error("Local File System Manager is not initialized.");
        }
        return this.appDirHandle;
    }
    
    public async saveFile(filePath: string, content: Blob): Promise<string> {
        const rootHandle = await this.getHandle();
        const segments = filePath.replace(/\\/g, '/').split('/');
        const fileName = segments.pop();
        if (!fileName) throw new Error("Invalid file path provided.");

        let currentHandle = rootHandle;
        for (const segment of segments) {
            if (segment === '') continue;
            currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
        }

        const fileHandle = await currentHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        
        return filePath;
    }

    public async readFile(filePath: string): Promise<string | null> {
        const blob = await this.getFileAsBlob(filePath);
        return blob ? await blob.text() : null;
    }
    
    public async getFileAsBlob(filePath: string): Promise<Blob | null> {
        try {
            const rootHandle = await this.getHandle();
            const segments = filePath.replace(/\\/g, '/').split('/');
            const fileName = segments.pop();
            if (!fileName) return null;

            let currentHandle = rootHandle;
            for (const segment of segments) {
                if (segment === '') continue;
                currentHandle = await currentHandle.getDirectoryHandle(segment);
            }
            const fileHandle = await currentHandle.getFileHandle(fileName);
            return await fileHandle.getFile();
        } catch (error) {
             return null;
        }
    }
    
    public async deleteFile(filePath: string): Promise<void> {
        try {
            const rootHandle = await this.getHandle();
            const segments = filePath.replace(/\\/g, '/').split('/');
            const fileName = segments.pop();
            if (!fileName) return;

            let currentHandle = rootHandle;
            for (const segment of segments) {
                if (segment === '') continue;
                currentHandle = await currentHandle.getDirectoryHandle(segment);
            }
            await currentHandle.removeEntry(fileName);
        } catch (error) {}
    }

    public async reset(): Promise<void> {
        const handle = await this.getHandle();
        for await (const key of (handle as any).keys()) {
            await handle.removeEntry(key, { recursive: true });
        }
    }
    
    public async* listDirectoryContents(path: string): AsyncGenerator<FileSystemHandle> {
        const rootHandle = await this.getHandle();
        let currentHandle = rootHandle;
        if (path) {
            const segments = path.split('/');
            try {
                for (const segment of segments) {
                    if (segment === '') continue;
                    currentHandle = await currentHandle.getDirectoryHandle(segment);
                }
            } catch (e) { return; }
        }
        for await (const handle of (currentHandle as any).values()) {
            yield handle;
        }
    }

    public async calculateTotalSize(): Promise<number> {
        if (!this.appDirHandle) return 0;
        
        const getSizeRecursive = async (handle: FileSystemDirectoryHandle): Promise<number> => {
            let size = 0;
            for await (const entry of (handle as any).values()) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    size += file.size;
                } else if (entry.kind === 'directory') {
                    size += await getSizeRecursive(entry);
                }
            }
            return size;
        };

        try {
            return await getSizeRecursive(this.appDirHandle);
        } catch (e) {
            console.error("Error calculating storage size:", e);
            return 0;
        }
    }
}

export const fileSystemManager = new LocalFileSystemManager();

// --- Utility Functions ---

export const fileToBase64 = (file: File | Blob, getRawData: boolean = false): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        const result = reader.result as string;
        resolve(getRawData ? result.split(',')[1] : result);
    };
    reader.onerror = error => reject(error);
  });
};

export const createZipAndDownload = async (files: { name: string, content: string | Blob | ArrayBuffer }[], zipFileName: string): Promise<void> => {
    const zip = new JSZip();
    files.forEach(file => { zip.file(file.name, file.content); });
    const blob = await zip.generateAsync({ type: "blob" });
    const link = (window as any).document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = zipFileName;
    link.click();
};

export const readZip = async (zipFile: File): Promise<JSZip> => {
    return await JSZip.loadAsync(zipFile);
};

export async function extractPositivePrompt(imageBlob: Blob): Promise<string | null> {
    const meta = await extractFullMetadata(imageBlob);
    return meta?.prompt || null;
}

export interface ParsedMetadata {
    prompt: string;
    negativePrompt: string;
    params: Record<string, string>;
    raw: string;
    workflow?: string;
}

/**
 * Traverses ComfyUI execution graphs to find CLIPTextEncode nodes.
 */
function parseComfyGraph(graph: any): { prompt: string; negativePrompt: string } {
    let positive = '';
    let negative = '';

    try {
        const nodes = Object.values(graph);
        const textNodes = nodes.filter((n: any) => 
            n.class_type === 'CLIPTextEncode' || 
            (n.inputs && typeof n.inputs.text === 'string')
        );

        textNodes.forEach((node: any) => {
            const text = node.inputs?.text || '';
            const lowerText = text.toLowerCase();
            if (!text || text.length < 2) return;

            // Common indicators for negative prompts
            const negKeywords = ['bad quality', 'blurry', 'lowres', 'watermark', 'ugly', 'text'];
            const isNegative = negKeywords.some(kw => lowerText.includes(kw));
            
            if (isNegative) {
                if (!negative) negative = text;
            } else {
                if (!positive || text.length > positive.length) positive = text;
            }
        });
    } catch (e) {}

    return { prompt: positive, negativePrompt: negative };
}

export async function extractFullMetadata(imageBlob: Blob): Promise<ParsedMetadata | null> {
    if (!imageBlob || !imageBlob.type.startsWith('image/')) return null;

    try {
        const text = await imageBlob.text(); 
        
        // 1. Automatic1111 / Standard PNG Info
        const parametersKeyword = 'parameters';
        const paramsIndex = text.indexOf(parametersKeyword);
        if (paramsIndex !== -1) {
            let block = text.substring(paramsIndex + parametersKeyword.length)
                            .replace(/^[\s\x00-\x1F]+/, ''); // Clean binary junk
            
            const parts = block.split('\nNegative prompt: ');
            let prompt = '', negativePrompt = '', rest = '';

            if (parts.length > 1) {
                prompt = parts[0].trim();
                const subParts = parts[1].split('\nSteps: ');
                negativePrompt = subParts[0].trim();
                if (subParts.length > 1) rest = 'Steps: ' + subParts[1];
            } else {
                const subParts = block.split('\nSteps: ');
                prompt = subParts[0].trim();
                if (subParts.length > 1) rest = 'Steps: ' + subParts[1];
                else if (block.length < 10000) prompt = block.trim();
            }

            const params: Record<string, string> = {};
            if (rest) {
                rest.split(', ').forEach(pair => {
                    const [k, ...v] = pair.split(': ');
                    if (k) params[k.trim()] = v.join(': ').trim();
                });
            }
            return { prompt, negativePrompt, params, raw: block };
        }

        // 2. ComfyUI / JSON Based
        const findJsonByAnyKey = (keys: string[]): { data: any, key: string } | null => {
            for (const key of keys) {
                const searchStr = `"${key}":`;
                const keyIndex = text.indexOf(searchStr);
                if (keyIndex === -1) continue;
                
                const start = text.indexOf('{', keyIndex);
                if (start === -1) continue;

                let count = 0, end = -1;
                for (let i = start; i < text.length; i++) {
                    if (text[i] === '{') count++;
                    if (text[i] === '}') count--;
                    if (count === 0) { end = i; break; }
                }
                
                if (end !== -1) {
                    try {
                        return { data: JSON.parse(text.substring(start, end + 1)), key };
                    } catch (e) {}
                }
            }
            return null;
        };

        const promptResult = findJsonByAnyKey(['prompt', 'all_prompts']);
        const workflowResult = findJsonByAnyKey(['workflow']);

        if (promptResult || workflowResult) {
            let prompt = '', negativePrompt = '', rawText = '';
            let params: Record<string, string> = { "Engine": "ComfyUI/JSON" };

            if (promptResult) {
                if (typeof promptResult.data === 'object') {
                    const parsed = parseComfyGraph(promptResult.data);
                    prompt = parsed.prompt;
                    negativePrompt = parsed.negativePrompt;
                } else if (typeof promptResult.data === 'string') {
                    prompt = promptResult.data;
                }
                rawText = JSON.stringify(promptResult.data, null, 2);
            }

            const workflowStr = workflowResult ? JSON.stringify(workflowResult.data, null, 2) : undefined;
            if (workflowResult && !prompt) {
                const parsed = parseComfyGraph(workflowResult.data);
                prompt = parsed.prompt;
                negativePrompt = parsed.negativePrompt;
            }

            return {
                prompt: prompt || (workflowStr ? 'Workflow found (No text nodes detected).' : 'Chunk found but prompt extraction failed.'),
                negativePrompt,
                params,
                raw: rawText || (workflowStr ? 'Workflow manifest identified.' : ''),
                workflow: workflowStr
            };
        }

        // 3. Fallback: Large JSON block
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            try {
                const json = JSON.parse(text.substring(firstBrace, lastBrace + 1));
                if (json.prompt || json.all_prompts || json.workflow) {
                    return {
                        prompt: typeof json.prompt === 'string' ? json.prompt : (Array.isArray(json.all_prompts) ? json.all_prompts[0] : ''),
                        negativePrompt: json.negative_prompt || '',
                        params: { "Source": "Unstructured JSON" },
                        raw: JSON.stringify(json, null, 2),
                        workflow: json.workflow ? JSON.stringify(json.workflow, null, 2) : undefined
                    };
                }
            } catch (e) {}
        }

        return null;
    } catch (e) {
        return null;
    }
}
