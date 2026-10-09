import { config } from "../src/config.js";
import { TelegramPublisher } from "../src/adapters/TelegramPublisher.js";

try {
  const publisher = new TelegramPublisher({
    token: config.telegramBotToken,
    chatId: config.telegramChatId,
  });
  const result = await publisher.publish({
    variantId: 0,
    text: `Social Media Studio smoke test ${new Date().toISOString()}`,
    idempotencyKey: "smoke",
  });
  console.log(result);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
