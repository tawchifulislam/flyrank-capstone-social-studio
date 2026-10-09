import { Router } from "express";
import { parseId } from "../http.js";
import {
  approveVariant,
  editVariant,
  getVariantById,
  rejectVariant,
  scheduleVariant,
} from "../services/review.js";

export function variantsRouter(db) {
  const router = Router();

  router.get("/:id", (req, res) => {
    res.json(getVariantById(db, parseId(req.params.id, "variant id")));
  });

  router.patch("/:id", (req, res) => {
    const id = parseId(req.params.id, "variant id");
    res.json(editVariant(db, id, req.body?.text));
  });

  router.post("/:id/approve", (req, res) => {
    const id = parseId(req.params.id, "variant id");
    res.json(approveVariant(db, id));
  });

  router.post("/:id/reject", (req, res) => {
    const id = parseId(req.params.id, "variant id");
    res.json(rejectVariant(db, id, req.body?.reason));
  });

  router.post("/:id/schedule", (req, res) => {
    const id = parseId(req.params.id, "variant id");
    const { slot, created } = scheduleVariant(db, id, req.body?.scheduledAt);
    res.status(created ? 201 : 200).json(slot);
  });

  return router;
}
