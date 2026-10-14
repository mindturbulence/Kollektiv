import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PromptText from './PromptText';

afterEach(cleanup);

describe('PromptText', () => {
  it('renders a single line as one quoted paragraph', () => {
    const { container } = render(<PromptText text="A neon city at dusk" />);
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.textContent).toContain('A neon city at dusk');
  });

  it('splits paragraphs and pins timestamp labels in their own element', () => {
    const text = '9:16 cinematic video. Total duration 6 seconds.\n0–3s: she walks\n3–6s: she stops\n\nVisual Style: grainy, warm';
    const { container } = render(<PromptText text={text} />);
    expect(screen.getByText('0–3s')).toBeTruthy();
    expect(screen.getByText('3–6s')).toBeTruthy();
    expect(screen.getByText('she walks')).toBeTruthy();
    expect(container.children[0].children).toHaveLength(2); // two paragraph blocks
  });

  it('bolds section labels such as Visual Style', () => {
    render(<PromptText text={'line one\nVisual Style: grainy'} />);
    expect(screen.getByText('Visual Style:').className).toContain('font-bold');
  });
});
