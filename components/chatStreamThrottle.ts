/**
 * Batches rapid successive text chunks into a single callback per
 * animation frame, instead of one callback per chunk. Used by the chat
 * streaming loop so a provider emitting many small tokens per second
 * doesn't trigger a React state update (and re-render) for each one.
 */
export function createChunkFlusher(onFlush: (accumulated: string) => void) {
    let buffer = '';
    let scheduled = false;

    const flush = () => {
        scheduled = false;
        if (buffer.length === 0) return;
        const toFlush = buffer;
        buffer = '';
        onFlush(toFlush);
    };

    return {
        push(chunk: string) {
            buffer += chunk;
            if (!scheduled) {
                scheduled = true;
                requestAnimationFrame(flush);
            }
        },
        /** Force any buffered text out immediately — call when the stream ends. */
        flushNow() {
            flush();
        },
    };
}
