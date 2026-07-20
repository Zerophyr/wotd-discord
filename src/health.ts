import { rmSync, statSync, writeFileSync } from "node:fs";
import type { Client } from "discord.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

export class HealthHeartbeat {
  #timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly client: Client,
    private readonly path = process.env.HEALTHCHECK_PATH || "/tmp/wotd-bot-healthy",
  ) {}

  start(): void {
    if (this.#timer) return;
    this.#update();
    this.#timer = setInterval(() => this.#update(), HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    rmSync(this.path, { force: true });
  }

  #update(): void {
    if (this.client.isReady()) {
      writeFileSync(this.path, new Date().toISOString());
    } else {
      rmSync(this.path, { force: true });
    }
  }

  static isFresh(path: string, maximumAgeMs: number, now = Date.now()): boolean {
    try {
      return now - statSync(path).mtimeMs <= maximumAgeMs;
    } catch {
      return false;
    }
  }
}
