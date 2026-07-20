import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { categoryForWeekday, getLocalTime, shouldPost } from "../src/time.js";

describe("schedule time", () => {
  it("converts UTC to Europe/Berlin in summer", () => {
    const local = getLocalTime(new Date("2026-07-20T08:15:00.000Z"), "Europe/Berlin");
    assert.deepEqual(local, { date: "2026-07-20", time: "10:15", weekday: 1 });
  });

  it("converts UTC to Europe/Berlin in winter", () => {
    const local = getLocalTime(new Date("2026-01-20T09:15:00.000Z"), "Europe/Berlin");
    assert.deepEqual(local, { date: "2026-01-20", time: "10:15", weekday: 2 });
  });

  it("posts once the configured time is reached", () => {
    const local = { date: "2026-07-20", time: "10:00", weekday: 1 };
    assert.equal(shouldPost(local, "10:00", false), true);
    assert.equal(shouldPost(local, "10:00", true), false);
    assert.equal(shouldPost({ ...local, time: "09:59" }, "10:00", false), false);
  });

  it("rotates categories from Sunday through Saturday", () => {
    assert.deepEqual(
      Array.from({ length: 7 }, (_, weekday) => categoryForWeekday(weekday)),
      ["idiom", "everyday", "verb", "slang", "unique", "colloquial", "false_friend"],
    );
  });
});
