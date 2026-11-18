import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consistencyScore } from "./dna-export.ts";

const white = { r: 255, g: 255, b: 255 };
const black = { r: 0, g: 0, b: 0 };
const boundaryHit = { r: 0xe3, g: 0xe3, b: 0xe3 };
const boundaryMiss = { r: 0xe2, g: 0xe2, b: 0xe2 };

describe("consistencyScore", () => {
  it("scores 100 when every pixel is on the palette", () => {
    assert.equal(consistencyScore([white, white], ["#ffffff"]), 100);
  });

  it("scores 0 when every pixel misses the palette", () => {
    assert.equal(consistencyScore([black, black], ["#ffffff"]), 0);
  });

  it("scores 50 when half the pixels hit the palette", () => {
    assert.equal(consistencyScore([white, black], ["#ffffff"]), 50);
  });

  it("counts #e3e3e3 against #ffffff as a hit", () => {
    assert.equal(consistencyScore([boundaryHit], ["#ffffff"]), 100);
  });

  it("counts #e2e2e2 against #ffffff as a miss", () => {
    assert.equal(consistencyScore([boundaryMiss], ["#ffffff"]), 0);
  });

  it("scores 50 for one boundary hit and one boundary miss", () => {
    assert.equal(consistencyScore([boundaryHit, boundaryMiss], ["#ffffff"]), 50);
  });
});
