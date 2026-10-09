import { SocialPublisher } from "./SocialPublisher.js";
import { ensureMockTable, findMockPostByKey, recordMockPost } from "./mockStore.js";

class MockPublisher extends SocialPublisher {
  constructor(db, name, label) {
    super(name);
    this.db = db;
    this.label = label;
    ensureMockTable(db);
  }

  async publish({ variantId, text, idempotencyKey }) {
    const preview = `[mock ${this.label} post]\n${text}`;
    const id = recordMockPost(this.db, {
      adapter: this.name,
      variantId,
      idempotencyKey,
      text,
      preview,
    });
    return { externalId: `${this.name}:${id}`, preview };
  }

  async lookup(idempotencyKey) {
    const row = findMockPostByKey(this.db, this.name, idempotencyKey);
    if (!row) return null;
    return { externalId: `${row.adapter}:${row.id}`, preview: row.preview };
  }
}

export class MockXPublisher extends MockPublisher {
  constructor(db) {
    super(db, "mock_x", "X");
  }
}

export class MockLinkedInPublisher extends MockPublisher {
  constructor(db) {
    super(db, "mock_linkedin", "LinkedIn");
  }
}
