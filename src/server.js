import { config } from "./config.js";
import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { createPublisherRegistry } from "./adapters/registry.js";

const db = openDb(config.databasePath);
const registry = createPublisherRegistry({ db, config });
const app = createApp(db, registry);

app.listen(config.port, () => {
  console.log(`Social Media Studio listening on port ${config.port}`);
});
