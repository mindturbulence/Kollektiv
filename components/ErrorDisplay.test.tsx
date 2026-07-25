import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorDisplay } from './ErrorDisplay';
import { AppError, NetworkError, AuthError } from '../utils/errorHandler';

describe('ErrorDisplay', () => {
  it('renders the error message from an Error object', () => {
    render(<ErrorDisplay error={new Error('Something went wrong')} />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('renders the error message from a string', () => {
    render(<ErrorDisplay error={'plain string error'} />);
    expect(screen.getByText('plain string error')).toBeTruthy();
  });

  it('renders the error code badge for known patterns', () => {
    render(<ErrorDisplay error={new Error('Failed to fetch')} />);
    expect(screen.getByText('NETWORK_ERROR')).toBeTruthy();
  });

  it('renders the error code badge from AppError', () => {
    render(<ErrorDisplay error={new AppError('x', 'MY_CODE')} />);
    expect(screen.getByText('MY_CODE')).toBeTruthy();
  });

  it('renders a suggestion when available', () => {
    render(
      <ErrorDisplay
        error={new AuthError('invalid key', 'AUTH_ERROR', 'Add your API key in Settings')}
      />,
    );
    expect(screen.getByText('Add your API key in Settings')).toBeTruthy();
  });

  it('renders the title when provided', () => {
    render(<ErrorDisplay error={new Error('x')} title="API Error" />);
    expect(screen.getByText('API Error')).toBeTruthy();
  });

  it('shows Retry button only when error is retryable and onRetry is provided', () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <ErrorDisplay error={new NetworkError('boom')} onRetry={onRetry} />,
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();

    // Non-retryable error should not show Retry
    rerender(
      <ErrorDisplay error={new AuthError('boom')} onRetry={onRetry} />,
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('calls onRetry when Retry is clicked', () => {
    const onRetry = vi.fn();
    render(<ErrorDisplay error={new NetworkError('boom')} onRetry={onRetry} />);
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows Dismiss button when onDismiss is provided', () => {
    const onDismiss = vi.fn();
    render(<ErrorDisplay error={new Error('x')} onDismiss={onDismiss} />);
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    screen.getByRole('button', { name: 'Dismiss' }).click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('has role="alert" for accessibility', () => {
    const { container } = render(<ErrorDisplay error={new Error('x')} />);
    const alerts = container.querySelectorAll('[role="alert"]');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  it('renders UNKNOWN_ERROR code for unrecognized errors', () => {
    render(<ErrorDisplay error={42} />);
    const badges = screen.getAllByText('UNKNOWN_ERROR');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders default message when error is null', () => {
    render(<ErrorDisplay error={null} />);
    expect(screen.getByText('Unknown error')).toBeTruthy();
  });
});
