
import JSZip from 'jszip';
import { getHandle, setHandle } from './db';
import type { AuthContextType } from '../contexts/AuthContext';
import type { LLMSettings } from '../types';
import { loadLLMSettings } from './settingsStorage';
import { convertToJpgWithMetadata } from './imageFormatTools';
import { isGoogleAuthValid } from './googleAuth';

// --- Interfaces and Types ---
export interface IFileSystemManager {
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
    migrateLocalToDrive(
        onProgress?: (
            msg: string,
            progress?: number,
            extra?: {
                phase: 'converting' | 'uploading' | 'complete';
                convertingProgress?: number;
                convertingMsg?: string;
                uploadingProgress?: number;
                uploadingMsg?: string;
                overallProgress?: number;
            }
        ) => void,
        onDuplicateFound?: (fileName: string) => Promise<'replace' | 'copy'>
    ): Promise<void>;
    syncDriveToLocal(
        onProgress?: (
            msg: string,
            progress?: number
        ) => void
    ): Promise<void>;
    calculateTotalSize(): Promise<number>;
    scanForKollektivFolder(): Promise<{ id: string; name: string } | null>;
    createKollektivFolder(): Promise<string>;
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
    private ensureRootFolderPromise: Promise<void> | null = null;
    private resolvePathLock: Promise<any> = Promise.resolve();

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
        if (this.rootFolderId) return;
        if (this.ensureRootFolderPromise) {
            return this.ensureRootFolderPromise;
        }

        this.ensureRootFolderPromise = (async () => {
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
        })();

