/**
 * ReconnectManager — Exponential backoff reconnection for WebSocket / live sessions.
 *
 * Usage:
 *   const rm = new ReconnectManager({
 *     maxRetries: 5,
 *     baseDelayMs: 1000,
 *     onAttempt: (attempt, delay) => handlers.onStatus('connecting', `Reconnecting (${attempt}/${maxRetries})…`),
 *     onSuccess: () => handlers.onStatus('live'),
 *     onFailure: () => handlers.onStatus('error', 'Connection lost. Reconnection failed.'),
 *   });
 *   // When connection drops unexpectedly:
 *   rm.start(() => live.connect(settings, handlers));
 *   // When connection is intentionally closed:
 *   rm.cancel();
 *   // When connected successfully (called by the connect function):
 *   rm.reportSuccess();
 */

export interface ReconnectOptions {
  /** Maximum number of reconnection attempts. Default: 5. */
  maxRetries?: number;
  /** Base delay in ms before the first retry. Doubled each attempt. Default: 1000. */
  baseDelayMs?: number;
  /** Maximum delay in ms between retries. Default: 30_000. */
  maxDelayMs?: number;
  /** Called before each reconnection attempt. */
  onAttempt?: (attempt: number, delayMs: number) => void;
  /** Called when reconnection succeeds. */
  onSuccess?: () => void;
  /** Called when all retries are exhausted. */
  onFailure?: (message: string) => void;
}

export class ReconnectManager {
  private maxRetries: number;
  private baseDelayMs: number;
  private maxDelayMs: number;
  private onAttempt?: (attempt: number, delayMs: number) => void;
  private onSuccess?: () => void;
  private onFailure?: (message: string) => void;

  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cancelled = false;
  private connecting = false;

  constructor(opts: ReconnectOptions = {}) {
    this.maxRetries = opts.maxRetries ?? 5;
    this.baseDelayMs = opts.baseDelayMs ?? 1000;
    this.maxDelayMs = opts.maxDelayMs ?? 30_000;
    this.onAttempt = opts.onAttempt;
    this.onSuccess = opts.onSuccess;
    this.onFailure = opts.onFailure;
  }

  /**
   * Start the reconnection loop. Call when a connection drops unexpectedly.
   * @param connectFn An async function that attempts to reconnect.
   */
  start(connectFn: () => Promise<void>): void {
    if (this.cancelled || this.connecting) return;
    this.attempt = 0;
    this.connecting = true;
    this.scheduleNext(connectFn);
  }

  /**
   * Cancel any pending reconnection and reset state.
   * Call when the connection is intentionally closed by the user.
   */
  cancel(): void {
    this.cancelled = true;
    this.connecting = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Reset the reconnection state (cancelled flag, attempt count).
   * Call after a successful connection is established.
   */
  reset(): void {
    this.cancelled = false;
    this.connecting = false;
    this.attempt = 0;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Mark the current connection attempt as successful.
   * Call from the connect function after a successful connection.
   */
  reportSuccess(): void {
    this.cancelled = false;
    this.connecting = false;
    this.attempt = 0;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Whether the manager is currently in a reconnection cycle. */
  get isReconnecting(): boolean {
    return this.connecting || this.timer !== null;
  }

  /** Current reconnection attempt number (0 = not reconnecting). */
  get currentAttempt(): number {
    return this.attempt;
  }

  private scheduleNext(connectFn: () => Promise<void>): void {
    if (this.cancelled) return;
    this.attempt++;

    if (this.attempt > this.maxRetries) {
      this.connecting = false;
      this.onFailure?.(`Reconnection failed after ${this.maxRetries} attempts.`);
      return;
    }

    // Exponential backoff: baseDelay * 2^(attempt-1), capped at maxDelay, with jitter
    const delay = Math.min(
      this.baseDelayMs * Math.pow(2, this.attempt - 1),
      this.maxDelayMs,
    );
    const jitter = delay * (0.5 + Math.random() * 0.5); // 50-100% of calculated delay
    const actualDelay = Math.round(jitter);

    this.onAttempt?.(this.attempt, actualDelay);

    this.timer = setTimeout(async () => {
      this.timer = null;
      if (this.cancelled) return;
      this.connecting = true;

      try {
        await connectFn();
        if (!this.cancelled) {
          this.reportSuccess();
          this.onSuccess?.();
        }
      } catch {
        // Connection failed — schedule next retry
        this.connecting = false;
        this.scheduleNext(connectFn);
      }
    }, actualDelay);
  }
}
