import { HttpError } from "../errors.js";
import { createPost } from "../repositories/posts.js";

const MAX_BODY_LENGTH = 50000;

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "[::1]") return true;
  const match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function assertPublicUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new HttpError(400, "url is not valid");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new HttpError(400, "url must use http or https");
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new HttpError(400, "url points to a private address");
  }
  return parsed;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function htmlToText(html) {
  const scope = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
  const stripped = scope
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped)
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToTitle(html, fallback) {
  const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = raw ? decodeEntities(raw).replace(/\s+/g, " ").trim() : "";
  return title || fallback;
}

function markdownTitle(markdown, hint) {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  if (typeof hint === "string" && hint.trim()) return hint.trim().slice(0, 200);
  return markdown.split("\n")[0].trim().slice(0, 80);
}

async function fetchPage(rawUrl) {
  const parsed = assertPublicUrl(rawUrl);
  let response;
  try {
    response = await fetch(parsed, {
      signal: AbortSignal.timeout(10000),
      headers: { "user-agent": "SocialMediaStudio/0.1" },
    });
  } catch {
    throw new HttpError(502, "could not fetch url");
  }
  assertPublicUrl(response.url);
  if (!response.ok) {
    throw new HttpError(502, `url returned status ${response.status}`);
  }
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html") && !type.includes("text/plain")) {
    throw new HttpError(422, "url must return html or plain text");
  }
  const raw = await response.text();
  if (type.includes("text/plain")) {
    return { title: parsed.hostname, body: raw.trim() };
  }
  return { title: htmlToTitle(raw, parsed.hostname), body: htmlToText(raw) };
}

export async function ingestPost(db, input) {
  const { markdown, url, title } = input;
  let record;

  if (typeof markdown === "string" && markdown.trim()) {
    const body = markdown.trim();
    record = {
      sourceType: "markdown",
      sourceUrl: null,
      title: markdownTitle(body, title),
      body,
    };
  } else if (typeof url === "string" && url.trim()) {
    const page = await fetchPage(url.trim());
    record = {
      sourceType: "url",
      sourceUrl: url.trim(),
      title: page.title,
      body: page.body,
    };
  } else {
    throw new HttpError(400, "provide either markdown or url");
  }

  if (!record.body) {
    throw new HttpError(422, "no readable text found");
  }
  if (record.body.length > MAX_BODY_LENGTH) {
    throw new HttpError(422, `post body exceeds ${MAX_BODY_LENGTH} characters`);
  }

  return createPost(db, record);
}
