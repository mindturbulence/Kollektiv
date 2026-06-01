
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

// --- Helper Classes for GDrive Integration ---
class DriveDirectoryHandle {
    kind = 'directory' as const;
    name: string;
    private driveId: string;
    public fullPath: string;
    private manager: any;

    constructor(name: string, driveId: string, fullPath: string, manager: any) {
        this.name = name;
        this.driveId = driveId;
        this.fullPath = fullPath;
        this.manager = manager;
    }

    async* values(): AsyncGenerator<any> {
        const q = `'${this.driveId}' in parents and trashed = false`;
        const url = `/google-api/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${this.manager.accessToken}` }
        });
        if (!res.ok) return;

        const data = await res.json();
        const files = data.files || [];

        for (const file of files) {
            const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
            const childPath = this.fullPath ? `${this.fullPath}/${file.name}` : file.name;
            this.manager.pathCache.set(childPath, { id: file.id, mimeType: file.mimeType });

            if (isFolder) {
                yield new DriveDirectoryHandle(file.name, file.id, childPath, this.manager);
            } else {
                yield new DriveFileHandle(file.name, file.id, childPath, this.manager);
            }
        }
    }
}

class DriveFileHandle {
    kind = 'file' as const;
    name: string;
    private driveId: string;
    public fullPath: string;
    private manager: any;

    constructor(name: string, driveId: string, fullPath: string, manager: any) {
        this.name = name;
        this.driveId = driveId;
        this.fullPath = fullPath;
        this.manager = manager;
    }

    async getFile(): Promise<Blob> {
        const downloadUrl = `/google-api/drive/v3/files/${this.driveId}?alt=media`;
        const res = await fetch(downloadUrl, {
            headers: { 'Authorization': `Bearer ${this.manager.accessToken}` }
        });
        if (!res.ok) {
            throw new Error(`Failed to download GDrive file: ${this.name}`);
        }
        const blob = await res.blob();
        return blob;
    }
}

// --- Local File System Implementation ---
class LocalFileSystemManager implements IFileSystemManager {
    private appDirHandle: FileSystemDirectoryHandle | null = null;
    public appDirectoryName: string | null = null;
    private isInitialized: boolean = false;
    private initPromise: Promise<boolean> | null = null;

    // Google Drive integration state
    public storageProvider: 'local' | 'drive' = 'local';
    public accessToken: string | null = null;
    public rootFolderId: string | null = null;
    public pathCache: Map<string, { id: string; mimeType: string }> = new Map();
    public lastError: string | null = null;

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

    private async extractGoogleError(res: Response): Promise<string> {
        try {
            const txt = await res.text();
            try {
                const parsed = JSON.parse(txt);
                if (parsed?.error?.message) {
                    return `${parsed.error.message} (Status: ${res.status})`;
                }
            } catch (e) {}
            return `Status ${res.status}: ${txt || res.statusText}`;
        } catch (e) {
            return `Status ${res.status} (${res.statusText})`;
        }
    }

