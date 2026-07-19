/** Curated, battle-tested MCP servers offered on Settings > MCP Servers > Predefined.
 *  Each preset maps to a single McpServerConfig entry (tagged with `presetId`)
 *  in the same settings.mcpServers array the Custom tab manages — the tool
 *  loader (services/mcpAssistantTools.ts) doesn't distinguish origin at all. */

export interface McpPreset {
    id: string;
    name: string;
    description: string;
    /** True if the server needs an API key to function at all. */
    needsApiKey: boolean;
    /** Hosted, remote servers: build the connection URL from the user's API key.
     *  Kollektiv sends no extra auth — the key is already embedded in the URL. */
    buildUrl?: (apiKey: string) => string;
    /** Local servers: the default URL once the user has the local process running.
     *  Kollektiv connects with no auth header — the key (if any) configures the
     *  LOCAL process the user launches, not a header Kollektiv sends. */
    defaultUrl?: string;
    /** Local servers only: the command to run, with {apiKey} as a placeholder
     *  substituted from the user's input before showing/copying it. */
    launchCommand?: string;
    /** Short note shown under the launch command (API key source, caveats). */
    launchNotes?: string;
}

export const MCP_PRESETS: McpPreset[] = [
    {
        id: 'firecrawl',
        name: 'Firecrawl',
        description: 'Web scraping and search that handles JS-rendered pages. Hosted — no local process required.',
        needsApiKey: true,
        buildUrl: (apiKey) => `https://mcp.firecrawl.dev/${apiKey}/v2/mcp`,
        launchNotes: 'Get a free API key at firecrawl.dev — paste it below, no local setup needed.',
    },
    {
        id: 'brave-search',
        name: 'Brave Search',
        description: 'Web, image, video, news, and local search via the official Brave Search API.',
        needsApiKey: true,
        defaultUrl: 'http://127.0.0.1:8080/mcp',
        launchCommand: 'set BRAVE_API_KEY={apiKey} && npx -y @brave/brave-search-mcp-server --transport http',
        launchNotes: 'Free API key at api-dashboard.search.brave.com. Runs locally — leave the command running in a terminal, then Ping to verify.',
    },
    {
        id: 'playwright',
        name: 'Playwright',
        description: 'Official Microsoft browser automation — navigate, click, screenshot, extract content.',
        needsApiKey: false,
        defaultUrl: 'http://localhost:8931/mcp',
        launchCommand: 'npx @playwright/mcp@latest --port 8931',
        launchNotes: 'No API key needed. Runs locally — leave the command running in a terminal, then Ping to verify.',
    },
];
