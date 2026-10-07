import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LLMSettings } from '../types';
import type { AuthContextType } from '../contexts/AuthContext';

// --- In-memory local vault (just the FileSystemDirectoryHandle surface fileUtils uses) ---
class FakeDir {
    files = new Map<string, Blob>();
    dirs = new Map<string, FakeDir>();
    failWrites = new Set<string>();

    async queryPermission() { return 'granted'; }

    async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDir> {
        let d = this.dirs.get(name);
        if (!d) {
            if (!opts?.create) throw Object.assign(new Error(name), { name: 'NotFoundError' });
            d = new FakeDir();
            d.failWrites = this.failWrites;
            this.dirs.set(name, d);
        }
        return d;
    }

    async getFileHandle(name: string, opts?: { create?: boolean }) {
        if (!this.files.has(name) && !opts?.create) throw Object.assign(new Error(name), { name: 'NotFoundError' });
        return {
            getFile: async () => this.files.get(name)!,
            createWritable: async () => ({
                write: async (b: Blob) => {
                    if (this.failWrites.has(name)) throw new Error(`disk full: ${name}`);
                    this.files.set(name, b);
                },
                close: async () => {},
            }),
        };
    }

    async snapshot(prefix = ''): Promise<Record<string, string>> {
        const out: Record<string, string> = {};
        for (const [n, b] of this.files) out[prefix + n] = await b.text();
        for (const [n, d] of this.dirs) Object.assign(out, await d.snapshot(`${prefix}${n}/`));
        return out;
    }
}

let localRoot: FakeDir;
vi.mock('./db', () => ({
    getHandle: async () => localRoot,
    setHandle: async () => {},
}));
vi.mock('./googleAuth', () => ({
    isGoogleAuthValid: () => true,
    markGoogleTokenInvalid: () => {},
}));

// --- Fake Google Drive behind global fetch ---
const FOLDER = 'application/vnd.google-apps.folder';
interface DriveNode { id: string; name: string; parent: string; mimeType: string; body?: string }

class FakeDrive {
    nodes: DriveNode[] = [];
    pageLimit = 1000;
    failDownloads = new Set<string>();
    calls: { method: string; url: string }[] = [];
    private seq = 0;

    /** Adds `a/b/c.txt` (creating folders on the way); a trailing '/' adds an empty folder. */
    add(path: string, body = `content of ${path}`) {
        const segs = path.split('/');
        const isDir = path.endsWith('/');
        if (isDir) segs.pop();
        let parent = 'ROOT';
        segs.forEach((name, i) => {
            const last = i === segs.length - 1;
            const folder = !last || isDir;
            let n = this.nodes.find(x => x.parent === parent && x.name === name);
            if (!n) {
                n = { id: `id${++this.seq}`, name, parent, mimeType: folder ? FOLDER : 'text/plain', body: folder ? undefined : body };
                this.nodes.push(n);
            }
            parent = n.id;
        });
        return this;
    }

    fetch = async (input: string, init?: { method?: string }) => {
        const method = init?.method ?? 'GET';
        this.calls.push({ method, url: input });
        const u = new URL(input, 'http://local');
        const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data), blob: async () => new Blob([JSON.stringify(data)]) });
        const notFound = { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}), text: async () => 'not found', blob: async () => new Blob([]) };

        if (method !== 'GET') return { ...notFound, status: 405 };

        const media = u.pathname.match(/^\/google-api\/drive\/v3\/files\/([^/]+)$/);
        if (media && u.searchParams.get('alt') === 'media') {
            const n = this.nodes.find(x => x.id === media[1]);
            if (!n || n.body === undefined) return notFound;
            if (this.failDownloads.has(n.name)) return { ...notFound, status: 500, statusText: 'Boom' };
            const body = n.body;
            return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body, blob: async () => new Blob([body]) };
        }

        if (u.pathname === '/google-api/drive/v3/files') {
            const q = u.searchParams.get('q') ?? '';
            const byName = q.match(/^name = '(.+)' and '([^']+)' in parents and trashed = false( and mimeType = 'application\/vnd\.google-apps\.folder')?$/);
            if (byName) {
                const [, name, parent, folderOnly] = byName;
                return json({ files: this.nodes.filter(x => x.parent === parent && x.name === name && (!folderOnly || x.mimeType === FOLDER)) });
            }
            const children = q.match(/^'([^']+)' in parents and trashed = false$/);
            if (children) {
                const all = this.nodes.filter(x => x.parent === children[1]);
                const start = Number(u.searchParams.get('pageToken') ?? 0);
                const size = Math.min(Number(u.searchParams.get('pageSize') ?? 100), this.pageLimit);
                const end = start + size;
                return json({ files: all.slice(start, end), ...(end < all.length ? { nextPageToken: String(end) } : {}) });
            }
        }
        return notFound;
    };
}

let drive: FakeDrive;

async function makeManager(provider: 'local' | 'drive' = 'local') {
    vi.resetModules();
    const { getActiveFileManager } = await import('./fileUtils');
    const mgr = getActiveFileManager();
    const settings = { storageProvider: 'local', googleIdentity: { accessToken: 'tok' }, driveFolderId: 'ROOT' } as unknown as LLMSettings;
    expect(await mgr.initialize(settings, {} as AuthContextType)).toBe(true);
    mgr.storageProvider = provider; // simulate a Drive-mode user who still has a local vault handle
    return mgr;
}

const galleryManifest = {
    categories: [{ id: 'c1', name: 'Cats' }],
    galleryItems: [
        { id: 'g1', title: 'One', categoryId: 'c1', urls: ['gallery/Cats/g1.jpg', 'data:image/png;base64,xx', 'http://x/y.png'] },
        { id: 'g2', urls: ['gallery/g2.mp4'] },
    ],
};

