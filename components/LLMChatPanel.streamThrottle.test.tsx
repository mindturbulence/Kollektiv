import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChunkFlusher } from './chatStreamThrottle';

describe('createChunkFlusher', () => {
    let rafCallbacks: FrameRequestCallback[];
    beforeEach(() => {
        rafCallbacks = [];
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            rafCallbacks.push(cb);
            return rafCallbacks.length;
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    const flushRaf = () => {
        const cbs = rafCallbacks;
        rafCallbacks = [];
        cbs.forEach((cb) => cb(0));
    };

    it('does not call onFlush synchronously when a chunk is pushed', () => {
        const onFlush = vi.fn();
        const flusher = createChunkFlusher(onFlush);
        flusher.push('hello');
        expect(onFlush).not.toHaveBeenCalled();
    });

    it('batches multiple chunks pushed before the next animation frame into one flush', () => {
        const onFlush = vi.fn();
        const flusher = createChunkFlusher(onFlush);
        flusher.push('hel');
        flusher.push('lo ');
        flusher.push('world');
        flushRaf();
        expect(onFlush).toHaveBeenCalledTimes(1);
        expect(onFlush).toHaveBeenCalledWith('hello world');
    });

    it('starts a fresh accumulation after each flush', () => {
        const onFlush = vi.fn();
        const flusher = createChunkFlusher(onFlush);
        flusher.push('first');
        flushRaf();
        flusher.push('second');
        flushRaf();
        expect(onFlush).toHaveBeenNthCalledWith(1, 'first');
        expect(onFlush).toHaveBeenNthCalledWith(2, 'second');
    });
});