    private async ensureRootFolder(): Promise<void> {
        if (!this.accessToken) {
            throw new Error("No Google access token configured for Google Drive.");
        }

        const q = "(name = 'Kollektiv' or name = 'kollektiv' or name = 'KOLLEKTIV') and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
        const searchUrl = `/google-api/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
        const res = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${this.accessToken}` }
        });

        if (!res.ok) {
            const details = await this.extractGoogleError(res);
            throw new Error(`Failed to query Google Drive root folder: ${details}`);
        }

        const data = await res.json();
        const folders = data.files || [];

        if (folders.length > 0) {
            this.rootFolderId = folders[0].id;
        } else {
            const createRes = await fetch(`/google-api/drive/v3/files`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: 'Kollektiv',
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: ['root']
                })
            });

            if (!createRes.ok) {
                const details = await this.extractGoogleError(createRes);
                throw new Error(`Failed to create Kollektiv root folder in Google Drive: ${details}`);
            }

            const newFolder = await createRes.json();
            this.rootFolderId = newFolder.id;
        }

        this.pathCache.clear();

        // Prefetch root folder children into cache
        if (this.rootFolderId) {
            try {
                const qRoot = `'${this.rootFolderId}' in parents and trashed = false`;
                const qUrl = `/google-api/drive/v3/files?q=${encodeURIComponent(qRoot)}&fields=files(id,name,mimeType)&pageSize=1000`;
                const rootRes = await fetch(qUrl, {
                    headers: { 'Authorization': `Bearer ${this.accessToken}` }
                });
                if (rootRes.ok) {
                    const rootData = await rootRes.json();
                    for (const f of (rootData.files || [])) {
                        this.pathCache.set(f.name, { id: f.id, mimeType: f.mimeType });
                    }
                }
            } catch (e) {
                console.warn("Failed to prefill root cache:", e);
            }
        }
    }

    private async resolvePath(filePath: string, createIfMissing: boolean = false): Promise<string | null> {
        if (!this.rootFolderId) {
            await this.ensureRootFolder();
        }
        if (!this.rootFolderId) return null;

        const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (cleanPath === '') return this.rootFolderId;

        if (this.pathCache.has(cleanPath)) {
            return this.pathCache.get(cleanPath)!.id;
        }

        const segments = cleanPath.split('/');
        let currentParentId = this.rootFolderId;
        let currentPath = '';

        for (let i = 0; i < segments.length; i++) {
            const name = segments[i];
            if (name === '') continue;
            
            currentPath = currentPath ? `${currentPath}/${name}` : name;
            const isLast = (i === segments.length - 1);
            const mimeTypeFilter = isLast ? "" : " and mimeType = 'application/vnd.google-apps.folder'";

            if (this.pathCache.has(currentPath)) {
                currentParentId = this.pathCache.get(currentPath)!.id;
                continue;
            }

            const q = `name = '${name}' and '${currentParentId}' in parents and trashed = false${mimeTypeFilter}`;
            const url = `/google-api/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });

            if (!res.ok) {
                const details = await this.extractGoogleError(res);
                throw new Error(`GDrive resolve path segment failed: ${details}`);
            }

            const data = await res.json();
            const files = data.files || [];

            if (files.length > 0) {
                currentParentId = files[0].id;
                this.pathCache.set(currentPath, { id: files[0].id, mimeType: files[0].mimeType });
            } else {
                if (createIfMissing) {
                    const isFolder = !isLast;
                    const creationBody = {
                        name: name,
                        parents: [currentParentId],
                        mimeType: isFolder ? 'application/vnd.google-apps.folder' : undefined
                    };
                    const createRes = await fetch(`/google-api/drive/v3/files`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(creationBody)
                    });
                    if (!createRes.ok) {
                        const details = await this.extractGoogleError(createRes);
                        throw new Error(`GDrive failed to create ${name}: ${details}`);
                    }
                    const newFile = await createRes.json();
                    currentParentId = newFile.id;
                    this.pathCache.set(currentPath, { 
                        id: newFile.id, 
                        mimeType: isFolder ? 'application/vnd.google-apps.folder' : 'application/octet-stream' 
                    });
                } else {
                    return null;
                }
            }
        }

        return currentParentId;
    }

    async initialize(settings: LLMSettings, _auth: AuthContextType): Promise<boolean> {
        this.lastError = null;
        this.storageProvider = settings.storageProvider || 'local';
        this.accessToken = settings.googleIdentity?.isConnected ? (settings.googleIdentity.accessToken || null) : null;

        if (this.storageProvider === 'drive') {
            if (!this.accessToken) {
                this.lastError = "Google Client access token is missing. Please reconnect.";
                this.isInitialized = false;
                return false;
            }
            try {
                await this.ensureRootFolder();
                this.appDirectoryName = "Google Drive (Kollektiv)";
                this.isInitialized = true;
                return true;
            } catch (e: any) {
                console.error("Failed to initialize Google Drive storage:", e);
                this.lastError = e?.message || String(e);
                this.isInitialized = false;
                return false;
            }
        }

        if (this.isInitialized && this.appDirHandle) return true;
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
        if (this.storageProvider === 'drive') {
            return this.isInitialized && !!this.rootFolderId;
        }

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
        if (this.storageProvider === 'drive') {
            return this.isInitialized && !!this.rootFolderId;
        }
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
        
        try {
            const handle = await (window as any).showDirectoryPicker({ id: 'kollektiv-app-data-dir', mode: 'readwrite' });
            if (await this.verifyPermission(handle, true)) {
                await setHandle('app-data-dir', handle);
                this.appDirHandle = handle;
                this.appDirectoryName = handle.name;
                this.isInitialized = true;
                this.storageProvider = 'local';
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
        if (this.storageProvider === 'drive') {
            try {
                if (!this.accessToken) throw new Error("Google access token missing.");
                const fileId = await this.resolvePath(filePath, true);
                if (!fileId) throw new Error(`Could not resolve or create Google Drive file at: ${filePath}`);

                const uploadUrl = `/google-api/upload/drive/v3/files/${fileId}?uploadType=media`;
                const res = await fetch(uploadUrl, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': content.type || 'application/octet-stream'
                    },
                    body: content
                });

                if (!res.ok) {
                    throw new Error(`Failed to upload content to files/${fileId}: ${res.statusText}`);
                }

                if (typeof caches !== 'undefined') {
                    try {
                        const cache = await caches.open('kollektiv-drive-cache');
                        await cache.delete(`/google-api/drive/v3/files/${fileId}?alt=media`);
                    } catch(e) {}
                }

                return filePath;
            } catch (e) {
                console.error("saveFile error in Google Drive:", e);
                throw e;
            }
        }

        try {
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
        } catch (error) {
            console.error("Error saving file:", filePath, error);
            throw error;
        }
    }

    public async readFile(filePath: string, timeoutMs: number = 5000): Promise<string | null> {
        try {
            const result = await Promise.race([
                this.getFileAsBlob(filePath).then(blob => blob ? blob.text() : null),
                new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Read timeout')), timeoutMs))
            ]);
            return result;
        } catch (e) {
            return null;
        }
    }
    
    public async getFileAsBlob(filePath: string): Promise<Blob | null> {
        if (this.storageProvider === 'drive') {
            try {
                if (!this.accessToken) return null;
                const fileId = await this.resolvePath(filePath, false);
                if (!fileId) return null;

                const downloadUrl = `/google-api/drive/v3/files/${fileId}?alt=media`;
                
                if (typeof caches !== 'undefined') {
                    try {
                        const cache = await caches.open('kollektiv-drive-cache');
                        const cachedRes = await cache.match(downloadUrl);
                        if (cachedRes) {
                            return await cachedRes.blob();
                        }
                    } catch(e) {}
                }

                const res = await fetch(downloadUrl, {
                    headers: { 'Authorization': `Bearer ${this.accessToken}` }
                });

                if (!res.ok) return null;
                
                if (typeof caches !== 'undefined') {
                    try {
                        const cache = await caches.open('kollektiv-drive-cache');
                        await cache.put(downloadUrl, res.clone());
                    } catch(e) {}
                }

                return await res.blob();
            } catch (e) {
                console.error("getFileAsBlob error for", filePath, e);
                return null;
            }
        }

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
        if (this.storageProvider === 'drive') {
            try {
                if (!this.accessToken) return;
                const fileId = await this.resolvePath(filePath, false);
                if (!fileId) return;

                const deleteUrl = `/google-api/drive/v3/files/${fileId}`;
                const res = await fetch(deleteUrl, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${this.accessToken}` }
                });

                if (res.ok) {
                    const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
                    this.pathCache.delete(cleanPath);
                    if (typeof caches !== 'undefined') {
                        try {
                            const cache = await caches.open('kollektiv-drive-cache');
                            await cache.delete(`/google-api/drive/v3/files/${fileId}?alt=media`);
                        } catch(e) {}
                    }
                }
            } catch (e) {
                console.error("deleteFile error for", filePath, e);
            }
            return;
        }

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
        if (this.storageProvider === 'drive') {
            try {
                if (!this.accessToken) return;
                if (!this.rootFolderId) await this.ensureRootFolder();
                if (!this.rootFolderId) return;

                const q = `'${this.rootFolderId}' in parents and trashed = false`;
                const url = `/google-api/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`;
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${this.accessToken}` }
                });
                if (!res.ok) return;

                const data = await res.json();
                const files = data.files || [];

                for (const file of files) {
                    await fetch(`/google-api/drive/v3/files/${file.id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${this.accessToken}` }
                    }).catch(() => {});
                }
                this.pathCache.clear();
            } catch (e) {
                console.error("GDrive reset error:", e);
            }
            return;
        }

        const handle = await this.getHandle();
        for await (const key of (handle as any).keys()) {
            await handle.removeEntry(key, { recursive: true });
        }
    }
    
    public async* listDirectoryContents(path: string): AsyncGenerator<FileSystemHandle> {
        if (this.storageProvider === 'drive') {
            try {
                if (!this.accessToken) return;
                const folderId = await this.resolvePath(path, false);
                if (!folderId) return;

                const q = `'${folderId}' in parents and trashed = false`;
                const url = `/google-api/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)`;
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${this.accessToken}` }
                });
                if (!res.ok) return;

                const data = await res.json();
                const files = data.files || [];

                for (const file of files) {
                    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                    const childPath = path ? `${path}/${file.name}` : file.name;
                    this.pathCache.set(childPath, { id: file.id, mimeType: file.mimeType });

                    if (isFolder) {
                        yield new DriveDirectoryHandle(file.name, file.id, childPath, this) as any;
                    } else {
                        yield new DriveFileHandle(file.name, file.id, childPath, this) as any;
                    }
                }
            } catch (e) {
                console.error("GDrive listDirectoryContents error for", path, e);
            }
            return;
        }

        try {
            const rootHandle = await this.getHandle();
            let currentHandle = rootHandle;
            if (path) {
                const segments = path.split('/');
                for (const segment of segments) {
                    if (segment === '') continue;
                    currentHandle = await currentHandle.getDirectoryHandle(segment);
                }
            }
            for await (const handle of (currentHandle as any).values()) {
                yield handle;
            }
        } catch (error) {
            return;
        }
    }

    public async calculateTotalSize(): Promise<number> {
        if (this.storageProvider === 'drive') {
            return 1024 * 1024;
        }

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
