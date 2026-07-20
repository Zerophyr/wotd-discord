import {
  isRecord,
  type DictionaryDirectionResult,
  type DictionaryEntry,
  type DictionaryLanguage,
  type DictionaryResult,
  type DictionaryTranslation,
} from "./dictionary-types.js";

const PONS_ENDPOINT = "https://api.pons.com/v1/dictionary";
const MAX_ENTRIES_PER_DIRECTION = 20;
const MAX_TRANSLATIONS_PER_ENTRY = 20;

export type PonsErrorKind = "authentication" | "quota" | "configuration" | "temporary" | "invalid_response";

export class PonsApiError extends Error {
  constructor(
    readonly kind: PonsErrorKind,
    readonly status: number | undefined,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PonsApiError";
  }
}

export type FetchFunction = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class PonsClient {
  constructor(
    private readonly secret: string,
    private readonly fetchFunction: FetchFunction = fetch,
    private readonly endpoint = PONS_ENDPOINT,
    private readonly timeoutMs = 5_000,
  ) {}

  async lookup(query: string, now = new Date()): Promise<DictionaryResult | null> {
    const url = new URL(this.endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("l", "deen");
    url.searchParams.set("fm", "1");
    url.searchParams.set("ref", "true");
    url.searchParams.set("language", "en");

    let response: Response;
    try {
      response = await this.fetchFunction(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Secret": this.secret,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new PonsApiError("temporary", undefined, "PONS request failed", { cause: error });
    }

    if (response.status === 204) return null;
    if (response.status === 403) throw new PonsApiError("authentication", 403, "PONS rejected the API credentials");
    if (response.status === 429) throw new PonsApiError("quota", 429, "PONS request quota exhausted");
    if (response.status === 404) throw new PonsApiError("configuration", 404, "PONS dictionary is unavailable");
    if (!response.ok) throw new PonsApiError("temporary", response.status, "PONS service returned an error");

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new PonsApiError("invalid_response", response.status, "PONS returned invalid JSON", { cause: error });
    }

    const directions = parsePonsResponse(payload, query);
    if (directions.length === 0) return null;
    return {
      provider: "pons",
      query,
      fetchedAt: now.toISOString(),
      directions,
    };
  }
}

export function parsePonsResponse(payload: unknown, query: string): DictionaryDirectionResult[] {
  if (!Array.isArray(payload)) throw new PonsApiError("invalid_response", 200, "Unexpected PONS response shape");

  const directions: DictionaryDirectionResult[] = [];
  for (const value of payload) {
    if (!isRecord(value) || (value.lang !== "de" && value.lang !== "en") || !Array.isArray(value.hits)) continue;
    const sourceLanguage = value.lang as DictionaryLanguage;
    const entries: DictionaryEntry[] = [];
    const looseTranslations: DictionaryTranslation[] = [];

    for (const hit of value.hits) {
      if (!isRecord(hit) || typeof hit.type !== "string") continue;
      if (hit.type === "entry") {
        entries.push(...parseEntry(hit));
      } else if (hit.type === "translation") {
        const translation = parseTranslation(hit);
        if (translation) looseTranslations.push(translation);
      } else if (hit.type === "entry_with_secondary_entries") {
        if (isRecord(hit.primary_entry)) entries.push(...parseEntry(hit.primary_entry));
        if (Array.isArray(hit.secondary_entries)) {
          for (const secondary of hit.secondary_entries) {
            if (isRecord(secondary)) entries.push(...parseEntry(secondary));
          }
        }
      }
    }

    if (looseTranslations.length > 0) {
      entries.unshift({
        headword: query,
        headwordFull: query,
        wordClass: null,
        translations: looseTranslations.slice(0, MAX_TRANSLATIONS_PER_ENTRY),
      });
    }

    const usableEntries = entries.filter((entry) => entry.translations.length > 0).slice(0, MAX_ENTRIES_PER_DIRECTION);
    if (usableEntries.length > 0) {
      directions.push({
        sourceLanguage,
        targetLanguage: sourceLanguage === "de" ? "en" : "de",
        entries: usableEntries,
      });
    }
  }

  return directions;
}

function parseEntry(entry: Record<string, unknown>): DictionaryEntry[] {
  if (!Array.isArray(entry.roms)) return [];
  const parsed: DictionaryEntry[] = [];

  for (const rom of entry.roms) {
    if (!isRecord(rom) || typeof rom.headword !== "string") continue;
    const translations: DictionaryTranslation[] = [];
    if (Array.isArray(rom.arabs)) {
      for (const arab of rom.arabs) {
        if (!isRecord(arab) || !Array.isArray(arab.translations)) continue;
        for (const rawTranslation of arab.translations) {
          if (!isRecord(rawTranslation)) continue;
          const translation = parseTranslation(rawTranslation);
          if (translation) translations.push(translation);
          if (translations.length >= MAX_TRANSLATIONS_PER_ENTRY) break;
        }
        if (translations.length >= MAX_TRANSLATIONS_PER_ENTRY) break;
      }
    }

    parsed.push({
      headword: rom.headword,
      headwordFull: typeof rom.headword_full === "string" ? rom.headword_full : rom.headword,
      wordClass: typeof rom.wordclass === "string" ? rom.wordclass : null,
      translations,
    });
  }

  return parsed;
}

function parseTranslation(value: Record<string, unknown>): DictionaryTranslation | null {
  if (typeof value.source !== "string" || typeof value.target !== "string") return null;
  return { source: value.source, target: value.target };
}
