import type { LookupResult, LookupSource } from '../types';

async function onlineLookupFetch(url: string): Promise<any | null> {
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
}

export async function isProxyAvailable(proxyUrl: string): Promise<boolean> {
    try {
        const response = await fetch(proxyUrl + 'https://www.civitai.com');
        return response.ok;
    } catch {
        return false;
    }
}

export async function getCivitAiData(hash: string): Promise<LookupResult | null> {
    if (!hash) return null;
    const baseApiUrl = 'https://civitai.com/api/v1/model-versions/by-hash/';
    const modelApiUrl = 'https://civitai.com/api/v1/models/';
    const baseModelUrl = 'https://civitai.com/models/';
    try {
        const versionData = await onlineLookupFetch(baseApiUrl + hash);
        if (!versionData || !versionData.modelId) return null;
        const model = await onlineLookupFetch(modelApiUrl + versionData.modelId);
        if (!model) return null;
        return {
            data: { ...versionData, model },
            hash,
            modelUrl: `${baseModelUrl}${versionData.modelId}?modelVersionId=${versionData.id}`,
            resourceUrl: baseApiUrl + hash,
            source: 'CivitAI',
        };
    } catch (error) {
        console.error('Error fetching CivitAI data:', error);
        return null;
    }
}

export async function getArcEnCielData(hash: string, proxyUrl: string | null): Promise<LookupResult | null> {
    if (!hash) return null;
    const baseApiUrl = 'https://arcenciel.io/api/models/search?search=';
    const baseModelUrl = 'https://arcenciel.io/models/';
    const targetUrl = baseApiUrl + hash;
    const fetchUrl = proxyUrl ? proxyUrl + targetUrl : targetUrl;
    try {
        const response = await onlineLookupFetch(fetchUrl);
        const first = response?.data?.[0];
        if (!first) return null;
        return {
            data: first,
            hash,
            modelUrl: baseModelUrl + first.id,
            resourceUrl: targetUrl,
            source: 'Arc En Ciel',
        };
    } catch (error) {
        console.error('Error fetching Arc En Ciel data:', error);
        return null;
    }
}

async function lookupBySource(source: LookupSource, hash: string, proxyUrl: string | null): Promise<LookupResult | null> {
    switch (source) {
        case 'civ': return getCivitAiData(hash);
        case 'aec': return getArcEnCielData(hash, proxyUrl);
        default: return null;
    }
}

export async function getModelDataByHash(
    hash: string,
    primary: LookupSource,
    secondary: LookupSource,
    proxyUrl: string | null
): Promise<LookupResult | null> {
    let result = await lookupBySource(primary, hash, proxyUrl);
    if (!result && secondary && secondary !== primary) {
        result = await lookupBySource(secondary, hash, proxyUrl);
    }
    return result;
}
