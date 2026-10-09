import { config } from "./config.js";
import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { createPublisherRegistry } from "./adapters/registry.js";
import { createScheduler } from "./services/scheduler.js";

const db = openDb(config.databasePath);
const registry = createPublisherRegistry({ db, config });
const app = createApp(db, registry);
const scheduler = createScheduler({
  db,
  registry,
  intervalMs: config.schedulerIntervalMs,
  staleClaimMs: config.schedulerStaleClaimMs,
});

app.listen(config.port, () => {
  console.log(`Social Media Studio listening on port ${config.port}`);
});

if (config.schedulerEnabled) {
  scheduler.start().catch((error) => {
    console.error(`scheduler failed to start: ${error.message}`);
  });
}

async function shutdown() {
  await scheduler.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
