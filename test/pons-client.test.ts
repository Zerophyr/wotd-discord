import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PonsApiError, PonsClient, parsePonsResponse, type FetchFunction } from "../src/pons-client.js";

const fixture = [
  {
    lang: "de",
    hits: [
      {
        type: "entry",
        roms: [
          {
            headword: "Haus",
            headword_full: "<strong>Haus</strong> [haʊs] &lt;-es, Häuser&gt;",
            wordclass: "noun",
            arabs: [
              {
                header: "1",
                translations: [
                  { source: "<b>Haus</b>", target: "house" },
                  { source: "zu Hause", target: "at home" },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "entry_with_secondary_entries",
        primary_entry: {
          roms: [{ headword: "Häuschen", arabs: [{ translations: [{ source: "Häuschen", target: "little house" }] }] }],
        },
        secondary_entries: [
          { roms: [{ headword: "Gebäude", arabs: [{ translations: [{ source: "Gebäude", target: "building" }] }] }] },
        ],
      },
    ],
  },
  {
    lang: "en",
    hits: [
      { type: "translation", source: "house", target: "Haus" },
      { type: "translation", source: "house", target: "Gebäude" },
    ],
  },
];

describe("PonsClient", () => {
  it("sends the documented request without exposing the secret in the URL", async () => {
    let capturedUrl: URL | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchFunction: FetchFunction = async (input, init) => {
      capturedUrl = new URL(input.toString());
      capturedInit = init;
      return Response.json(fixture);
    };

    const result = await new PonsClient("super-secret", fetchFunction).lookup("Haus", new Date("2026-07-20T10:00:00Z"));
    assert.ok(result);
    assert.ok(capturedUrl);
    assert.equal(capturedUrl.origin + capturedUrl.pathname, "https://api.pons.com/v1/dictionary");
    assert.equal(capturedUrl.searchParams.get("q"), "Haus");
    assert.equal(capturedUrl.searchParams.get("l"), "deen");
    assert.equal(capturedUrl.searchParams.get("fm"), "1");
    assert.equal(capturedUrl.searchParams.get("ref"), "true");
    assert.equal(capturedUrl.searchParams.get("language"), "en");
    assert.equal(capturedUrl.toString().includes("super-secret"), false);
    assert.equal(new Headers(capturedInit?.headers).get("X-Secret"), "super-secret");
    assert.equal(result.schemaVersion, 2);
    assert.equal(result.directions.length, 2);
  });

  it("parses entries, loose translations, and referenced entries", () => {
    const result = parsePonsResponse(fixture, "Haus");
    assert.equal(result[0]?.sourceLanguage, "de");
    assert.deepEqual(result[0]?.entries.map(({ headword }) => headword), ["Haus", "Häuschen", "Gebäude"]);
    assert.equal(result[0]?.entries[0]?.wordClass, "noun");
    assert.equal(result[0]?.entries[0]?.pronunciation, "[haʊs]");
    assert.equal(result[0]?.entries[0]?.senses[0]?.label, "1");
    assert.deepEqual(result[1]?.entries[0]?.senses[0]?.translations, [
      { source: "house", target: "Haus" },
      { source: "house", target: "Gebäude" },
    ]);
  });

  it("preserves distinct meanings for ambiguous headwords", () => {
    const result = parsePonsResponse([{
      lang: "en",
      hits: [{
        type: "entry",
        roms: [{
          headword: "plane",
          headword_full: "<strong>plane</strong><sup>1</sup> [pleɪn]",
          wordclass: "noun",
          arabs: [
            { header: "1. plane (surface)", translations: [{ source: "plane", target: "Fläche" }] },
            { header: "2. plane (level)", translations: [{ source: "plane", target: "Ebene" }] },
            { header: "3. plane (aircraft)", translations: [{ source: "plane", target: "Flugzeug" }] },
          ],
        }],
      }],
    }], "plane");

    assert.equal(result[0]?.entries[0]?.pronunciation, "[pleɪn]");
    assert.deepEqual(result[0]?.entries[0]?.senses.map(({ label }) => label), [
      "1. plane (surface)",
      "2. plane (level)",
      "3. plane (aircraft)",
    ]);
  });

  it("returns null for 204 and empty usable results", async () => {
    const noContent = new PonsClient("secret", async () => new Response(null, { status: 204 }));
    assert.equal(await noContent.lookup("missing"), null);
    assert.deepEqual(parsePonsResponse([{ lang: "de", hits: [{ type: "unknown" }] }], "missing"), []);
  });

  for (const [status, kind] of [[403, "authentication"], [404, "configuration"], [429, "quota"], [503, "temporary"]] as const) {
    it(`maps HTTP ${status} to ${kind}`, async () => {
      const client = new PonsClient("secret", async () => new Response(null, { status }));
      await assert.rejects(() => client.lookup("Haus"), (error: unknown) =>
        error instanceof PonsApiError && error.kind === kind && !error.message.includes("secret"),
      );
    });
  }

  it("rejects invalid JSON and unexpected payloads", async () => {
    const invalidJson = new PonsClient("secret", async () => new Response("{", { status: 200 }));
    await assert.rejects(() => invalidJson.lookup("Haus"), (error: unknown) =>
      error instanceof PonsApiError && error.kind === "invalid_response",
    );

    const invalidShape = new PonsClient("secret", async () => Response.json({ lang: "de" }));
    await assert.rejects(() => invalidShape.lookup("Haus"), (error: unknown) =>
      error instanceof PonsApiError && error.kind === "invalid_response",
    );
  });

  it("aborts slow requests", async () => {
    const fetchFunction: FetchFunction = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    const client = new PonsClient("secret", fetchFunction, "https://api.pons.com/v1/dictionary", 5);
    await assert.rejects(() => client.lookup("Haus"), (error: unknown) =>
      error instanceof PonsApiError && error.kind === "temporary",
    );
  });
});
