import type { WordDatabase } from "./database.js";
import type { DictionaryLookupOutcome } from "./dictionary-types.js";
import type { PonsClient } from "./pons-client.js";

const COOLDOWN_MS = 5_000;

export interface LookupOptions {
  userId: string;
  refresh?: boolean;
  now?: Date;
}

export class DictionaryLookupService {
  readonly #inFlight = new Map<string, Promise<DictionaryLookupOutcome>>();
  readonly #lastExternalLookupByUser = new Map<string, number>();

  constructor(
    private readonly database: WordDatabase,
    private readonly client: PonsClient,
  ) {}

  async lookup(query: string, options: LookupOptions): Promise<DictionaryLookupOutcome> {
    const normalizedQuery = normalizeDictionaryQuery(query);
    const now = options.now ?? new Date();

    if (!options.refresh) {
      const cached = this.database.getDictionaryCache(normalizedQuery, now);
      if (cached) {
        return cached.status === "found"
          ? { status: "found", result: cached.result, cached: true }
          : { status: "not_found", cached: true };
      }
    }

    const running = this.#inFlight.get(normalizedQuery);
    if (running) return running;

    const lastLookup = this.#lastExternalLookupByUser.get(options.userId);
    if (lastLookup !== undefined && now.getTime() - lastLookup < COOLDOWN_MS) {
      return {
        status: "cooldown",
        retryAfterSeconds: Math.max(1, Math.ceil((COOLDOWN_MS - (now.getTime() - lastLookup)) / 1_000)),
      };
    }
    this.#lastExternalLookupByUser.set(options.userId, now.getTime());

    const request = this.#fetchAndCache(query.trim(), normalizedQuery, now);
    this.#inFlight.set(normalizedQuery, request);
    try {
      return await request;
    } finally {
      this.#inFlight.delete(normalizedQuery);
    }
  }

  async #fetchAndCache(query: string, normalizedQuery: string, now: Date): Promise<DictionaryLookupOutcome> {
    const result = await this.client.lookup(query, now);
    if (!result) {
      this.database.putDictionaryMiss(normalizedQuery, query, now);
      return { status: "not_found", cached: false };
    }

    this.database.putDictionaryResult(normalizedQuery, query, result, now);
    return { status: "found", result, cached: false };
  }
}

export function normalizeDictionaryQuery(query: string): string {
  return query.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}
