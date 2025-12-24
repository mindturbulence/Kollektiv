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
}

// --- Local File System Implementation ---
class LocalFileSystemManager implements IFileSystemManager {
    private appDirHandle: FileSystemDirectoryHandle | null = null;
    public appDirectoryName: string | null = null;
    private isInitialized: boolean = false;

    private async verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
        const options = { mode: 'readwrite' as const };
        if ((await (handle as any).queryPermission(options)) === 'granted') {
            return true;
        }
        if ((await (handle as any).requestPermission(options)) === 'granted') {
            return true;
        }
        return false;
    }

    async initialize(settings: LLMSettings, auth: AuthContextType): Promise<boolean> {
        if (this.isInitialized) return true;
        
        try {
            const handle = await getHandle<FileSystemDirectoryHandle>('app-data-dir');
            if (handle && (await this.verifyPermission(handle))) {
                this.appDirHandle = handle;
                this.appDirectoryName = handle.name;
                this.isInitialized = true;
                return true;
            }
        } catch (error) {
            console.error("Error during LocalFileSystemManager initialization:", error);
        }
        
        this.isInitialized = false;
        return false;
    }

    public isDirectorySelected(): boolean {
        return this.isInitialized && !!this.appDirHandle;
    }

    public async selectAndSetAppDataDirectory(): Promise<FileSystemDirectoryHandle | null> {
        if (typeof window === 'undefined') {
            return null;
        }

        const isFirefox = (window as any).navigator?.userAgent.toLowerCase().includes('firefox');
        
        if (!('showDirectoryPicker' in window)) {
            if (isFirefox) {
                (window as any).alert('File System Access is not supported in Firefox. Core features of this application that rely on local file storage will not be available. Please use a Chromium-based browser like Chrome or Edge for full functionality.');
            } else {
                (window as any).alert('Your browser does not support the File System Access API. This feature is required and only available in modern browsers like Chrome and Edge.');
            }
            return null;
        }

        // Check if running in a cross-origin iframe, which prevents file pickers.
        if ((window as any).self !== (window as any).top) {
            const message = "This application appears to be running in a sandboxed frame and cannot access the local file system. For this feature to work, please open the application in its own browser tab instead of an embedded window.";
            (window as any).alert(message);
            console.error("SecurityError: showDirectoryPicker cannot be called from a cross-origin iframe.", message);
            return null;
        }
        
        try {
            const handle = await (window as any).showDirectoryPicker({ id: 'kollektiv-app-data-dir', mode: 'readwrite' });
            if (await this.verifyPermission(handle)) {
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
            throw new Error("Local File System Manager is not initialized. Please select a directory first.");
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
        const rootHandle = await this.getHandle();
        try {
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
             if (error instanceof Error && error.name === 'NotFoundError') { return null; }
             console.error(`Error getting local file blob for ${filePath}:`, error);
             return null;
        }
    }
    
    public async deleteFile(filePath: string): Promise<void> {
        const rootHandle = await this.getHandle();
        try {
            const segments = filePath.replace(/\\/g, '/').split('/');
            const fileName = segments.pop();
            if (!fileName) return;

            let currentHandle = rootHandle;
            for (const segment of segments) {
                if (segment === '') continue;
                currentHandle = await currentHandle.getDirectoryHandle(segment);
            }
            await currentHandle.removeEntry(fileName);
        } catch (error) {
             if (error instanceof Error && error.name !== 'NotFoundError') {
                console.error(`Error deleting local file ${filePath}:`, error);
            }
        }
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
            } catch (e) {
                if (e instanceof Error && e.name === 'NotFoundError') return;
                throw e;
            }
        }
        for await (const handle of (currentHandle as any).values()) {
            yield handle;
        }
    }
}

export const fileSystemManager = new LocalFileSystemManager();

// --- Standalone Utility Functions ---

export const fileToBase64 = (file: File | Blob, getRawData: boolean = false): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        const result = reader.result as string;
        if (getRawData) {
            resolve(result.split(',')[1]);
        } else {
            resolve(result);
        }
    };
    reader.onerror = error => reject(error);
  });
};

export const dataUrlToBlob = (dataUrl: string): Blob => {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error("Invalid data URL");
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
};

export const createZipAndDownload = async (files: { name: string, content: string | Blob | ArrayBuffer }[], zipFileName: string): Promise<void> => {
    const zip = new JSZip();
    files.forEach(file => {
        zip.file(file.name, file.content);
    });
    
    let blob: Blob;
    if (files.length === 1 && files[0].name === zipFileName) {
        blob = files[0].content as Blob;
    } else {
        blob = await zip.generateAsync({ type: "blob" });
    }

    if (typeof (window as any).document !== 'undefined') {
        const link = (window as any).document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = zipFileName;
        (window as any).document.body.appendChild(link);
        link.click();
        (window as any).document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }
};

export const readZip = async (zipFile: File): Promise<JSZip> => {
    return await JSZip.loadAsync(zipFile);
};

/**
 * Attempts to extract the positive prompt from common text-based metadata in generated images.
 * This is a simplified parser and may not work for all formats, but covers many common cases.
 * @param imageBlob The image file as a Blob.
 * @returns The extracted positive prompt string, or null if not found.
 */
export async function extractPositivePrompt(imageBlob: Blob): Promise<string | null> {
    if (!imageBlob || !imageBlob.type.startsWith('image/')) return null;

    try {
        // Read only the first 64KB to avoid memory issues with large files.
        const METADATA_CHUNK_SIZE = 65536; 
        const chunk = imageBlob.slice(0, METADATA_CHUNK_SIZE);
        const text = await chunk.text(); // Read only the chunk as text
        
        // The main prompt block often starts after a "parameters" keyword.
        const parametersKeyword = 'parameters';
        let metadataBlock = text;
        const paramsIndex = text.indexOf(parametersKeyword);
        if (paramsIndex !== -1) {
            metadataBlock = text.substring(paramsIndex + parametersKeyword.length);
        }

        // Clean leading junk (like null bytes from PNG chunks)
        metadataBlock = metadataBlock.replace(/^[\s\x00]+/, '');

        // The positive prompt usually ends where the negative prompt or other parameters begin.
        // Using a regex to find these keywords at the start of a line improves accuracy.
        const endKeywords = [
            /^Negative prompt:/m,
            /^Steps:/m,
            /^Sampler:/m,
            /^CFG scale:/m,
            /^Seed:/m,
            /^Size:/m,
            /^Model hash:/m,
            /^Model:/m
        ];

        let endIndex = -1;

        for (const keywordRegex of endKeywords) {
            const match = metadataBlock.match(keywordRegex);
            if (match && match.index !== undefined) {
                if (endIndex === -1 || match.index < endIndex) {
                    endIndex = match.index;
                }
            }
        }
        
        if (endIndex !== -1) {
            const potentialPrompt = metadataBlock.substring(0, endIndex).trim();
            if(potentialPrompt) return potentialPrompt;
        }

        // If no end keywords are found, but we did find "parameters", 
        // the whole block is likely the prompt, as long as it's not too long.
        if (paramsIndex !== -1) {
            const trimmedBlock = metadataBlock.trim();
            if(trimmedBlock && trimmedBlock.length < 4000) return trimmedBlock;
        }
        
        return null; // Could not reliably determine the prompt.

    } catch (e) {
        // This can happen if the file is not text-decodable. It's not a user-facing error.
        return null;
    }
}