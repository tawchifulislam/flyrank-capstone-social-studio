export class PublishError extends Error {
  constructor(message, { retryable = false, retryAfterMs = null, ambiguous = false } = {}) {
    super(message);
    this.name = "PublishError";
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.ambiguous = ambiguous;
  }
}
