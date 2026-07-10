import type { FilterMethod } from '../types';

export function aggregateAndSort(originalObject: Record<string, Record<string, number>>): Record<string, number> {
    return Object.fromEntries(
        Object.entries(
            Object.values(originalObject).reduce((acc: Record<string, number>, subObject) => {
                for (const [key, value] of Object.entries(subObject)) {
                    acc[key] = (acc[key] || 0) + value;
                }
                return acc;
            }, {})
        ).sort(([, a], [, b]) => b - a)
    );
}

export function sortSubproperties(originalObject: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
    return Object.fromEntries(
        Object.entries(originalObject).map(([key, subObject]) => [
            key,
            Object.fromEntries(Object.entries(subObject).sort(([, a], [, b]) => b - a)),
        ])
    );
}

export function convertNumericKeysToString(originalObject: Record<string, any>): Record<string, any> {
    const converted: Record<string, any> = {};
    for (const [key, value] of Object.entries(originalObject)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const nested: Record<string, any> = {};
            for (const [subKey, subValue] of Object.entries(value)) {
                const newSubKey = !isNaN(Number(subKey)) ? `(${subKey})` : subKey;
                nested[newSubKey] = subValue;
            }
            converted[key] = nested;
        } else {
            converted[key] = value;
        }
    }
    return converted;
}

export function filterTopN<T extends Record<string, any>>(obj: T, n: number | string): T {
    return Object.fromEntries(Object.entries(obj).slice(0, Number(n))) as T;
}

export function filterByTag<T extends Record<string, any>>(obj: T, regex: string | RegExp): T {
    const pattern = typeof regex === 'string' ? new RegExp(regex) : regex;
    const filtered: Record<string, any> = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (pattern.test(key) || (typeof obj[key] === 'string' && pattern.test(obj[key]))) filtered[key] = obj[key];
        }
    }
    return filtered as T;
}

export function removeTags<T extends Record<string, any>>(obj: T, regex: string | RegExp): T {
    const pattern = typeof regex === 'string' ? new RegExp(regex) : regex;
    Object.keys(obj).forEach((property) => {
        if (pattern.test(property)) delete (obj as any)[property];
    });
    return obj;
}

export function isValidRegex(regexString: string | RegExp): boolean {
    try {
        new RegExp(regexString);
        return true;
    } catch {
        return false;
    }
}

export function applyFiltersToSubproperties<T extends Record<string, any>>(
    obj: Record<string, T>,
    filterFunction: (subObject: T, ...args: any[]) => T,
    ...args: any[]
): Record<string, T> {
    const filtered: Record<string, T> = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) filtered[key] = filterFunction(obj[key], ...args);
    }
    return filtered;
}

export function listToRegex(listString: string, exactMatch = false): RegExp {
    const values = listString.split(',').map((v) => v.trim());
    const escaped = values.map((v) => v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const pattern = exactMatch ? `^(${escaped.join('|')})$` : `(${escaped.join('|')})`;
    return new RegExp(pattern);
}

export function getSuggestedPrompt(tags: Record<string, any> | undefined): Record<string, string> | undefined {
    if (!tags) return undefined;
    const keys = Object.keys(tags);
    const prompts: Record<string, string> = {};
    if (typeof tags[keys[0]] !== 'object') {
        prompts.Prompt = Object.keys(tags).join(', ');
    } else {
        for (const property in tags) {
            if (Object.prototype.hasOwnProperty.call(tags, property)) prompts[property] = Object.keys(tags[property]).join(', ');
        }
    }
    return prompts;
}

export function buildFilterRegex(method: FilterMethod, value: string): RegExp | string | null {
    switch (method) {
        case 'regex': return value || null;
        case 'exact': return value ? listToRegex(value, true) : null;
        case 'partial': return value ? listToRegex(value) : null;
        default: return null;
    }
}

export interface TagFilterOptions {
    byFolder: boolean;
    filterMethod: FilterMethod;
    filter: string;
    excludeFilterMethod: FilterMethod;
    excludeFilter: string;
    count: number;
}

/**
 * Shared by TagFrequencyPanel and SuggestedPromptPanel (Task 13): both apply the
 * same include/exclude/top-N/by-folder pipeline to a tag object, just with different
 * settings-field sources and a different final render. Invalid regexes are ignored
 * rather than thrown, matching the original tool's validation-then-skip behavior.
 */
export function applyTagFilters(tags: Record<string, any>, options: TagFilterOptions): Record<string, any> {
    const includeRegex = buildFilterRegex(options.filterMethod, options.filter);
    const excludeRegex = buildFilterRegex(options.excludeFilterMethod, options.excludeFilter);
    const validInclude = includeRegex !== null && isValidRegex(includeRegex);
    const validExclude = excludeRegex !== null && isValidRegex(excludeRegex);

    let result: Record<string, any> = JSON.parse(JSON.stringify(tags));

    if (options.byFolder) {
        if (validInclude) result = applyFiltersToSubproperties(result, filterByTag, includeRegex as RegExp | string);
        if (validExclude) result = applyFiltersToSubproperties(result, removeTags, excludeRegex as RegExp | string);
        if (options.count > 0) result = applyFiltersToSubproperties(result, filterTopN, options.count);
    } else {
        if (validInclude) result = filterByTag(result, includeRegex as RegExp | string);
        if (validExclude) result = removeTags(result, excludeRegex as RegExp | string);
        if (options.count > 0) result = filterTopN(result, options.count);
    }
    return result;
}
