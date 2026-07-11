import { describe, it, expect } from 'vitest';
import { parseActionBlock, visibleText } from './assistantProtocol';

describe('parseActionBlock', () => {
    it('extracts a valid action block', () => {
        const text = 'Let me check.\n<action>{"tool": "search_prompts", "args": {"query": "cats"}}</action>';
        expect(parseActionBlock(text)).toEqual({ tool: 'search_prompts', args: { query: 'cats' } });
    });
    it('defaults args to {} when omitted', () => {
        expect(parseActionBlock('<action>{"tool": "list_wildcards"}</action>')).toEqual({ tool: 'list_wildcards', args: {} });
    });
    it('returns null when there is no block', () => {
        expect(parseActionBlock('Just a normal answer.')).toBeNull();
    });
    it('returns null on malformed JSON', () => {
        expect(parseActionBlock('<action>{tool: broken}</action>')).toBeNull();
    });
    it('returns null when tool name is missing', () => {
        expect(parseActionBlock('<action>{"args": {}}</action>')).toBeNull();
    });
});

describe('visibleText', () => {
    it('passes plain text through', () => {
        expect(visibleText('hello world')).toBe('hello world');
    });
    it('cuts everything from the action block onward', () => {
        expect(visibleText('Answer.\n<action>{"tool":"x"}</action>')).toBe('Answer.\n');
    });
    it('holds back a trailing partial "<action>" prefix during streaming', () => {
        expect(visibleText('Answer. <act')).toBe('Answer. ');
        expect(visibleText('Answer. <')).toBe('Answer. ');
    });
    it('does not hold back a "<" that cannot start an action tag', () => {
        expect(visibleText('a < b')).toBe('a < b');
    });
});
