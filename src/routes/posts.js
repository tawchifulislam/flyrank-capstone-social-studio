import { Router } from "express";
import { ingestPost } from "../services/ingest.js";
import { getPost } from "../repositories/posts.js";
import { HttpError } from "../errors.js";

export function postsRouter(db) {
  const router = Router();

  router.post("/", async (req, res) => {
    const post = await ingestPost(db, req.body ?? {});
    res.status(201).json(post);
  });

  router.get("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      throw new HttpError(400, "id must be a positive integer");
    }
    const post = getPost(db, id);
    if (!post) {
      throw new HttpError(404, "post not found");
    }
    res.json(post);
  });

  return router;
}
