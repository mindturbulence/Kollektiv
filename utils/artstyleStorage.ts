import type { CheatsheetCategory } from '../types';
import { loadManifestSafe, type ManifestLoad } from './manifestStore';

const MANIFEST_NAME = 'artstyles_cheatsheet.json';

const getManifest = (): Promise<ManifestLoad<CheatsheetCategory[]>> =>
    loadManifestSafe<CheatsheetCategory[]>(
        MANIFEST_NAME,
        (parsed) => (Array.isArray(parsed) ? parsed : null),
        () => []
    );

export const loadArtStyles = async (): Promise<CheatsheetCategory[]> => {
    const { data: manifest } = await getManifest();
    return manifest;
};
