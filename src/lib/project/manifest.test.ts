import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportManifest } from "./manifest.ts";
import { addImageRevs, adoptImage, setStyleRev, writebackStyle } from "./ops.ts";
import { sampleDna, sampleProject } from "./fixtures.ts";

const base = { styleId: "a", action: "generate" as const, diff: "d", parentId: null };

function styleA(project: ReturnType<typeof sampleProject>) {
  const found = project.styles.find((s) => s.id === "a");
  assert.ok(found);
  return found;
}

describe("exportManifest", () => {
  it("has no image files when no slot has an image", () => {
    const manifest = exportManifest(styleA(sampleProject()));
    assert.deepEqual(manifest.images, []);
    assert.equal(manifest.dna.fileName, "dna.json");
  });

  it("uses the adopted image of each slot and skips empty slots", () => {
    let project = sampleProject();
    const kv = addImageRevs(project, { ...base, slot: "kv", urls: ["/api/images/k1", "/api/images/k2"] });
    project = adoptImage(kv.project, "a", "kv", kv.ids[0]);
    project = addImageRevs(project, { ...base, slot: "web_home", urls: ["/api/images/w1"] }).project;

    const manifest = exportManifest(styleA(project));
    assert.deepEqual(manifest.images, [
      { slot: "kv", fileName: "kv.png", url: "/api/images/k1" },
      { slot: "web_home", fileName: "web_home.png", url: "/api/images/w1" },
    ]);
  });

  it("falls back to the latest image when nothing is adopted", () => {
    const project = addImageRevs(sampleProject(), { ...base, slot: "ui_hero", urls: ["/api/images/u1"] }).project;
    const withoutAdoption = {
      ...project,
      styles: project.styles.map((s) =>
        s.id === "a" ? { ...s, assets: { ...s.assets, ui_hero: { ...s.assets.ui_hero, adoptedId: null, revs: [...s.assets.ui_hero.revs, { ...s.assets.ui_hero.revs[0], id: "late", url: "/api/images/u2" }] } } } : s,
      ),
    };
    const manifest = exportManifest(styleA(withoutAdoption));
    assert.deepEqual(manifest.images, [{ slot: "ui_hero", fileName: "ui_hero.png", url: "/api/images/u2" }]);
  });

  it("keeps the extension of a url that names one", () => {
    const project = addImageRevs(sampleProject(), { ...base, slot: "kv", urls: ["https://cdn.example/x/a.webp?sig=1"] }).project;
    assert.equal(exportManifest(styleA(project)).images[0].fileName, "kv.webp");
  });

  it("serialises the viewed rev's DNA as dna.json", () => {
    let project = writebackStyle(sampleProject(), { styleId: "a", changeLog: "c", dna: sampleDna({ name: "风格 a", light: "侧逆光" }) });
    const latest = JSON.parse(exportManifest(styleA(project)).dna.content);
    assert.equal(latest.light, "侧逆光");
    project = setStyleRev(project, "a", 1);
    const first = JSON.parse(exportManifest(styleA(project)).dna.content);
    assert.equal(first.light, "柔和顶光");
    assert.deepEqual(Object.keys(first.colors), ["bg", "surface", "text", "muted", "primary", "accent"]);
  });
});
