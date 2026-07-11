export interface FieldResolverContext {
    fileMetadata: Record<string, any>;
    civitaiMetadata: Record<string, any>;
    arcencielMetadata: Record<string, any>;
    customMetadata: Record<string, any>;
}

export function resolveField(field: string, ctx: FieldResolverContext, showUndefined: boolean): any {
    if (field.startsWith('civitai.')) {
        const key = field.slice(8);
        if (ctx.civitaiMetadata && key in ctx.civitaiMetadata) return ctx.civitaiMetadata[key];
    } else if (field.startsWith('arcenciel.')) {
        const key = field.slice(10);
        if (ctx.arcencielMetadata && key in ctx.arcencielMetadata) return ctx.arcencielMetadata[key];
    } else if (field.startsWith('custom.')) {
        const key = field.slice(7);
        if (ctx.customMetadata && key in ctx.customMetadata) return ctx.customMetadata[key];
    } else if (field in ctx.fileMetadata) {
        return ctx.fileMetadata[field];
    }
    return showUndefined ? 'undefined' : undefined;
}

export function replacePlaceholders(text: string, resolve: (field: string) => any, undefinedText: string | null = null): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_match, rawPlaceholder: string) => {
        let placeholder = rawPlaceholder.replace(/\s/g, '');
        let optional = false;
        if (placeholder.endsWith('?')) {
            optional = true;
            placeholder = placeholder.slice(0, -1);
        }
        const value = resolve(placeholder);
        if (value !== null && typeof value === 'object') return `<pre>${JSON.stringify(value, null, 2)}</pre>`;
        if (value !== undefined && value !== 'undefined') return String(value);
        if (optional) return '';
        if (undefinedText !== null) return undefinedText;
        return `<span class="opacity-30 italic">undefined</span>`;
    });
}
