import type { CustomFieldDef, CustomFieldContext } from '../types';

/**
 * Escapes a value for safe interpolation into an HTML string (text content or a
 * single-quoted attribute). Custom-field expressions that build HTML from CivitAI/Arc en
 * Ciel lookup responses (remote, not local, data) must wrap those values in this before
 * embedding them — see the default fields in constants.ts (civitai_preview,
 * civitai_creator, civitai_name, arcenciel_preview, arcenciel_creator, arcenciel_name,
 * base_model_url) for the pattern.
 */
export function escapeHtml(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Ports LoRA-Edit's eval()-based custom field system. Expressions are user-authored
 * (defaults ship with the app, editable in settings) and run against local file data —
 * same trust model as the original tool. Uses `new Function` with explicit named
 * parameters instead of the original's `window`-global approach, so no globals are polluted.
 */
export function evaluateCustomFields(defs: CustomFieldDef[], context: CustomFieldContext, seed: Record<string, any> = {}): Record<string, any> {
    const { fileMetadata, civitaiMetadata, arcencielMetadata, basemodelMetadata, vaeMetadata, safetensorsFile } = context;
    const customMetadata: Record<string, any> = { ...seed };

    for (const def of defs) {
        if (!def || typeof def.label !== 'string' || typeof def.calc !== 'string') continue;
        try {
            // eslint-disable-next-line no-new-func
            const evaluator = new Function(
                'fileMetadata', 'civitaiMetadata', 'arcencielMetadata', 'basemodelMetadata', 'vaeMetadata', 'customMetadata', 'safetensorsFile', 'escapeHtml',
                `return (${def.calc});`
            );
            customMetadata[def.label] = evaluator(fileMetadata, civitaiMetadata, arcencielMetadata, basemodelMetadata, vaeMetadata, customMetadata, safetensorsFile, escapeHtml);
        } catch (e) {
            if (def.showError) console.warn(`Error evaluating expression for custom field "${def.label}".`, def, e);
        }
    }

    return customMetadata;
}