        try {
            await this.ensureRootFolderPromise;
        } finally {
            this.ensureRootFolderPromise = null;
        }
    }

    private async resolvePath(filePath: string, createIfMissing: boolean = false): Promise<string | null> {
        if (!createIfMissing) {
            return this.resolvePathInternal(filePath, false);
        }

        const currentLock = this.resolvePathLock;
        let resolveLock: () => void = () => {};
        this.resolvePathLock = new Promise<void>((resolve) => {
            resolveLock = resolve;
        });

        try {
            await currentLock;
            return await this.resolvePathInternal(filePath, true);
        } finally {
            resolveLock();
        }
    }

    private async resolvePathInternal(filePath: string, createIfMissing: boolean = false): Promise<string | null> {
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

            const cleanName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const q = `name = '${cleanName}' and '${currentParentId}' in parents and trashed = false${mimeTypeFilter}`;
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

    public async scanForKollektivFolder(): Promise<{ id: string; name: string } | null> {
        if (!this.accessToken) {
            throw new Error("No Google access token configured.");
        }
        const q = "(name = 'Kollektiv' or name = 'kollektiv' or name = 'KOLLEKTIV') and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
        const searchUrl = `/google-api/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
        const res = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${this.accessToken}` }
        });

        if (!res.ok) {
            const details = await this.extractGoogleError(res);
            throw new Error(`Failed to query Google Drive folder: ${details}`);
        }

        const data = await res.json();
        const folders = data.files || [];
        if (folders.length > 0) {
            return { id: folders[0].id, name: folders[0].name };
        }
        return null;
    }

    public async createKollektivFolder(): Promise<string> {
        if (!this.accessToken) {
            throw new Error("No Google access token configured.");
        }
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
        this.appDirectoryName = "Google Drive (Kollektiv)";
        this.pathCache.clear();

        // Prefetch root folder children into cache
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

        return newFolder.id;
    }

    async initialize(settings: LLMSettings, _auth: AuthContextType): Promise<boolean> {
        this.lastError = null;
        this.storageProvider = settings.storageProvider || 'local';
        const googleIdentity = settings.googleIdentity;
        this.accessToken = isGoogleAuthValid(googleIdentity) ? googleIdentity.accessToken : null;

        // Drive standby/keep-alive initialization
        if (this.accessToken) {
            try {
                if (settings.driveFolderId) {
                    this.rootFolderId = settings.driveFolderId;
                } else {
                    const folder = await this.scanForKollektivFolder().catch(() => null);
                    if (folder) {
                        this.rootFolderId = folder.id;
                    }
                }
            } catch (e) {
                console.warn("Google Drive standby initialization warning:", e);
            }
        }

        if (this.storageProvider === 'drive') {
            if (!this.accessToken) {
                this.lastError = "Google Client access token is missing. Please reconnect.";
                this.isInitialized = false;
                return false;
            }
            try {
                this.pathCache.clear();
                if (settings.driveFolderId) {
                    this.rootFolderId = settings.driveFolderId;
                    this.appDirectoryName = settings.driveFolderName || "Google Drive (Kollektiv)";
                } else {
                    await this.ensureRootFolder();
                    this.appDirectoryName = "Google Drive (Kollektiv)";
                }
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

    /**
     * True existence check. Returns false ONLY when the file is confirmed absent.
     * Throws on permission or transient errors — callers must never treat a
     * failed check as "missing" (that mistake is how manifests got wiped).
     */
    public async fileExists(filePath: string): Promise<boolean> {
        if (this.storageProvider === 'drive') {
            const fileId = await this.resolvePath(filePath, false);
            return fileId !== null;
        }
        const rootHandle = await this.getHandle();
        const segments = filePath.replace(/\\/g, '/').split('/');
        const fileName = segments.pop();
        if (!fileName) throw new Error("Invalid file path provided.");
        try {
            let currentHandle = rootHandle;
            for (const segment of segments) {
                if (segment === '') continue;
                currentHandle = await currentHandle.getDirectoryHandle(segment);
            }
            await currentHandle.getFileHandle(fileName);
            return true;
        } catch (e: any) {
            if (e?.name === 'NotFoundError' || e?.name === 'TypeMismatchError') return false;
            throw e;
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

    public isMigrationPaused = false;
    public isMigrationAborted = false;

    public async migrateLocalToDrive(
        onProgress?: (
            msg: string,
            progress?: number,
            extra?: {
                phase: 'converting' | 'uploading' | 'complete';
                convertingProgress?: number;
                convertingMsg?: string;
                uploadingProgress?: number;
                uploadingMsg?: string;
                overallProgress?: number;
            }
        ) => void,
        onDuplicateFound?: (fileName: string) => Promise<'replace' | 'copy'>
    ): Promise<void> {
        if (!this.accessToken) {
            throw new Error("No Google Drive connection configured. Please connect first.");
        }
        if (!this.appDirHandle) {
            throw new Error("Local vault handle is not connected. Please connect it first.");
        }

        this.isMigrationPaused = false;
        this.isMigrationAborted = false;

        // Clear path cache to force fresh resolution and ensure we overwrite existing files accurately
        this.pathCache.clear();

        const checkPause = async () => {
            while (this.isMigrationPaused && !this.isMigrationAborted) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
            if (this.isMigrationAborted) {
                throw new Error("Migration aborted by user.");
            }
        };

        // Keep track of paths that we have already converted and uploaded
        const uploadedFilePaths = new Set<string>();

        // --- PHASE 1: CONVERT AND UPLOAD EACH POST POST-BY-POST IN MEMORY ---
        if (onProgress) {
            onProgress("Initializing post-by-post image conversion phase...", 0, {
                phase: 'converting',
                convertingProgress: 0,
                convertingMsg: "Checking gallery items for conversion...",
                overallProgress: 0
            });
        }

        // 1. Read the manifest
        const manifestContent = await this.readFile('kollektiv_gallery_manifest.json');
        let manifest: any = null;
        if (manifestContent) {
            try {
                manifest = JSON.parse(manifestContent);
            } catch (e) {
                console.error("Failed to parse gallery manifest for migration conversion:", e);
            }
        }

        if (manifest && Array.isArray(manifest.galleryItems)) {
            const categories = Array.isArray(manifest.categories) ? manifest.categories : [];
            const galleryItems = manifest.galleryItems;
            const totalGItems = galleryItems.length;

            const settings = loadLLMSettings();

            // Create a deep copy of the manifest to modify for Google Drive only
            const driveManifest = JSON.parse(JSON.stringify(manifest));

            for (let itemIdx = 0; itemIdx < totalGItems; itemIdx++) {
                if (this.isMigrationAborted) {
                    throw new Error("Migration aborted by user.");
                }
                await checkPause();

                const item = galleryItems[itemIdx];
                const postTitle = item.title || item.id || 'Untitled Post';

                // STEP A: CONVERT this post's images in memory (or copy video as is)
                const convertingMsg = `Converting images for "${postTitle}" (${itemIdx + 1}/${totalGItems})`;
                const convertingProgress = totalGItems > 0 ? (itemIdx / totalGItems) * 100 : 100;
                const overallProgressConv = totalGItems > 0 ? Math.round((itemIdx / totalGItems) * 50) : 50;

                if (onProgress) {
                    onProgress(convertingMsg, overallProgressConv, {
                        phase: 'converting',
                        convertingProgress,
                        convertingMsg,
                        overallProgress: overallProgressConv
                    });
                }

                const itemIndexInManifest = driveManifest.galleryItems.findIndex((it: any) => it.id === item.id);
                const urlsToUploadInGDrive: string[] = [];
                const convertedBlobsToUpload: { path: string; blob: Blob }[] = [];

                if (Array.isArray(item.urls)) {
                    for (let urlIndex = 0; urlIndex < item.urls.length; urlIndex++) {
                        const originalUrl = item.urls[urlIndex];
                        if (originalUrl && !originalUrl.startsWith('data:') && !originalUrl.startsWith('http')) {
                            try {
                                const blob = await this.getFileAsBlob(originalUrl);
                                if (blob) {
                                    if (item.type === 'image') {
                                        const isAlreadyJpg = originalUrl.toLowerCase().endsWith('.jpg') || originalUrl.toLowerCase().endsWith('.jpeg');
                                        if (isAlreadyJpg) {
                                            convertedBlobsToUpload.push({ path: originalUrl, blob });
                                            urlsToUploadInGDrive.push(originalUrl);
                                            uploadedFilePaths.add(originalUrl);
                                        } else {
                                            const quality = settings.jpgCompressionQuality || 0.9;
                                            const jpgBlob = await convertToJpgWithMetadata(blob, quality);
                                            const newUrl = originalUrl.replace(/\.[^/.]+$/, "") + ".jpg";

                                            convertedBlobsToUpload.push({ path: newUrl, blob: jpgBlob });
                                            urlsToUploadInGDrive.push(newUrl);

                                            uploadedFilePaths.add(originalUrl);
                                            uploadedFilePaths.add(newUrl);
                                        }
                                    } else {
                                        // Video or non-image
                                        convertedBlobsToUpload.push({ path: originalUrl, blob });
                                        urlsToUploadInGDrive.push(originalUrl);
                                        uploadedFilePaths.add(originalUrl);
                                    }
                                } else {
                                    urlsToUploadInGDrive.push(originalUrl);
                                }
                            } catch (err) {
                                console.error(`Failed to process image index ${urlIndex} for post ${item.id}:`, err);
                                urlsToUploadInGDrive.push(originalUrl);
                            }
                        } else {
                            urlsToUploadInGDrive.push(originalUrl);
                        }
                    }
                }

                // Metadata path
                const category = categories.find((c: any) => c.id === item.categoryId);
                const categoryName = category?.name || '';
                const pathSegments = ['gallery'];
                if (categoryName) pathSegments.push(categoryName);
                const metadataPath = [...pathSegments, `${item.id}_metadata.json`].join('/');

                // Build Google Drive metadata (referencing the converted .jpg paths)
                let driveMetaObj = { ...item };
                driveMetaObj.urls = urlsToUploadInGDrive;
                const driveMetaBlob = new Blob([JSON.stringify(driveMetaObj, null, 2)], { type: 'application/json' });

                // Update the drive manifest with the new GDrive paths for this item
                if (itemIndexInManifest > -1 && driveManifest.galleryItems[itemIndexInManifest]) {
                    driveManifest.galleryItems[itemIndexInManifest].urls = urlsToUploadInGDrive;
                }

                // Add metadata path to skip list in Phase 2
                uploadedFilePaths.add(metadataPath);

                // STEP B: UPLOAD this post's files and metadata to Google Drive straight away!
                const uploadingMsg = `Uploading converts for "${postTitle}" to Google Drive (${itemIdx + 1}/${totalGItems})`;
                const uploadingProgress = totalGItems > 0 ? (itemIdx / totalGItems) * 100 : 100;
                const overallProgressUpload = totalGItems > 0 ? Math.round(((itemIdx + 0.5) / totalGItems) * 50) : 50;

                if (onProgress) {
                    onProgress(uploadingMsg, overallProgressUpload, {
                        phase: 'uploading',
                        uploadingProgress,
                        uploadingMsg,
                        overallProgress: overallProgressUpload
                    });
                }

                const oldProvider = this.storageProvider;
                try {
                    this.storageProvider = 'drive';
                    
                    // Upload metadata JSON to Google Drive
                    await this.saveFile(metadataPath, driveMetaBlob);

                    // Upload actual image/video files to Google Drive
                    for (const fileToUpload of convertedBlobsToUpload) {
                        await this.saveFile(fileToUpload.path, fileToUpload.blob);
                    }
                } catch (uploaderErr) {
                    console.error(`Post-by-post upload error for item ${item.id}:`, uploaderErr);
                } finally {
                    this.storageProvider = oldProvider;
                }
            }

            // Upload GDrive manifest to Google Drive
            const oldProvider = this.storageProvider;
            try {
                this.storageProvider = 'drive';
                await this.saveFile('kollektiv_gallery_manifest.json', new Blob([JSON.stringify(driveManifest, null, 2)], { type: 'application/json' }));
                uploadedFilePaths.add('kollektiv_gallery_manifest.json');
            } catch (err) {
                console.error("Failed to upload updated gallery manifest to Google Drive in Phase 1:", err);
            } finally {
                this.storageProvider = oldProvider;
            }
        }

        // --- PHASE 2: COPY ALL OTHER WORKSPACE FILES TO GOOGLE DRIVE ---
        const countFiles = async (handle: FileSystemDirectoryHandle): Promise<number> => {
            let count = 0;
            for await (const entry of (handle as any).values()) {
                if (entry.kind === 'file') {
                    count++;
                } else if (entry.kind === 'directory') {
                    count += await countFiles(entry);
                }
            }
            return count;
        };

        let totalFiles = 0;
        try {
            totalFiles = await countFiles(this.appDirHandle);
        } catch (e) {
            console.warn("Failed to count local files for progress", e);
        }

        let processedFiles = 0;

        const copyRecursive = async (localHandle: FileSystemDirectoryHandle, currentPath: string) => {
            for await (const entry of (localHandle as any).values()) {
                if (this.isMigrationAborted) {
                    throw new Error("Migration aborted by user.");
                }
                await checkPause();

                const filePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

                if (entry.kind === 'file') {
                    // Skip files already converted and uploaded in Phase 1
                    if (uploadedFilePaths.has(filePath)) {
                        processedFiles++;
                        continue;
                    }

                    const uploadingProgress = totalFiles > 0 ? (processedFiles / totalFiles) * 100 : 100;
                    const overallProgress = totalFiles > 0 ? Math.round(50 + (processedFiles / totalFiles) * 50) : 100;
                    const uploadingMsg = `Uploading general ${entry.name}...`;

                    if (onProgress) {
                        onProgress(uploadingMsg, overallProgress, {
                            phase: 'uploading',
                            uploadingProgress,
                            uploadingMsg,
                            overallProgress
                        });
                    }

                    const file = await entry.getFile();
                    const oldProvider = this.storageProvider;
                    this.storageProvider = 'drive';

                    try {
                        const exists = await this.resolvePath(filePath);
                        let finalPath = filePath;

                        const isDatabaseOrMetadata = 
                            filePath === 'kollektiv_gallery_manifest.json' || 
                            filePath.endsWith('_manifest.json') || 
                            filePath.endsWith('_cheatsheet.json') || 
                            filePath.endsWith('_metadata.json');

                        if (exists && !isDatabaseOrMetadata) {
                            if (onDuplicateFound) {
                                const choice = await onDuplicateFound(entry.name);
                                if (choice === 'copy') {
                                    const dotIndex = entry.name.lastIndexOf('.');
                                    const nameWithoutExt = dotIndex !== -1 ? entry.name.substring(0, dotIndex) : entry.name;
                                    const ext = dotIndex !== -1 ? entry.name.substring(dotIndex) : '';
                                    
                                    let copyIndex = 1;
                                    let copyPath = `${currentPath ? currentPath + '/' : ''}${nameWithoutExt} (${copyIndex})${ext}`;
                                    while (await this.resolvePath(copyPath) !== null) {
                                        copyIndex++;
                                        copyPath = `${currentPath ? currentPath + '/' : ''}${nameWithoutExt} (${copyIndex})${ext}`;
                                    }
                                    finalPath = copyPath;
                                }
                            }
                        }

                        await this.saveFile(finalPath, file);
                    } catch (e) {
                         console.error("Migration failed for", filePath, e);
                    } finally {
                        this.storageProvider = oldProvider;
                    }

                    processedFiles++;
                    const finalUploadingProgress = totalFiles > 0 ? (processedFiles / totalFiles) * 100 : 100;
                    const finalOverallProgress = totalFiles > 0 ? Math.round(50 + (processedFiles / totalFiles) * 50) : 100;

                    if (onProgress) {
                        onProgress(`Uploaded ${entry.name}.`, finalOverallProgress, {
                            phase: 'uploading',
                            uploadingProgress: finalUploadingProgress,
                            uploadingMsg: `Uploaded ${entry.name}.`,
                            overallProgress: finalOverallProgress
                        });
                    }
                } else if (entry.kind === 'directory') {
                    const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
                    await copyRecursive(entry, newPath);
                }
            }
        };

        if (onProgress) {
            onProgress("Starting overall general upload phase to Google Drive...", 50, {
                phase: 'uploading',
                uploadingProgress: 0,
                uploadingMsg: "Starting general upload phase...",
                overallProgress: 50
            });
        }

        await copyRecursive(this.appDirHandle, '');

        if (onProgress) {
            onProgress("Migration complete!", 100, {
                phase: 'complete',
                overallProgress: 100
            });
        }
    }

    public async syncDriveToLocal(
        onProgress?: (
            msg: string,
            progress?: number
        ) => void
    ): Promise<void> {
        if (!this.accessToken) {
            throw new Error("No Google Drive connection configured. Please connect first.");
        }
        if (!this.appDirHandle) {
            throw new Error("Local vault handle is not connected. Please connect it first.");
        }

        this.isMigrationPaused = false;
        this.isMigrationAborted = false;

        const checkPause = async () => {
            while (this.isMigrationPaused && !this.isMigrationAborted) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
            if (this.isMigrationAborted) {
                throw new Error("Migration aborted by user.");
            }
        };

        if (onProgress) {
            onProgress("Initializing Google Drive to Local Sync...", 0);
        }

        // 1. Read manifest from GDrive
        const oldProvider = this.storageProvider;
        this.storageProvider = 'drive';
        let driveManifestContent: string | null = null;
        try {
            driveManifestContent = await this.readFile('kollektiv_gallery_manifest.json');
        } catch (e) {
            console.error("Failed to read manifest from Drive:", e);
        }
        this.storageProvider = oldProvider;

        if (!driveManifestContent) {
            throw new Error("No gallery manifest found on Google Drive. Sync cannot proceed.");
        }

        // Parse drive manifest
        let driveManifest: any = null;
        try {
            driveManifest = JSON.parse(driveManifestContent);
        } catch (e) {
            throw new Error("Failed to parse gallery manifest from Google Drive.");
        }

        const categories = Array.isArray(driveManifest.categories) ? driveManifest.categories : [];
        const galleryItems = Array.isArray(driveManifest.galleryItems) ? driveManifest.galleryItems : [];
        const totalItems = galleryItems.length;

        // Save categories and manifest locally
        await this.saveFile('kollektiv_gallery_manifest.json', new Blob([driveManifestContent], { type: 'application/json' }));

        // Sync items post-by-post from GDrive to Local
        for (let i = 0; i < totalItems; i++) {
            if (this.isMigrationAborted) {
                throw new Error("Migration aborted by user.");
            }
            await checkPause();

            const item = galleryItems[i];
            const postTitle = item.title || item.id || 'Untitled Post';
            const progressVal = Math.round((i / totalItems) * 100);

            if (onProgress) {
                onProgress(`Downloading "${postTitle}" (${i + 1}/${totalItems})...`, progressVal);
            }

            // A. Download metadata JSON from GDrive and save locally
            const category = categories.find((c: any) => c.id === item.categoryId);
            const categoryName = category?.name || '';
            const pathSegments = ['gallery'];
            if (categoryName) pathSegments.push(categoryName);
            const metadataPath = [...pathSegments, `${item.id}_metadata.json`].join('/');

            this.storageProvider = 'drive';
            const metaBlob = await this.getFileAsBlob(metadataPath);
            this.storageProvider = 'local';
            if (metaBlob) {
                await this.saveFile(metadataPath, metaBlob);
            }

            // B. Download actual images/media from GDrive and save locally
            if (Array.isArray(item.urls)) {
                for (const url of item.urls) {
                    if (url && !url.startsWith('data:') && !url.startsWith('http')) {
                        this.storageProvider = 'drive';
                        const fileBlob = await this.getFileAsBlob(url);
                        this.storageProvider = 'local';
                        if (fileBlob) {
                            await this.saveFile(url, fileBlob);
                        }
                    }
                }
            }
        }

        // Download any other workspace JSON files from GDrive
        if (onProgress) {
            onProgress("Syncing general workspace configurations...", 95);
        }

        this.storageProvider = 'drive';
        const rootFiles: any[] = [];
        try {
            const q = `'${this.rootFolderId}' in parents and trashed = false`;
            const url = `/google-api/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${this.accessToken}` } });
            if (res.ok) {
                const data = await res.json();
                rootFiles.push(...(data.files || []));
            }
        } catch (e) {
            console.error("Failed to list general files from GDrive root:", e);
        }
        this.storageProvider = oldProvider;

        for (const file of rootFiles) {
            if (file.mimeType !== 'application/vnd.google-apps.folder' && file.name.endsWith('.json') && file.name !== 'kollektiv_gallery_manifest.json') {
                this.storageProvider = 'drive';
                const fileBlob = await this.getFileAsBlob(file.name);
                this.storageProvider = 'local';
                if (fileBlob) {
                    await this.saveFile(file.name, fileBlob);
                }
            }
        }

        if (onProgress) {
            onProgress("Sync Complete!", 100);
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
