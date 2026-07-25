import React from 'react';
import { getErrorCode, getSuggestion, isRetryable } from '../utils/errorHandler';
import { AlertTriangleIcon } from './icons';

export interface ErrorDisplayProps {
  /** The error value (Error, AppError, string, etc.) */
  error: unknown;
  /** Optional heading above the error message */
  title?: string;
  /** Called when the user clicks Retry (only shown if the error is retryable) */
  onRetry?: () => void;
  /** Called when the user clicks Dismiss */
  onDismiss?: () => void;
  /** Additional CSS classes for the outer container */
  className?: string;
}

/**
 * Reusable error display with icon, type badge, human-readable message,
 * suggestion, and optional Retry / Dismiss buttons.
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  title,
  onRetry,
  onDismiss,
  className = '',
}) => {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const code = getErrorCode(error);
  const suggestion = getSuggestion(error);
  const showRetry = isRetryable(error) && !!onRetry;

  return (
    <div
      role="alert"
      className={`border border-error/20 bg-error/5 p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="text-error shrink-0 mt-0.5" aria-hidden="true">
          <AlertTriangleIcon />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {title && (
            <h3 className="text-sm font-black uppercase tracking-wider text-error mb-1">
              {title}
            </h3>
          )}

          <p className="text-xs font-mono text-base-content/80 break-words">
            {message}
          </p>

          {suggestion && (
            <p className="text-xs text-base-content/50 mt-2 italic">
              {suggestion}
            </p>
          )}

          {(showRetry || onDismiss) && (
            <div className="mt-3 flex items-center gap-2">
              {showRetry && (
                <button
                  onClick={onRetry}
                  className="form-btn text-xs px-3 py-1"
                >
                  Retry
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="form-btn text-xs px-3 py-1 opacity-60 hover:opacity-100"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>

        {/* Error code badge */}
        <span
          className="text-[10px] font-mono font-bold uppercase tracking-widest text-error/40 px-2 py-0.5 border border-error/10 shrink-0"
          aria-label={`Error code: ${code}`}
        >
          {code}
        </span>
      </div>
    </div>
  );
};
