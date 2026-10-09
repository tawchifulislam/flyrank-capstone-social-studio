export class SocialPublisher {
  constructor(name) {
    this.name = name;
  }

  async publish() {
    throw new Error(`${this.name} does not implement publish`);
  }

  async lookup() {
    return undefined;
  }
}
