import type { Config } from "./config.js";
import type { WordDatabase } from "./database.js";
import type { WordPostService } from "./post-service.js";
import { getLocalTime, shouldPost } from "./time.js";

const CHECK_INTERVAL_MS = 30_000;

export class DailyScheduler {
  #timer: NodeJS.Timeout | undefined;
  #checking = false;

  constructor(
    private readonly posts: WordPostService,
    private readonly database: WordDatabase,
    private readonly config: Config,
  ) {}

  start(): void {
    if (this.#timer) return;
    void this.check();
    this.#timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async check(now = new Date()): Promise<void> {
    if (this.#checking) return;
    this.#checking = true;

    try {
      const local = getLocalTime(now, this.config.timezone);
      const postedToday = this.database.hasPostForDate(this.config.channelId, local.date);
      if (!shouldPost(local, this.config.postTime, postedToday)) return;

      const result = await this.posts.postToday(now);
      if (result.status === "posted") {
        console.log(`Posted Word of the Day: ${result.word.word}`);
      } else if (result.status === "exhausted") {
        console.error("No unused words remain; add more vocabulary before the next scheduled post.");
      }
    } catch (error) {
      console.error("Scheduled Word of the Day post failed:", error);
    } finally {
      this.#checking = false;
    }
  }
}
