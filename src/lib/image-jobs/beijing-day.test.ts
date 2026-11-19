import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shiftBeijingDay } from "./beijing-day.ts";

describe("shiftBeijingDay", () => {
  it("moves a Beijing calendar day by whole days from one noon anchor", () => {
    assert.equal(shiftBeijingDay("2026-03-15", -29), "2026-02-14");
    assert.equal(shiftBeijingDay("2026-03-01", -1), "2026-02-28");
    assert.equal(shiftBeijingDay("2026-11-19", 0), "2026-11-19");
  });
});
