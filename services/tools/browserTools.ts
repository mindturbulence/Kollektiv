/**
 * Browser control tools for the assistant.
 *
 * All tools in this module route through the unified BrowserOperator
 * interface (CDP external browser when connected, in-app synthetic events
 * otherwise). data-ai-id tools (click_element, select_option) always go to
 * the in-app operator. All tools require screen-sharing + control permission
 * to have been granted; the dispatcher in services/assistantTools.ts
 * enforces this check before any execute() call in this module.
 */
import { appEventBus } from '../../utils/eventBus';
import { getOperator, getInAppOperator } from '../browserOperatorResolver';
import type { AssistantTool } from './types';

export const browserTools: AssistantTool[] = [
//   - CDP external browser (when connected via `--remote-debugging-port`)
//   - In-app synthetic events (fallback)
// data-ai-id tools (click_element, select_option) always go to the in-app operator.

{
    name: 'browser_click_element',
    description: 'Click a specific UI control by the id shown in brackets by browser_read_structure (e.g. "[generate-btn] <button>..." → pass "generate-btn"). This is the PRIMARY way to click things in the app — it targets the real element directly, so it is exact and never misses. Always call browser_read_structure first to get current ids. Use browser_click (coordinates) only as a fallback for canvas/image content that has no id. Requires screen sharing + control permission.',
    parameters: {
        type: 'object',
        properties: {
            id: { type: 'string', description: 'The data-ai-id shown in brackets by browser_read_structure, e.g. "generate-btn".' },
        },
        required: ['id'],
    },
    execute: ({ id }) => getInAppOperator().clickElement(String(id)),
},
{
    name: 'browser_select_option',
    description: 'Pick an option in a native dropdown (<select>) by its data-ai-id and the option\'s visible text. Regular clicks cannot open a native dropdown\'s popup, so use this instead of browser_click_element for <select> elements. Requires screen sharing + control permission.',
    parameters: {
        type: 'object',
        properties: {
            id: { type: 'string', description: 'The data-ai-id of the <select> element, from browser_read_structure.' },
            option: { type: 'string', description: 'The visible text of the option to select, exactly as shown.' },
        },
        required: ['id', 'option'],
    },
    execute: ({ id, option }) => getInAppOperator().selectOption(String(id), String(option)),
},
{
    name: 'browser_click',
    description: 'Click at pixel coordinates within the screen image you see (scaled to max 1024px on the long side). Works in-app (synthetic events) and on external websites (via CDP when connected). For any normal UI control with a data-ai-id, use browser_click_element instead — it is exact, this is not. Requires screen sharing + control permission.',
    parameters: {
        type: 'object',
        properties: {
            nx: { type: 'number', description: 'X pixel coordinate within the screen image you see (0–1024 range).' },
            ny: { type: 'number', description: 'Y pixel coordinate within the screen image you see (0–1024 range).' },
        },
        required: ['nx', 'ny'],
    },
    execute: async ({ nx, ny }) => getOperator().operator.click(Number(nx), Number(ny)),
},
{
    name: 'browser_double_click',
    description: 'Double-click at pixel coordinates within the screen image (scaled to max 1024px). Works in-app and on external websites (via CDP).',
    parameters: {
        type: 'object',
        properties: {
            nx: { type: 'number', description: 'X pixel coordinate within the screen image you see.' },
            ny: { type: 'number', description: 'Y pixel coordinate within the screen image you see.' },
        },
        required: ['nx', 'ny'],
    },
    execute: async ({ nx, ny }) => getOperator().operator.doubleClick(Number(nx), Number(ny)),
},
{
    name: 'browser_right_click',
    description: 'Right-click at pixel coordinates within the screen image (scaled to max 1024px). Works in-app and on external websites (via CDP).',
    parameters: {
        type: 'object',
        properties: {
            nx: { type: 'number', description: 'X pixel coordinate within the screen image you see.' },
            ny: { type: 'number', description: 'Y pixel coordinate within the screen image you see.' },
        },
        required: ['nx', 'ny'],
    },
    execute: async ({ nx, ny }) => getOperator().operator.rightClick(Number(nx), Number(ny)),
},
{
    name: 'browser_hover',
    description: 'Hover (move mouse to) a position on the page. Useful for revealing hover menus, tooltips, or previews. Provide pixel coordinates within the screen image (scaled to max 1024px). Works in-app and on external websites (via CDP).',
    parameters: {
        type: 'object',
        properties: {
            nx: { type: 'number', description: 'X pixel coordinate within the screen image you see.' },
            ny: { type: 'number', description: 'Y pixel coordinate within the screen image you see.' },
        },
        required: ['nx', 'ny'],
    },
    execute: async ({ nx, ny }) => getOperator().operator.hover(Number(nx), Number(ny)),
},
{
    name: 'browser_type',
    description: 'Type text into the input field that is focused on the page. Make sure you click the input field first with browser_click. Works in-app and on external websites (via CDP).',
    parameters: {
        type: 'object',
        properties: {
            text: { type: 'string', description: 'The text to type into the focused field.' },
        },
        required: ['text'],
    },
    execute: async ({ text }) => getOperator().operator.type(String(text)),
},
{
    name: 'browser_press_key',
    description: 'Press a named key (Enter, Tab, Escape, Backspace, ArrowUp/Down/Left/Right, etc.) or combinations (Control+C, Control+V, Shift+Tab) on the element that currently has focus. Works in-app and on external websites (via CDP).',
    parameters: {
        type: 'object',
        properties: {
            key: { type: 'string', description: 'Key name. Valid: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Space, Home, End, PageUp, PageDown, F1–F12, Shift, Control, Alt, CapsLock. Can also combine modifiers like Control+V, Control+C, Meta+C, Shift+Tab.' },
        },
        required: ['key'],
    },
    execute: async ({ key }) => getOperator().operator.pressKey(String(key)),
},
{
    name: 'browser_scroll',
    description: 'Scroll the page by a small or large amount. dy = 0.5 scrolls down half a page. dy = -0.3 scrolls up a bit. dx scrolls sideways. Works in-app and on external websites (via CDP).',
    parameters: {
        type: 'object',
        properties: {
            dx: { type: 'number', description: 'Horizontal scroll factor (negative = left, positive = right, 0.3 = ~300px).' },
            dy: { type: 'number', description: 'Vertical scroll factor (negative = up, positive = down, 0.5 = ~500px).' },
        },
    },
    execute: async ({ dx, dy }) => getOperator().operator.scroll(Number(dx || 0), Number(dy || 0)),
},
{
    name: 'browser_scroll_to',
    description: 'Scroll to a specific position on the page. frac = 0 is the top, frac = 1 is the bottom. Works in-app and on external websites (via CDP).',
    parameters: {
        type: 'object',
        properties: {
            frac: { type: 'number', description: 'Scroll position (0 = top, 0.5 = middle, 1 = bottom).' },
        },
        required: ['frac'],
    },
    execute: async ({ frac }) => getOperator().operator.scrollTo(Number(frac)),
},
{
    name: 'browser_get_url',
    description: 'Get the current page URL. Works in-app and on external websites (via CDP).',
    parameters: { type: 'object', properties: {} },
    execute: async () => getOperator().operator.getUrl(),
},
{
    name: 'browser_read_page',
    description: 'Read all visible text content from the current page. Returns the page title, URL, and up to 5000 characters of body text. Works in-app and on external websites (via CDP).',
    parameters: { type: 'object', properties: {} },
    execute: async () => getOperator().operator.readContent(),
},
{
    name: 'browser_read_structure',
    description: 'Scan the page and list interactive elements visible on screen (buttons, links, inputs, headings) with their tag and text. Elements with a data-ai-id (shown in brackets, e.g. "[generate-btn]") can be clicked exactly with browser_click_element — call this FIRST to get those ids, then act on them. On external pages (via CDP), no data-ai-id will be shown — use browser_click with coordinates instead. Works in-app and on external websites.',
    parameters: { type: 'object', properties: {} },
    execute: async () => getOperator().operator.readStructure(),
},
{
    name: 'browser_navigate',
    description: 'Navigate the browser to a different URL. Works in-app and on external websites (via CDP).',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'Full absolute URL (http/https) to navigate to.' },
        },
        required: ['url'],
    },
    execute: async ({ url }) => getOperator().operator.navigate(String(url)),
},
{
    name: 'browser_list_tabs',
    description: 'List all open tabs in the CDP-connected browser. Returns each tab\'s id, title, and URL. Use the id with browser_switch_tab to change tabs. Only works when CDP external browser is connected (Settings > Browser Bridge).',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
        const { operator } = getOperator();
        if (!operator.listTabs) return 'Error: tab management not available with the current browser backend.';
        const tabs = await operator.listTabs();
        if (!tabs.length) return 'No tabs found.';
        return tabs.map(t => `[${t.id}] ${t.title} — ${t.url}`).join('\n');
    },
},
{
    name: 'browser_new_tab',
    description: 'Open a new tab in the CDP-connected browser with the given URL. The active connection automatically switches to the new tab. Only works when CDP external browser is connected (Settings > Browser Bridge).',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'The URL to open (e.g. "https://example.com"). Defaults to about:blank.' },
        },
    },
    execute: async ({ url }) => {
        const { operator } = getOperator();
        if (!operator.openTab) return 'Error: new tab not available with the current browser backend.';
        const targetUrl = url ? String(url) : 'about:blank';
        const result = await operator.openTab(targetUrl);
        return `Opened new tab: "${result.title}" (id: ${result.id}).`;
    },
},
{
    name: 'browser_switch_tab',
    description: 'Switch the active CDP connection to a different browser tab. Use browser_list_tabs first to get tab ids. Only works when CDP external browser is connected (Settings > Browser Bridge).',
    parameters: {
        type: 'object',
        properties: {
            id: { type: 'string', description: 'The tab id from browser_list_tabs.' },
        },
        required: ['id'],
    },
    execute: async ({ id }) => {
        const { operator } = getOperator();
        if (!operator.switchTab) return 'Error: tab switching not available with the current browser backend.';
        const title = await operator.switchTab(String(id));
        return `Switched to tab: "${title}".`;
    },
},
{
    name: 'browser_close_tab',
    description: 'Close a tab in the CDP-connected browser. Use browser_list_tabs first to get tab ids. Only works when CDP external browser is connected (Settings > Browser Bridge).',
    parameters: {
        type: 'object',
        properties: {
            id: { type: 'string', description: 'The tab id from browser_list_tabs.' },
        },
        required: ['id'],
    },
    execute: async ({ id }) => {
        const { operator } = getOperator();
        if (!operator.closeTab) return 'Error: tab closing not available with the current browser backend.';
        const ok = await operator.closeTab(String(id));
        return ok ? `Closed tab ${id}.` : `Error: failed to close tab ${id}.`;
    },
},
{
    name: 'browser_drag',
    description: 'Drag the mouse from one position to another on the page. Useful for slider controls, canvas drawing, or drag-and-drop interfaces. Provide start (nx, ny) and end (endNx, endNy) as pixel coordinates within the screen image (scaled to max 1024px). Only works with CDP external browser connected (Settings > Browser Bridge).',
    parameters: {
        type: 'object',
        properties: {
            nx: { type: 'number', description: 'Starting X pixel coordinate within the screen image (0–1024).' },
            ny: { type: 'number', description: 'Starting Y pixel coordinate within the screen image (0–1024).' },
            endNx: { type: 'number', description: 'Ending X pixel coordinate within the screen image (0–1024).' },
            endNy: { type: 'number', description: 'Ending Y pixel coordinate within the screen image (0–1024).' },
        },
        required: ['nx', 'ny', 'endNx', 'endNy'],
    },
    execute: async ({ nx, ny, endNx, endNy }) => {
        const { operator } = getOperator();
        if (!operator.drag) return 'Error: drag not available with the current browser backend. Connect CDP external browser in Settings > Browser Bridge.';
        return operator.drag(Number(nx), Number(ny), Number(endNx), Number(endNy));
    },
},
{
    name: 'browser_upload_file',
    description: 'Upload a file to a file input element on the page. Provide the CSS selector of the <input type="file"> element, the base64-encoded file data, and a filename. Only works with CDP external browser connected (Settings > Browser Bridge). Use browser_read_structure first to find the file input element.',
    parameters: {
        type: 'object',
        properties: {
            cssSelector: { type: 'string', description: 'CSS selector for the file input element, e.g. "input[type=\"file\"]" or "#upload-input".' },
            data: { type: 'string', description: 'Base64-encoded file data.' },
            filename: { type: 'string', description: 'The visible filename, e.g. "image.png" or "document.pdf".' },
        },
        required: ['cssSelector', 'data', 'filename'],
    },
    execute: async ({ cssSelector, data, filename }) => {
        const { operator } = getOperator();
        if (!operator.uploadFile) return 'Error: file upload not available with the current browser backend. Connect CDP external browser in Settings > Browser Bridge.';
        return operator.uploadFile(String(cssSelector), String(data), String(filename));
    },
},
{
    name: 'browser_complete_task',
    description: 'Complete a multi-step browser task autonomously. The assistant will look at the screen, click buttons, type text, navigate pages, and scroll until the task is done. Provide a clear, specific goal. Requires the AI provider to be set to Gemini (vision analysis) and either screen sharing (in-app) or CDP external browser connection.',
    parameters: {
        type: 'object',
        properties: {
            goal: { type: 'string', description: 'What to accomplish, e.g. "Search for cats on Google Images and tell me the first result" or "Go to wikipedia and find the article about Mars".' },
        },
        required: ['goal'],
    },
    execute: async ({ goal }, ctx) => {
        const { VisionLoop } = await import('../visionLoop');
        const { getOperator } = await import('../browserOperatorResolver');
        const { operator, warning } = getOperator();

        // Check if operator can capture screenshots
        try {
            await operator.captureScreenshot();
        } catch {
            return 'Error: Cannot capture screenshots. For in-app mode, start screen sharing first. For CDP mode, connect to a browser tab in Settings > Browser Bridge.';
        }

        const loop = new VisionLoop(operator, ctx.settings, {
            onActivity: (text: string) => {
                appEventBus.emit('assistantFeedback', { type: 'activity', text });
            },
            onError: (err: string) => {
                appEventBus.emit('assistantFeedback', { type: 'error', text: err });
            },
        });

        const result = await loop.run(String(goal));
        const prefix = warning ? `(Note: ${warning})\n` : '';
        return prefix + result;
    },
  },
];
