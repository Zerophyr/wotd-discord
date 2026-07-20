import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DictionaryResult } from "../src/dictionary-types.js";
import { createDictionaryEmbeds, plainText } from "../src/embeds.js";

const result: DictionaryResult = {
  provider: "pons",
  query: "Gift",
  fetchedAt: "2026-07-20T10:00:00.000Z",
  directions: [
    {
      sourceLanguage: "de",
      targetLanguage: "en",
      entries: Array.from({ length: 5 }, (_, index) => ({
        headword: `Gift ${index}`,
        headwordFull: `<strong>Gift ${index}</strong> &amp; info`,
        wordClass: "<em>noun</em>",
        translations: Array.from({ length: 5 }, (_unused, translationIndex) => ({
          source: `<b>Gift ${translationIndex}</b>`,
          target: translationIndex === 0 ? "poison @everyone" : `translation ${translationIndex}`,
        })),
      })),
    },
    {
      sourceLanguage: "en",
      targetLanguage: "de",
      entries: [{
        headword: "gift",
        headwordFull: "gift",
        wordClass: null,
        translations: [{ source: "gift", target: "Geschenk" }],
      }],
    },
  ],
};

describe("dictionary embeds", () => {
  it("converts provider HTML to safe plain Discord text", () => {
    assert.equal(plainText("<strong>Haus</strong>&nbsp;&amp; <script>bad</script> *test*"), "Haus & bad \\*test\\*");
    assert.equal(plainText("[link](https://example.com) &#x110000;"), "\\[link\\]\\(https://example\\.com\\) &\\#x110000;");
  });

  it("shows concise matches for both automatic directions", () => {
    const embeds = createDictionaryEmbeds(result, "auto").map((embed) => embed.toJSON());
    assert.equal(embeds.length, 2);
    assert.equal(embeds[0]?.fields?.length, 3);
    assert.equal(embeds[1]?.fields?.length, 1);
    assert.match(embeds[0]?.footer?.text ?? "", /PONS/);
    assert.match(embeds[0]?.fields?.[0]?.value ?? "", /poison @everyone/);
    assert.equal((embeds[0]?.fields?.[0]?.value.match(/→/g) ?? []).length, 3);
    const totalCharacters = embeds.reduce((total, embed) => total
      + (embed.title?.length ?? 0)
      + (embed.description?.length ?? 0)
      + (embed.footer?.text.length ?? 0)
      + (embed.fields?.reduce((fieldTotal, field) => fieldTotal + field.name.length + field.value.length, 0) ?? 0), 0);
    assert.ok(totalCharacters <= 6_000);
  });

  it("filters an explicit direction", () => {
    const embeds = createDictionaryEmbeds(result, "en-de").map((embed) => embed.toJSON());
    assert.equal(embeds.length, 1);
    assert.match(embeds[0]?.title ?? "", /English → German/);
    assert.equal(createDictionaryEmbeds(result, "de-en").length, 1);
  });
});
