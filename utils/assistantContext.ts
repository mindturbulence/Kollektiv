/**
 * Which page the user is on, for the assistant. App.tsx publishes the active tab
 * here; the chat system prompt reads it per turn, and the live-voice session (whose
 * instruction is fixed at connect, and always opens on the assistant page) asks for
 * it live through the get_current_page tool.
 */
let page = '';
/** Last page that wasn't the assistant itself — where the user was working. */
let workPage = '';

export const setActivePage = (p: string): void => {
    page = p;
    if (p !== 'assistant') workPage = p;
};

export const getPageContext = (): { page: string; workPage: string } => ({ page, workPage });

export const describePageContext = (): string => {
    if (!page) return '';
    if (page === 'assistant') return workPage ? `The user opened you from the "${workPage}" page.` : '';
    return `The user is currently on the "${page}" page.`;
};
