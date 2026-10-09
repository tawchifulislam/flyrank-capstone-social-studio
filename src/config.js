import "dotenv/config";

export const config = {
  port: Number(process.env.PORT) || 3000,
  databasePath: process.env.DATABASE_PATH || "./data/studio.db",
  adapterByPlatform: {
    telegram: process.env.ADAPTER_TELEGRAM || "telegram",
    x: process.env.ADAPTER_X || "mock_x",
    linkedin: process.env.ADAPTER_LINKEDIN || "mock_linkedin",
  },
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  schedulerEnabled: process.env.SCHEDULER_ENABLED !== "false",
  schedulerIntervalMs: Number(process.env.SCHEDULER_INTERVAL_MS) || 5000,
  schedulerStaleClaimMs: Number(process.env.SCHEDULER_STALE_CLAIM_MS) || 60000,
  mockPublishDelayMs: Number(process.env.MOCK_PUBLISH_DELAY_MS) || 0,
  mockCrashAfterPost: process.env.MOCK_CRASH_AFTER_POST === "true",
};
