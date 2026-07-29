import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MessageBubble, type ChatBubbleMessage } from './MessageBubble';

beforeEach(() => cleanup());

describe('MessageBubble', () => {
    const makeMsg = (overrides: Partial<ChatBubbleMessage> = {}): ChatBubbleMessage => ({
        id: overrides.id || 'test-id',
        role: overrides.role || 'assistant',
        content: overrides.content || '',
        ...overrides,
    });

    it('renders user message content', () => {
        const msg = makeMsg({ role: 'user', content: 'hello there' });
        render(<MessageBubble msg={msg} isTyping={false} />);
        expect(screen.getByText('hello there')).toBeTruthy();
    });

    it('renders assistant markdown content', () => {
        const msg = makeMsg({ role: 'assistant', content: '**bold text**' });
        render(<MessageBubble msg={msg} isTyping={false} />);
        expect(screen.getByText('bold text')).toBeTruthy();
    });

    it('shows the typing indicator only when isTyping is true and content is empty', () => {
        const { rerender } = render(<MessageBubble msg={makeMsg({ role: 'assistant', content: '' })} isTyping={true} />);
        expect(document.querySelector('.animate-bounce')).toBeTruthy();

        rerender(<MessageBubble msg={makeMsg({ role: 'assistant', content: '' })} isTyping={false} />);
        expect(document.querySelector('.animate-bounce')).toBeFalsy();
    });

    it('does not re-render when passed the same msg object reference and isTyping value', () => {
        const msg = makeMsg({ role: 'assistant', content: 'stable text' });
        const renderSpy = vi.fn();
        const Wrapped = (props: { msg: ChatBubbleMessage; isTyping: boolean }) => {
            renderSpy();
            return <MessageBubble {...props} />;
        };
        const { rerender } = render(<Wrapped msg={msg} isTyping={false} />);
        rerender(<Wrapped msg={msg} isTyping={false} />);
        expect(screen.getByText('stable text')).toBeTruthy();
    });
});
