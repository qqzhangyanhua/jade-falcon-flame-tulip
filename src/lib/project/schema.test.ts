import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectDocumentSchema } from "./schema.ts";
import { sampleDna, sampleProject } from "./fixtures.ts";

describe("projectDocumentSchema", () => {
  it("accepts a project whose style revs have no changes (legacy data)", () => {
    const project = sampleProject();
    const { mode: _mode, ...document } = project;
    assert.equal(project.styles[0].revs[0].changes, undefined);
    assert.equal(projectDocumentSchema.safeParse(document).success, true);
  });

  it("accepts a style rev that records changes", () => {
    const project = sampleProject();
    project.styles[0].revs[0].changes = [{ field: "light", from: "a", to: "b" }];
    const { mode: _mode, ...document } = project;
    assert.equal(projectDocumentSchema.safeParse(document).success, true);
  });

  it("rejects a data: prototype address", () => {
    const { mode: _mode, ...document } = sampleProject();
    const result = projectDocumentSchema.safeParse({
      ...document,
      prototypeDataUrl: "data:image/png;base64,AAAA",
    });
    assert.equal(result.success, false);
  });

  it("accepts a stored /api/images prototype address", () => {
    const { mode: _mode, ...document } = sampleProject();
    const result = projectDocumentSchema.safeParse({
      ...document,
      prototypeDataUrl: "/api/images/img_123",
    });
    assert.equal(result.success, true);
  });

  it("rejects a document whose style DNA is malformed", () => {
    const { mode: _mode, ...document } = sampleProject();
    const broken = structuredClone(document);
    broken.styles[0].revs[0].dna = { ...sampleDna(), mood: "calm" } as never;
    assert.equal(projectDocumentSchema.safeParse(broken).success, false);
  });

  it("drops UI-only mode from the parsed document", () => {
    const parsed = projectDocumentSchema.parse(sampleProject());
    assert.equal("mode" in parsed, false);
  });

  it("defaults missing reference images to an empty list", () => {
    const { mode: _mode, referenceImageUrls: _urls, ...legacy } = sampleProject();
    const parsed = projectDocumentSchema.parse(legacy);
    assert.deepEqual(parsed.referenceImageUrls, []);
  });

  it("keeps up to three stored reference image addresses", () => {
    const { mode: _mode, ...document } = sampleProject();
    const urls = ["/api/images/img_a", "/api/images/img_b", "/api/images/img_c"];
    const parsed = projectDocumentSchema.parse({ ...document, referenceImageUrls: urls });
    assert.deepEqual(parsed.referenceImageUrls, urls);
  });

  it("rejects data urls and a fourth reference image", () => {
    const { mode: _mode, ...document } = sampleProject();
    assert.equal(
      projectDocumentSchema.safeParse({
        ...document,
        referenceImageUrls: ["data:image/png;base64,AAAA"],
      }).success,
      false,
    );
    assert.equal(
      projectDocumentSchema.safeParse({
        ...document,
        referenceImageUrls: ["https://example.com/api/images/img_a"],
      }).success,
      false,
    );
    assert.equal(
      projectDocumentSchema.safeParse({
        ...document,
        referenceImageUrls: [
          "/api/images/img_a",
          "/api/images/img_b",
          "/api/images/img_c",
          "/api/images/img_d",
        ],
      }).success,
      false,
    );
  });
});
