import { afterEach, vi } from 'vitest';
import React from 'react';
import { cleanup } from '@testing-library/react';

// vitest runs without `globals`, so RTL's auto-cleanup never registers. Unmount after every test, otherwise the
// last render of a file stays mounted and its timers fire after the environment is torn down (flaky
// "window is not defined" unhandled errors that fail `pnpm test` and the pre-push hook).
afterEach(cleanup);

vi.mock('thinking-orbs', () => ({
    ThinkingOrb: ({ state, size }: { state?: string; size?: number }) =>
        React.createElement('div', { 'data-testid': 'thinking-orb', 'data-state': state, 'data-size': size }),
}));
