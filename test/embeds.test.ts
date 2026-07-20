import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DictionaryResult } from "../src/dictionary-types.js";
import { createDictionaryEmbeds, plainText } from "../src/embeds.js";

const result: DictionaryResult = {
  schemaVersion: 2,
  provider: "pons",
  query: "Gift",
  fetchedAt: "2026-07-20T10:00:00.000Z",
  directions: [
    {
      sourceLanguage: "de",
      targetLanguage: "en",
      entries: Array.from({ length: 5 }, (_, index) => ({
        headword: `Gift ${index}`,
        headwordFull: `<strong>Gift ${index}</strong> [ɡɪft] &amp; info`,
        pronunciation: "[ɡɪft]",
        wordClass: "<em>noun</em>",
        senses: Array.from({ length: 5 }, (_unused, senseIndex) => ({
          label: `<em>${senseIndex + 1}. meaning ${senseIndex + 1}</em>`,
          translations: [{
            source: `<b>Gift ${senseIndex}</b>`,
            target: senseIndex === 0 ? "poison @everyone" : `translation ${senseIndex}`,
          }],
        })),
      })),
    },
    {
      sourceLanguage: "en",
      targetLanguage: "de",
      entries: [{
        headword: "gift",
        headwordFull: "gift [ɡɪft]",
        pronunciation: "[ɡɪft]",
        wordClass: null,
        senses: [{ label: null, translations: [{ source: "gift", target: "Geschenk" }] }],
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
    assert.match(embeds[0]?.fields?.[0]?.name ?? "", /ɡɪft/);
    assert.match(embeds[0]?.fields?.[0]?.value ?? "", /poison @everyone/);
    assert.equal((embeds[0]?.fields?.[0]?.value.match(/→/g) ?? []).length, 3);
    const totalCharacters = embeds.reduce((total, embed) => total
      + (embed.title?.length ?? 0)
      + (embed.description?.length ?? 0)
      + (embed.footer?.text.length ?? 0)
      + (embed.fields?.reduce((fieldTotal, field) => fieldTotal + field.name.length + field.value.length, 0) ?? 0), 0);
    assert.ok(totalCharacters <= 6_000);
  });

  it("spreads concise results across meanings and keeps pronunciation", () => {
    const plane: DictionaryResult = {
      schemaVersion: 2,
      provider: "pons",
      query: "plane",
      fetchedAt: "2026-07-20T10:00:00.000Z",
      directions: [{
        sourceLanguage: "en",
        targetLanguage: "de",
        entries: [{
          headword: "plane",
          headwordFull: `plane ${"additional information ".repeat(10)}[pleɪn]`,
          pronunciation: "[pleɪn]",
          wordClass: "noun",
          senses: [
            { label: "1. plane (surface)", translations: [{ source: "plane", target: "Fläche" }] },
            { label: "2. plane (level)", translations: [{ source: "plane", target: "Ebene" }] },
            { label: "3. plane (aircraft)", translations: [{ source: "plane", target: "Flugzeug" }] },
          ],
        }],
      }],
    };

    const field = createDictionaryEmbeds(plane, "en-de")[0]?.toJSON().fields?.[0];
    assert.match(field?.name ?? "", /pleɪn/);
    assert.match(field?.value ?? "", /Fläche/);
    assert.match(field?.value ?? "", /Ebene/);
    assert.match(field?.value ?? "", /Flugzeug/);
    assert.equal((field?.value.match(/→/g) ?? []).length, 3);
  });

  it("separates and expands PONS grammar, usage, and subject labels", () => {
    const auto: DictionaryResult = {
      schemaVersion: 2,
      provider: "pons",
      query: "auto",
      fetchedAt: "2026-07-20T10:00:00.000Z",
      directions: [{
        sourceLanguage: "en",
        targetLanguage: "de",
        entries: [{
          headword: "auto",
          headwordFull: `auto
            <span class="phonetics">[ˈɔ:təʊ, <span class="region"><acronym title="American English">Am</acronym></span> ˈɑ:t̬oʊ]</span>
            <span class="wordclass"><acronym title="noun">N</acronym></span>
            <span class="region"><acronym title="American English">Am</acronym></span>
            <span class="age">dated</span>`,
          pronunciation: "[ˈɔ:təʊ, Am ˈɑ:t̬oʊ]",
          wordClass: "noun",
          senses: [{
            label: null,
            translations: [{
              source: `<span class="full_collocation"><strong class="tilde">auto</strong> store</span>
                <span class="topic"><acronym title="computing">COMPUT</acronym></span>`,
              target: `Auto <span class="genus"><acronym title="neuter">nt</acronym></span>
                <span class="flexion">&lt;-s, -s&gt;</span>`,
            }],
          }],
        }],
      }],
    };

    const field = createDictionaryEmbeds(auto, "en-de")[0]?.toJSON().fields?.[0];
    assert.match(field?.name ?? "", /auto.*pleɪn|auto.*ɔ:təʊ/);
    assert.match(field?.name ?? "", /noun · American English · dated/);
    assert.doesNotMatch(field?.name ?? "", /auto N Am/);
    assert.match(field?.value ?? "", /auto store \*\(computing\)\*/);
    assert.doesNotMatch(field?.value ?? "", /store COMPUT/);
    assert.match(field?.value ?? "", /\*\*Auto\*\* \*\(neuter;/);
  });

  it("filters an explicit direction", () => {
    const embeds = createDictionaryEmbeds(result, "en-de").map((embed) => embed.toJSON());
    assert.equal(embeds.length, 1);
    assert.match(embeds[0]?.title ?? "", /English → German/);
    assert.equal(createDictionaryEmbeds(result, "de-en").length, 1);
  });
});
