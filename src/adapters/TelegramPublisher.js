import { SocialPublisher } from "./SocialPublisher.js";
import { PublishError } from "./PublishError.js";

export class TelegramPublisher extends SocialPublisher {
  constructor({
    token,
    chatId,
    fetchImpl = fetch,
    baseUrl = "https://api.telegram.org",
    timeoutMs = 10000,
  }) {
    super("telegram");
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is not set");
    }
    if (!chatId) {
      throw new Error("TELEGRAM_CHAT_ID is not set");
    }
    this.token = token;
    this.chatId = chatId;
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  async publish({ text }) {
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: this.chatId, text }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new PublishError("telegram request failed", { retryable: true });
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.ok && payload?.ok) {
      return {
        externalId: `${this.chatId}:${payload.result?.message_id}`,
        preview: text,
      };
    }

    const code = payload?.error_code ?? response.status;

    if (code === 429) {
      const fromBody = Number(payload?.parameters?.retry_after);
      const fromHeader = Number(response.headers.get("retry-after"));
      const seconds = Number.isFinite(fromBody)
        ? fromBody
        : Number.isFinite(fromHeader)
          ? fromHeader
          : null;
      throw new PublishError("telegram rate limit hit", {
        retryable: true,
        retryAfterMs: seconds === null ? null : seconds * 1000,
      });
    }

    if (code >= 500) {
      throw new PublishError(`telegram server error ${code}`, { retryable: true });
    }

    throw new PublishError(
      `telegram rejected the message: ${payload?.description ?? code}`,
      { retryable: false }
    );
  }
}
