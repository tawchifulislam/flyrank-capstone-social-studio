import { TelegramPublisher } from "./TelegramPublisher.js";
import { MockXPublisher, MockLinkedInPublisher } from "./mock.js";

const factories = {
  telegram: ({ config }) =>
    new TelegramPublisher({
      token: config.telegramBotToken,
      chatId: config.telegramChatId,
    }),
  mock_x: ({ db }) => new MockXPublisher(db),
  mock_linkedin: ({ db }) => new MockLinkedInPublisher(db),
};

export function createPublisherRegistry({ db, config }) {
  const cache = new Map();

  function adapterName(platform) {
    const name = config.adapterByPlatform[platform];
    if (!name) {
      throw new Error(`no adapter configured for platform ${platform}`);
    }
    return name;
  }

  function forPlatform(platform) {
    const name = adapterName(platform);
    if (!cache.has(name)) {
      const factory = factories[name];
      if (!factory) {
        throw new Error(`unknown adapter "${name}"`);
      }
      cache.set(name, factory({ db, config }));
    }
    return cache.get(name);
  }

  return { forPlatform, adapterName };
}
