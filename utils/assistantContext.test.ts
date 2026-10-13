import { describe, it, expect } from 'vitest';
import { setActivePage, getPageContext, describePageContext } from './assistantContext';

describe('assistantContext', () => {
    it('describes the current page', () => {
        setActivePage('refiner');
        expect(describePageContext()).toBe('The user is currently on the "refiner" page.');
    });

    it('remembers the last work page while on the assistant page', () => {
        setActivePage('gallery');
        setActivePage('assistant');
        expect(getPageContext()).toEqual({ page: 'assistant', workPage: 'gallery' });
        expect(describePageContext()).toBe('The user opened you from the "gallery" page.');
    });
});
