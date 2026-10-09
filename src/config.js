import "dotenv/config";

export const config = {
  port: Number(process.env.PORT) || 3000,
  databasePath: process.env.DATABASE_PATH || "./data/studio.db",
  publishAdapter: process.env.PUBLISH_ADAPTER || "telegram",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
};
