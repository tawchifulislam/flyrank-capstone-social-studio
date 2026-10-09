import { config } from "./config.js";
import { openDb } from "./db.js";
import { createApp } from "./app.js";

const db = openDb(config.databasePath);
const app = createApp(db);

app.listen(config.port, () => {
  console.log(`Social Media Studio listening on port ${config.port}`);
});