function addGallery(d: FakeDrive) {
    d.add('kollektiv_gallery_manifest.json', JSON.stringify(galleryManifest))
        .add('prompts_manifest.json', '{"prompts":[]}')
        .add('notes.txt')
        .add('gallery/Cats/g1_metadata.json')
        .add('gallery/Cats/g1.jpg')
        .add('gallery/g2_metadata.json')
        .add('gallery/g2.mp4')
        .add('gallery/orphan.jpg');
}

beforeEach(() => {
    localRoot = new FakeDir();
    drive = new FakeDrive();
    vi.stubGlobal('fetch', vi.fn(drive.fetch));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('syncDriveToLocal', () => {
    it('pulls a gallery vault exactly as before (pinned behavior)', async () => {
        addGallery(drive);
        const mgr = await makeManager();
        const progress: [string, number | undefined][] = [];

        await mgr.syncDriveToLocal((m, p) => progress.push([m, p]));

        expect(progress).toEqual([
            ['Initializing Google Drive to Local Sync...', 0],
            ['Downloading "One" (1/2)...', 0],
            ['Downloading "g2" (2/2)...', 50],
            ['Syncing general workspace configurations...', 95],
            ['Sync Complete!', 100],
        ]);
        expect(await localRoot.snapshot()).toEqual({
            'kollektiv_gallery_manifest.json': JSON.stringify(galleryManifest),
            'prompts_manifest.json': '{"prompts":[]}',
            'gallery/Cats/g1_metadata.json': 'content of gallery/Cats/g1_metadata.json',
            'gallery/Cats/g1.jpg': 'content of gallery/Cats/g1.jpg',
            'gallery/g2_metadata.json': 'content of gallery/g2_metadata.json',
            'gallery/g2.mp4': 'content of gallery/g2.mp4',
        });
        expect(mgr.storageProvider).toBe('local');
        expect(drive.calls.filter(c => c.method !== 'GET')).toEqual([]);
    });

    it('pulls prompts/ and design-library/ when Drive has no gallery manifest', async () => {
        drive.add('prompts_manifest.json', '{"prompts":[]}')
            .add('prompts/p1.txt', 'hello')
            .add('prompts/p2.txt', 'world')
            .add('design-library/r1/DESIGN.md', '# R1')
            .add('design-library/r1/refs/1.png', 'png-bytes')
            .add('design-library/r2/')
            .add('other/ignored.txt');
        const mgr = await makeManager();
        const progress: string[] = [];

        await mgr.syncDriveToLocal(m => progress.push(m));

        expect(await localRoot.snapshot()).toEqual({
            'prompts_manifest.json': '{"prompts":[]}',
            'prompts/p1.txt': 'hello',
            'prompts/p2.txt': 'world',
            'design-library/r1/DESIGN.md': '# R1',
            'design-library/r1/refs/1.png': 'png-bytes',
        });
        expect(progress.at(-1)).toBe('Sync Complete!');
        expect(progress.some(m => m.includes('prompts/p1.txt'))).toBe(true);
        expect(mgr.storageProvider).toBe('local');
    });

    it('follows nextPageToken across pages', async () => {
        drive.pageLimit = 2;
        drive.add('a.json', 'A').add('b.json', 'B').add('c.json', 'C');
        for (let i = 1; i <= 5; i++) drive.add(`prompts/p${i}.txt`, `p${i}`);
        const mgr = await makeManager();

        await mgr.syncDriveToLocal();

        const snap = await localRoot.snapshot();
        expect(Object.keys(snap).filter(k => k.startsWith('prompts/')).sort()).toEqual(
            ['prompts/p1.txt', 'prompts/p2.txt', 'prompts/p3.txt', 'prompts/p4.txt', 'prompts/p5.txt']);
        expect(snap['c.json']).toBe('C');
        expect(drive.calls.some(c => c.url.includes('pageToken=2'))).toBe(true);
        expect(drive.calls.some(c => c.url.includes('pageToken=4'))).toBe(true);
    });

    it('is fine when prompts/ and design-library/ do not exist on Drive', async () => {
        drive.add('prompts_manifest.json', '{}');
        const mgr = await makeManager();

        await mgr.syncDriveToLocal();

        expect(await localRoot.snapshot()).toEqual({ 'prompts_manifest.json': '{}' });
    });

    it('reports failed section files, keeps the rest, and restores a Drive-mode provider', async () => {
        drive.add('kollektiv_gallery_manifest.json', JSON.stringify({ categories: [], galleryItems: [] }))
            .add('prompts/ok.txt', 'ok')
            .add('prompts/bad.txt', 'bad')
            .add('design-library/r1/DESIGN.md', '# R1');
        drive.failDownloads.add('bad.txt');
        const mgr = await makeManager('drive');

        await expect(mgr.syncDriveToLocal()).rejects.toThrow(/1 file\(s\) failed.*prompts\/bad\.txt/);

        const snap = await localRoot.snapshot();
        expect(snap['prompts/ok.txt']).toBe('ok');
        expect(snap['design-library/r1/DESIGN.md']).toBe('# R1');
        expect(snap['kollektiv_gallery_manifest.json']).toBeDefined(); // written locally, not back to Drive
        expect(drive.calls.filter(c => c.method !== 'GET')).toEqual([]);
        expect(mgr.storageProvider).toBe('drive');
    });

    it('never leaves the provider on drive when a gallery write throws', async () => {
        addGallery(drive);
        localRoot.failWrites.add('g1.jpg');
        const mgr = await makeManager();

        await expect(mgr.syncDriveToLocal()).rejects.toThrow(/disk full/);

        expect(mgr.storageProvider).toBe('local');
    });
});
