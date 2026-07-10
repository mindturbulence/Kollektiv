import { describe, it, expect } from 'vitest';
import { loadManifestSafe, type ManifestFs } from './manifestStore';

const validate = (p: any) => (Array.isArray(p) ? p : null);
const empty = () => [] as any[];
const fs = (readFile: ManifestFs['readFile'], fileExists: ManifestFs['fileExists']): ManifestFs => ({ readFile, fileExists });

describe('loadManifestSafe', () => {
    it('valid content -> data, safeToSave', async () => {
        const r = await loadManifestSafe('m.json', validate, empty, fs(async () => '[{"a":1}]', async () => true));
        expect(r).toEqual({ data: [{ a: 1 }], safeToSave: true });
    });
    it('absent file -> empty, safeToSave (fresh vault)', async () => {
        const r = await loadManifestSafe('m.json', validate, empty, fs(async () => null, async () => false));
        expect(r).toEqual({ data: [], safeToSave: true });
    });
    it('null read but file exists (timeout) -> writes blocked', async () => {
        const r = await loadManifestSafe('m.json', validate, empty, fs(async () => null, async () => true));
        expect(r.safeToSave).toBe(false);
    });
    it('null read and existence check throws -> writes blocked', async () => {
        const r = await loadManifestSafe('m.json', validate, empty, fs(async () => null, async () => { throw new Error('perm'); }));
        expect(r.safeToSave).toBe(false);
    });
    it('present but wrong shape -> writes blocked', async () => {
        const r = await loadManifestSafe('m.json', validate, empty, fs(async () => '{"not":"array"}', async () => true));
        expect(r.safeToSave).toBe(false);
    });
    it('unparseable garbage -> writes blocked', async () => {
        const r = await loadManifestSafe('m.json', validate, empty, fs(async () => 'x%%%', async () => true));
        expect(r.safeToSave).toBe(false);
    });
});
