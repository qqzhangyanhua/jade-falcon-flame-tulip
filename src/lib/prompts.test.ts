import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TUNE_INSTRUCTION_MAX_LENGTH,
  canSubmitCopyRewrite,
  canSubmitTuneInstruction,
  copyRewriteInstruction,
  mergeTuneInstruction,
} from "./prompts.ts";

const rest = { brightness: 50, warmth: 50, contrast: 50 };

describe("mergeTuneInstruction", () => {
  it("is empty when free text is empty and the sliders are unmoved", () => {
    assert.equal(mergeTuneInstruction("", rest), "");
    assert.equal(mergeTuneInstruction("   \n", rest), "");
    assert.equal(mergeTuneInstruction("", rest).includes("Subtle polish"), false);
  });

  it("uses the slider description when only the sliders moved", () => {
    assert.equal(
      mergeTuneInstruction("", { brightness: 70, warmth: 50, contrast: 50 }),
      "Adjust: brighter. Keep composition.",
    );
    assert.equal(
      mergeTuneInstruction("  ", { brightness: 30, warmth: 50, contrast: 50 }),
      "Adjust: darker. Keep composition.",
    );
    assert.equal(
      mergeTuneInstruction("", { brightness: 50, warmth: 80, contrast: 50 }),
      "Adjust: warmer color temperature. Keep composition.",
    );
    assert.equal(
      mergeTuneInstruction("", { brightness: 50, warmth: 20, contrast: 50 }),
      "Adjust: cooler color temperature. Keep composition.",
    );
    assert.equal(
      mergeTuneInstruction("", { brightness: 50, warmth: 50, contrast: 90 }),
      "Adjust: higher contrast. Keep composition.",
    );
    assert.equal(
      mergeTuneInstruction("", { brightness: 50, warmth: 50, contrast: 10 }),
      "Adjust: softer contrast. Keep composition.",
    );
    assert.equal(
      mergeTuneInstruction("", { brightness: 60, warmth: 40, contrast: 70 }),
      "Adjust: brighter, cooler color temperature, higher contrast. Keep composition.",
    );
  });

  it("joins trimmed free text and the slider description into one instruction", () => {
    assert.equal(mergeTuneInstruction("  把背景换成户外  ", rest), "把背景换成户外");
    assert.equal(
      mergeTuneInstruction("把背景换成户外", { brightness: 70, warmth: 50, contrast: 40 }),
      "把背景换成户外 Adjust: brighter, softer contrast. Keep composition.",
    );
  });

  it("does not truncate an instruction past the length limit", () => {
    const text = "字".repeat(TUNE_INSTRUCTION_MAX_LENGTH + 1);
    assert.equal(mergeTuneInstruction(text, rest), text);
    const merged = mergeTuneInstruction("a".repeat(380), {
      brightness: 70,
      warmth: 50,
      contrast: 50,
    });
    assert.equal(merged.startsWith("a".repeat(380)), true);
    assert.equal(merged.endsWith("Adjust: brighter. Keep composition."), true);
    assert.equal(merged.length > TUNE_INSTRUCTION_MAX_LENGTH, true);
  });
});

describe("canSubmitTuneInstruction", () => {
  it("rejects an empty instruction and one longer than 400 characters", () => {
    assert.equal(TUNE_INSTRUCTION_MAX_LENGTH, 400);
    assert.equal(canSubmitTuneInstruction(""), false);
    assert.equal(canSubmitTuneInstruction("   "), false);
    assert.equal(canSubmitTuneInstruction("把背景换成户外"), true);
    assert.equal(canSubmitTuneInstruction("字".repeat(400)), true);
    assert.equal(canSubmitTuneInstruction("字".repeat(401)), false);
  });
});

describe("copyRewriteInstruction", () => {
  it("keeps layout, picture, and palette while replacing the title or copy", () => {
    assert.equal(
      copyRewriteInstruction("  夏日特惠  "),
      'Keep the layout, the picture, and the palette. Replace the title or copy with: "夏日特惠".',
    );
  });
});

describe("canSubmitCopyRewrite", () => {
  it("rejects empty or over-long replacement text", () => {
    assert.equal(canSubmitCopyRewrite(""), false);
    assert.equal(canSubmitCopyRewrite("  "), false);
    assert.equal(canSubmitCopyRewrite("夏日特惠"), true);
    assert.equal(canSubmitCopyRewrite("字".repeat(400)), true);
    assert.equal(canSubmitCopyRewrite("字".repeat(401)), false);
  });
});
