/**
 * Session Logger — writes conversation turns to the Obsidian vault
 * at `assistant/sessions/YYYY-MM-DD.md`. One markdown file per day,
 * each turn appended as a new heading section.
 *
 * User-visible in Obsidian: readable markdown with timestamps and
 * alternating User/Assistant entries.
 */

const SESSION_DIR = 'assistant/sessions';

/** Format a millisecond timestamp as HH:MM. */
function fmtTime(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Build the daily session file path for a given date. */
function dailyPath(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${SESSION_DIR}/${y}-${m}-${d}.md`;
}

/**
 * Append a single conversation turn to today's session log.
 * @param userMessage  The user's message text.
 * @param assistantResponse  The assistant's response text (can include tool results).
 * @param metadata  Optional extra metadata like tool names used.
 */
export async function logConversationTurn(
    userMessage: string,
    assistantResponse: string,
    metadata?: { toolCalls?: string[]; turnIndex?: number },
): Promise<void> {
    const { fileSystemManager } = await import('./fileUtils');
    if (!fileSystemManager.isDirectorySelected()) return;

    const now = Date.now();
    const path = dailyPath();

    // Build the new turn block
    const lines: string[] = [];
    lines.push('');
    lines.push(`## Turn ${metadata?.turnIndex ?? '—'} (${fmtTime(now)})`);
    lines.push('');
    lines.push(`**User**: ${userMessage}`);
    lines.push('');
    lines.push(`**Assistant**: ${assistantResponse}`);
    if (metadata?.toolCalls?.length) {
        lines.push('');
        lines.push(`*Tools used: ${metadata.toolCalls.join(', ')}*`);
    }
    lines.push('');

    const turnBlock = lines.join('\n');

    // Try to read existing content, then append
    try {
        const existing = await fileSystemManager.readFile(path);
        const updated = existing
            ? existing.replace(/\n*$/, '') + turnBlock
            : `# Session: ${new Date().toISOString().slice(0, 10)}\n${turnBlock}`;
        await fileSystemManager.saveFile(
            path,
            new Blob([updated], { type: 'text/markdown' }),
        );
    } catch {
        // Vault not available — skip logging
    }
}

/**
 * Read today's (or a specific date's) session log content.
 * Returns the full markdown text, or null if no log exists.
 */
export async function readSessionLog(date?: Date): Promise<string | null> {
    const { fileSystemManager } = await import('./fileUtils');
    if (!fileSystemManager.isDirectorySelected()) return null;

    try {
        return await fileSystemManager.readFile(dailyPath(date ?? new Date()));
    } catch {
        return null;
    }
}

/**
 * Read a consolidated summary of the last N days' session logs.
 * Returns the raw markdown content of each day (truncated to conserve tokens).
 * @param days  Number of days to look back (default 7).
 */
export async function readRecentSessionSummaries(days = 7): Promise<string[]> {
    const { fileSystemManager } = await import('./fileUtils');
    if (!fileSystemManager.isDirectorySelected()) return [];

    const summaries: string[] = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const path = dailyPath(date);

        try {
            const content = await fileSystemManager.readFile(path);
            if (content) {
                // Truncate to first 2000 chars per day to save tokens
                const truncated = content.length > 2000
                    ? content.slice(0, 2000) + '\n\n*... (truncated) ...*'
                    : content;
                summaries.push(`--- ${date.toISOString().slice(0, 10)} ---\n${truncated}`);
            }
        } catch {
            // No log for this day — skip
        }
    }

    return summaries;
}
