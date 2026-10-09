import { profiles } from "../../profiles.js";
import { textLength } from "../validation.js";

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "because",
  "before",
  "being",
  "could",
  "every",
  "from",
  "have",
  "into",
  "more",
  "most",
  "other",
  "should",
  "their",
  "there",
  "these",
  "this",
  "that",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your",
]);

function toPlain(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+.*$/gm, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*+>]\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function hashtagsFor(title, max) {
  const words = title.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const tags = [];
  for (const word of words) {
    if (word.length < 4 || STOPWORDS.has(word)) continue;
    const tag = `#${word[0].toUpperCase()}${word.slice(1)}`;
    if (!tags.includes(tag)) tags.push(tag);
    if (tags.length === max) break;
  }
  return tags;
}

function fit(build, summary, max) {
  let current = summary;
  for (let i = 0; i < 20; i++) {
    const text = build(current);
    const over = textLength(text) - max;
    if (over <= 0) return text;
    const chars = Array.from(current);
    if (chars.length <= over + 1) {
      if (current === "") break;
      current = "";
      continue;
    }
    const cut = chars.slice(0, chars.length - over - 1).join("");
    const atWord = cut.includes(" ") ? cut.slice(0, cut.lastIndexOf(" ")) : cut;
    current = `${atWord.replace(/[\s.,;:!?-]+$/, "")}…`;
  }
  return `${Array.from(build("")).slice(0, max - 1).join("")}…`;
}

const builders = {
  telegram(post, sentences, tags, link) {
    const summary = sentences.slice(0, 2).join(" ") || post.title;
    return (s) =>
      [`New post: ${post.title}`, s, link, tags.join(" ")]
        .filter(Boolean)
        .join("\n\n");
  },
  x(post, sentences, tags, link) {
    return (s) => [s, link, tags.join(" ")].filter(Boolean).join("\n");
  },
  linkedin(post, sentences, tags, link) {
    return (s) =>
      [post.title, s, link ? `Read the full post: ${link}` : "", tags.join(" ")]
        .filter(Boolean)
        .join("\n\n");
  },
};

const summaries = {
  telegram: (post, sentences) => sentences.slice(0, 2).join(" ") || post.title,
  x: (post, sentences) => sentences[0] || post.title,
  linkedin: (post, sentences) => sentences.slice(0, 4).join(" ") || post.title,
};

export function generateTemplateVariant(post, platform) {
  const profile = profiles[platform];
  const sentences = splitSentences(toPlain(post.body));
  const tags = hashtagsFor(post.title, profile.maxHashtags);
  const link = post.source_url ?? "";
  const build = builders[platform](post, sentences, tags, link);
  const summary = summaries[platform](post, sentences);
  return fit(build, summary, profile.maxLength);
}
