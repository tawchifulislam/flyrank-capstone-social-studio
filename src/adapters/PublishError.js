export class PublishError extends Error {
  constructor(message, { retryable = false, retryAfterMs = null } = {}) {
    super(message);
    this.name = "PublishError";
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}
