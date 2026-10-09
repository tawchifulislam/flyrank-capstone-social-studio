import { HttpError } from "../errors.js";
import { profiles } from "../profiles.js";

export function textLength(text) {
  return Array.from(text).length;
}

export function countHashtags(text) {
  return (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}

export function assertKnownPlatform(platform) {
  if (typeof platform !== "string" || !Object.hasOwn(profiles, platform)) {
    throw new HttpError(400, `unknown platform "${platform}"`);
  }
}

export function validateVariant(platform, text) {
  const profile = profiles[platform];
  const violations = [];
  if (typeof text !== "string" || !text.trim()) {
    violations.push({
      rule: "empty_text",
      message: "rule empty_text broken: text is empty",
    });
    return violations;
  }
  const length = textLength(text);
  if (length > profile.maxLength) {
    violations.push({
      rule: "max_length",
      message: `rule max_length broken: text has ${length} characters, ${platform} allows ${profile.maxLength}`,
    });
  }
  const hashtags = countHashtags(text);
  if (hashtags > profile.maxHashtags) {
    violations.push({
      rule: "max_hashtags",
      message: `rule max_hashtags broken: text has ${hashtags} hashtags, ${platform} allows ${profile.maxHashtags}`,
    });
  }
  return violations;
}

export function assertVariantValid(platform, text) {
  assertKnownPlatform(platform);
  const violations = validateVariant(platform, text);
  if (violations.length > 0) {
    throw new HttpError(422, violations.map((v) => v.message).join("; "));
  }
}
