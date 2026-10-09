import express from "express";
import { postsRouter } from "./routes/posts.js";
import { postVariantsRouter } from "./routes/postVariants.js";
import { variantsRouter } from "./routes/variants.js";

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/posts", postsRouter(db));
  app.use("/posts/:id/variants", postVariantsRouter(db));
  app.use("/variants", variantsRouter(db));

  app.use((req, res) => {
    res.status(404).json({ error: "route not found" });
  });

  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "invalid JSON body" });
    }
    const status = Number.isInteger(err.status) ? err.status : 500;
    if (status >= 500) {
      console.error(err);
      return res.status(status).json({ error: "internal error" });
    }
    res.status(status).json({ error: err.message });
  });

  return app;
}
