// ── AppError class hierarchy ──

/**
 * Base application error with structured metadata (code, suggestion, retryable).
 * All consumer-facing errors in the app should use or extend AppError.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'UNKNOWN_ERROR',
    public readonly suggestion?: string,
    public readonly retryable?: boolean,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Network-related failures (fetch failed, timeout, CORS). */
export class NetworkError extends AppError {
  constructor(
    message: string,
    code = 'NETWORK_ERROR',
    suggestion?: string,
    retryable = true,
  ) {
    super(message, code, suggestion, retryable);
    this.name = 'NetworkError';
  }
}

/** Authentication / authorization failures. */
export class AuthError extends AppError {
  constructor(
    message: string,
    code = 'AUTH_ERROR',
    suggestion?: string,
    retryable = false,
  ) {
    super(message, code, suggestion, retryable);
    this.name = 'AuthError';
  }
}

/** AI provider failures (model error, bad request, content blocked). */
export class ProviderError extends AppError {
  constructor(
    message: string,
    code = 'PROVIDER_ERROR',
    suggestion?: string,
    retryable = true,
  ) {
    super(message, code, suggestion, retryable);
    this.name = 'ProviderError';
  }
}

/** Storage / file system failures. */
export class StorageError extends AppError {
  constructor(
    message: string,
    code = 'STORAGE_ERROR',
    suggestion?: string,
    retryable = false,
  ) {
    super(message, code, suggestion, retryable);
    this.name = 'StorageError';
  }
}

// ── Error classification helpers ──

interface ErrorPattern {
  test: (e: Error) => boolean;
  code: string;
  suggestion: string;
  retryable: boolean;
}

const KNOWN_PATTERNS: ErrorPattern[] = [
  {
    test: (e) => /failed to fetch|networkerror|network error/i.test(e.message),
    code: 'NETWORK_ERROR',
    suggestion: 'Check your network connection and ensure the service is running.',
    retryable: true,
  },
  {
    test: (e) => /api key not valid|api key is missing|unauthorized|invalid key/i.test(e.message),
    code: 'AUTH_ERROR',
    suggestion: 'Add a valid API key in Settings > LLM.',
    retryable: false,
  },
  {
    test: (e) => /quota|rate limit|too many requests|exceeded.*limit/i.test(e.message),
    code: 'RATE_LIMIT',
    suggestion: 'You have exceeded your API quota. Wait before retrying.',
    retryable: true,
  },
  {
    test: (e) => /timeout|timed out/i.test(e.message),
    code: 'TIMEOUT',
    suggestion: 'The request timed out. Try again or use a smaller input.',
    retryable: true,
  },
  {
    test: (e) => /content.*blocked|safety/i.test(e.message),
    code: 'CONTENT_BLOCKED',
    suggestion: 'The request was blocked by safety filters. Modify your input and try again.',
    retryable: false,
  },
  {
    test: (e) => /json|parse|invalid response/i.test(e.message),
    code: 'PARSE_ERROR',
    suggestion: 'The service returned an unreadable response. Try again.',
    retryable: true,
  },
];

/**
 * Return a stable error code for any error value.
 * Returns the AppError.code for AppError instances, matches known patterns
 * for plain Errors, and falls back to 'UNKNOWN_ERROR'.
 */
export function getErrorCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  if (error instanceof Error) {
    for (const pattern of KNOWN_PATTERNS) {
      if (pattern.test(error)) return pattern.code;
    }
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Return a human-readable suggestion for any error value, or undefined.
 */
export function getSuggestion(error: unknown): string | undefined {
  if (error instanceof AppError && error.suggestion) return error.suggestion;
  if (error instanceof Error) {
    for (const pattern of KNOWN_PATTERNS) {
      if (pattern.test(error)) return pattern.suggestion;
    }
  }
  return undefined;
}

/**
 * Return whether an error is safe to retry.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof AppError && error.retryable !== undefined) return error.retryable;
  if (error instanceof Error) {
    for (const pattern of KNOWN_PATTERNS) {
      if (pattern.test(error)) return pattern.retryable;
    }
  }
  return false;
}

export const handleGeminiError = (error: unknown, context: string): Error => {
  console.error(`Error during API call for ${context}:`, error);

  let errorMessage = `An unknown error occurred while ${context}.`;
  
  if (error instanceof Error) {
    const lowerCaseMessage = error.message.toLowerCase();

    if (lowerCaseMessage.includes("failed to fetch") || lowerCaseMessage.includes("networkerror")) {
        if (context.toLowerCase().includes("ollama")) {
            errorMessage = `A network error occurred while ${context}. Ensure OLLAMA_ORIGINS="*" is set and Ollama is running locally. If your site is on HTTPS, browsers block local HTTP calls (Mixed Content), so please use the desktop app or standard API.`;
        } else if (context.toLowerCase().includes("gemini")) {
            errorMessage = `A network error occurred while ${context}. Please verify your network connection, ensure you have set a valid Gemini API Key, and try again.`;
        } else {
            errorMessage = `A network error occurred while ${context}. Please ensure your API/Ollama target is reachable and your configuration is correct.`;
        }
    } else if (lowerCaseMessage.includes("api key not valid") || lowerCaseMessage.includes("api key is missing")) {
      errorMessage = "The API key is invalid or missing. Add a valid Gemini API Key in Setup -> LLM -> Gemini API Key.";
    } else if (lowerCaseMessage.includes("content is blocked") || lowerCaseMessage.includes("safety")) {
      errorMessage = `The request for ${context} was blocked due to safety settings. Please modify your input and try again.`;
    } else if (lowerCaseMessage.includes("quota")) {
      errorMessage = "You have exceeded your API quota. Please check your usage and limits.";
    } else if (lowerCaseMessage.includes("400") || lowerCaseMessage.includes("could not be parsed") || lowerCaseMessage.includes("does not exist or is not publicly accessible")) {
        errorMessage = `The AI model could not process the provided resource. Please ensure it is correct and publicly accessible.`;
    } else if (lowerCaseMessage.includes("application/json is not supported")) {
        errorMessage = `The AI model configuration is incorrect. It may not support JSON output with the current settings.`;
    } else if (lowerCaseMessage.includes("json")) {
        errorMessage = `The AI returned an invalid response that could not be read. Please try again.`;
    }
    else {
      errorMessage = `Failed to ${context}: ${error.message}`;
    }
  }
  else {
    errorMessage = `Failed to ${context}: ${String(error)}`;
  }
  
  return new Error(errorMessage);
};
