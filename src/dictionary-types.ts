export type LookupDirection = "auto" | "de-en" | "en-de";
export type DictionaryLanguage = "de" | "en";

export interface DictionaryTranslation {
  source: string;
  target: string;
}

export interface DictionarySense {
  label: string | null;
  translations: DictionaryTranslation[];
}

export interface DictionaryEntry {
  headword: string;
  headwordFull: string;
  pronunciation: string | null;
  wordClass: string | null;
  senses: DictionarySense[];
}

export interface DictionaryDirectionResult {
  sourceLanguage: DictionaryLanguage;
  targetLanguage: DictionaryLanguage;
  entries: DictionaryEntry[];
}

export interface DictionaryResult {
  schemaVersion: 2;
  provider: "pons";
  query: string;
  fetchedAt: string;
  directions: DictionaryDirectionResult[];
}

export type DictionaryLookupOutcome =
  | { status: "found"; result: DictionaryResult; cached: boolean }
  | { status: "not_found"; cached: boolean }
  | { status: "cooldown"; retryAfterSeconds: number };

export function isDictionaryResult(value: unknown): value is DictionaryResult {
  if (!isRecord(value) || value.schemaVersion !== 2 || value.provider !== "pons" || typeof value.query !== "string" || typeof value.fetchedAt !== "string") {
    return false;
  }
  if (!Array.isArray(value.directions) || value.directions.length === 0) return false;
  return value.directions.every((direction) => {
    if (!isRecord(direction) || (direction.sourceLanguage !== "de" && direction.sourceLanguage !== "en")) return false;
    if (direction.targetLanguage !== (direction.sourceLanguage === "de" ? "en" : "de")) return false;
    if (!Array.isArray(direction.entries) || direction.entries.length === 0) return false;
    return direction.entries.every((entry) => {
      if (!isRecord(entry) || typeof entry.headword !== "string" || typeof entry.headwordFull !== "string") return false;
      if (entry.pronunciation !== null && typeof entry.pronunciation !== "string") return false;
      if (entry.wordClass !== null && typeof entry.wordClass !== "string") return false;
      return Array.isArray(entry.senses) && entry.senses.length > 0 && entry.senses.every((sense) => {
        if (!isRecord(sense) || (sense.label !== null && typeof sense.label !== "string")) return false;
        return Array.isArray(sense.translations) && sense.translations.length > 0 && sense.translations.every((translation) =>
          isRecord(translation) && typeof translation.source === "string" && typeof translation.target === "string",
        );
      });
    });
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
