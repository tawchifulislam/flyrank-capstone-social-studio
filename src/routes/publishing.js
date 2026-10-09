import { Router } from "express";
import { parseId } from "../http.js";
import { publishSlot } from "../services/publisher.js";
import { listHistory } from "../repositories/attempts.js";

const STATUS_BY_OUTCOME = {
  published: 201,
  already_published: 200,
  retry: 503,
  failed: 502,
  in_progress: 409,
  not_pending: 409,
  not_approved: 409,
};

export function publishingRouter(db, registry) {
  const router = Router();

  router.post("/slots/:id/publish", async (req, res) => {
    const id = parseId(req.params.id, "slot id");
    const result = await publishSlot(db, registry, id);
    res.status(STATUS_BY_OUTCOME[result.outcome] ?? 500).json(result);
  });

  router.get("/publish-history", (req, res) => {
    const requested = Number(req.query.limit);
    const limit = Math.min(Math.max(Number.isInteger(requested) ? requested : 50, 1), 200);
    res.json({ attempts: listHistory(db, limit) });
  });

  return router;
}
