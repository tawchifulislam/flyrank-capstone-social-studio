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
};
