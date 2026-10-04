import { vi } from 'vitest';
import React from 'react';

vi.mock('thinking-orbs', () => ({
    ThinkingOrb: ({ state, size }: { state?: string; size?: number }) =>
        React.createElement('div', { 'data-testid': 'thinking-orb', 'data-state': state, 'data-size': size }),
}));
