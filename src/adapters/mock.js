import { SocialPublisher } from "./SocialPublisher.js";
import { ensureMockTable, findMockPostByKey, recordMockPost } from "./mockStore.js";

class MockPublisher extends SocialPublisher {
  constructor(db, name, label, { delayMs = 0, crashAfterPost = false } = {}) {
    super(name);
    this.db = db;
    this.label = label;
    this.delayMs = delayMs;
    this.crashAfterPost = crashAfterPost;
    ensureMockTable(db);
  }

  async publish({ variantId, text, idempotencyKey }) {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    const preview = `[mock ${this.label} post]\n${text}`;
    const id = recordMockPost(this.db, {
      adapter: this.name,
      variantId,
      idempotencyKey,
      text,
      preview,
    });
    if (this.crashAfterPost) {
      process.exit(1);
    }
    return { externalId: `${this.name}:${id}`, preview };
  }

  async lookup(idempotencyKey) {
    const row = findMockPostByKey(this.db, this.name, idempotencyKey);
    if (!row) return null;
    return { externalId: `${row.adapter}:${row.id}`, preview: row.preview };
  }
}

export class MockXPublisher extends MockPublisher {
  constructor(db, options) {
    super(db, "mock_x", "X", options);
  }
}

export class MockLinkedInPublisher extends MockPublisher {
  constructor(db, options) {
    super(db, "mock_linkedin", "LinkedIn", options);
  }
}
