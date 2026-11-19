import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hiddenImageKnowledge,
  nextHiddenImageKnowledge,
  ownedImageFrame,
} from "./hidden-image-state.ts";

describe("hidden image placeholder", () => {
  it("does not show a durable image before hidden ids are known", () => {
    const unknown = hiddenImageKnowledge(null);
    assert.equal(ownedImageFrame(unknown, "/api/images/img_a"), "pending");
    assert.equal(ownedImageFrame(unknown, "https://cdn.example/api/images/img_a"), "pending");
    assert.equal(ownedImageFrame(unknown, "https://cdn.example/other.png"), "image");
  });

  it("uses the same image id for a relative url and an absolute url", () => {
    const known = hiddenImageKnowledge(["img_a", "a b"]);
    assert.equal(ownedImageFrame(known, "/api/images/img_a"), "hidden");
    assert.equal(ownedImageFrame(known, "https://cdn.example/api/images/img_a?x=1"), "hidden");
    assert.equal(ownedImageFrame(known, "/api/images/a%20b"), "hidden");
    assert.equal(ownedImageFrame(known, "https://cdn.example/api/images/a%20b"), "hidden");
    assert.equal(ownedImageFrame(known, "/api/images/img_b"), "image");
  });

  it("keeps ids already known to be hidden when a refresh fails", () => {
    const known = hiddenImageKnowledge(["img_a"]);
    const kept = nextHiddenImageKnowledge(known, { type: "failed" });
    assert.equal(ownedImageFrame(kept, "/api/images/img_a"), "hidden");
    const replaced = nextHiddenImageKnowledge(kept, { type: "loaded", ids: ["img_b"] });
    assert.equal(ownedImageFrame(replaced, "/api/images/img_a"), "image");
    assert.equal(ownedImageFrame(replaced, "/api/images/img_b"), "hidden");
    const signedOut = nextHiddenImageKnowledge(replaced, { type: "signed-out" });
    assert.equal(ownedImageFrame(signedOut, "/api/images/img_b"), "image");
  });
});
