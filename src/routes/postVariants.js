import { Router } from "express";
import { parseId } from "../http.js";
import {
  createManualVariant,
  generateVariants,
  listVariants,
} from "../services/variants.js";

export function postVariantsRouter(db) {
  const router = Router({ mergeParams: true });

  router.post("/generate", (req, res) => {
    const postId = parseId(req.params.id, "post id");
    const variants = generateVariants(db, postId, req.body?.platforms);
    res.status(201).json({ variants });
  });

  router.get("/", (req, res) => {
    const postId = parseId(req.params.id, "post id");
    res.json({ variants: listVariants(db, postId) });
  });

  router.post("/", (req, res) => {
    const postId = parseId(req.params.id, "post id");
    const variant = createManualVariant(db, postId, req.body);
    res.status(201).json(variant);
  });

  return router;
}
