/** Map of language names to the lookup keys used in translation tables.
 *  Supports full names ("French") and ISO codes ("fr", "fr-fr"). Shared by
 *  AssistantPage.tsx (idle prompts) and liveAssistantService.ts (tool-activity
 *  flavour text) so both resolve settings.assistantLanguage the same way —
 *  they previously used separate, inconsistent matching logic. */
export const LANGUAGE_ALIASES: Record<string, string> = {
    'english': 'en',
    'spanish': 'es',
    'french': 'fr',
    'german': 'de',
    'italian': 'it',
    'portuguese': 'pt',
    'russian': 'ru',
    'japanese': 'ja',
    'chinese': 'zh',
    'chinese (simplified)': 'zh',
    'chinese (traditional)': 'zh-tw',
    'korean': 'ko',
    'arabic': 'ar',
    'hindi': 'hi',
    'tagalog': 'tl',
    'dutch': 'nl',
    'polish': 'pl',
    'turkish': 'tr',
    'thai': 'th',
    'vietnamese': 'vi',
    'indonesian': 'id',
    'swedish': 'sv',
    'danish': 'da',
    'norwegian': 'no',
    'finnish': 'fi',
    'czech': 'cs',
    'romanian': 'ro',
    'ukrainian': 'uk',
    'greek': 'el',
    'hebrew': 'he',
    'hungarian': 'hu',
};

/** Resolve the user's assistantLanguage setting to a canonical lookup key
 *  ("en", "es", "fr", …). Accepts full names ("French"), ISO codes ("fr"),
 *  or locale variants ("fr-fr"). Falls back to "en". */
export const resolveLangKey = (language: string | undefined): string => {
    const raw = (language || '').toLowerCase().trim();
    if (!raw) return 'en';
    // Direct match: ISO code
    if (/^[a-z]{2}(-[a-z]{2,4})?$/.test(raw)) return raw.split('-')[0];
    // Alias match: full name
    return LANGUAGE_ALIASES[raw] || 'en';
};
