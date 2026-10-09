import { HttpError } from "../errors.js";
import { platformNames } from "../profiles.js";
import { getPost } from "../repositories/posts.js";
import {
  createVariant,
  deleteReplaceableVariants,
  listVariantsByPost,
} from "../repositories/variants.js";
import { assertKnownPlatform, assertVariantValid } from "./validation.js";
import { generateTemplateVariant } from "./generators/templates.js";

function requirePost(db, postId) {
  const post = getPost(db, postId);
  if (!post) {
    throw new HttpError(404, "post not found");
  }
  return post;
}

function resolvePlatforms(input) {
  if (input === undefined) return platformNames;
  if (!Array.isArray(input) || input.length === 0) {
    throw new HttpError(400, "platforms must be a non-empty array");
  }
  input.forEach(assertKnownPlatform);
  return [...new Set(input)];
}

export function generateVariants(db, postId, platformsInput) {
  const post = requirePost(db, postId);
  const platforms = resolvePlatforms(platformsInput);
  const generated = platforms.map((platform) => {
    const text = generateTemplateVariant(post, platform);
    assertVariantValid(platform, text);
    return { platform, text };
  });

  db.exec("BEGIN");
  try {
    const created = generated.map(({ platform, text }) => {
      deleteReplaceableVariants(db, postId, platform);
      return createVariant(db, { postId, platform, text });
    });
    db.exec("COMMIT");
    return created;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createManualVariant(db, postId, input) {
  requirePost(db, postId);
  const { platform, text } = input ?? {};
  assertVariantValid(platform, text);
  return createVariant(db, { postId, platform, text });
}

export function listVariants(db, postId) {
  requirePost(db, postId);
  return listVariantsByPost(db, postId);
}
