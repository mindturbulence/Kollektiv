import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CurveEditor from './CurveEditor';

const POINTS = [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }];

afterEach(cleanup);

describe('CurveEditor keyboard', () => {
  it('moves a point with arrows (Shift = coarse) and keeps endpoints fixed in x', () => {
    const onChange = vi.fn();
    render(<CurveEditor points={POINTS} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText(/Curve point 2/), { key: 'ArrowUp', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith([POINTS[0], { x: 0.5, y: 0.6 }, POINTS[2]]);
    onChange.mockClear();
    fireEvent.keyDown(screen.getByLabelText(/Curve point 1/), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes a middle point and adds a midpoint', () => {
    const onChange = vi.fn();
    render(<CurveEditor points={POINTS} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText(/Curve point 2/), { key: 'Delete' });
    expect(onChange).toHaveBeenLastCalledWith([POINTS[0], POINTS[2]]);
    fireEvent.keyDown(screen.getByLabelText(/Curve point 1/), { key: '+' });
    expect(onChange).toHaveBeenLastCalledWith([POINTS[0], { x: 0.25, y: 0.25 }, POINTS[1], POINTS[2]]);
  });
});
