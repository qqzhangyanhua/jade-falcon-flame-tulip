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
    const kv = addImageRevs(project, {
      ...base,
      slot: "kv",
      urls: ["/api/images/k1", "/api/images/k2"],
    });
    project = adoptImage(kv.project, "a", "kv", kv.ids[0]);
    project = addImageRevs(project, {
      ...base,
      slot: "web_home",
      urls: ["/api/images/w1"],
    }).project;

    const manifest = exportManifest(styleA(project));
    assert.deepEqual(manifest.images, [
      { slot: "kv", fileName: "kv.png", url: "/api/images/k1" },
      { slot: "web_home", fileName: "web_home.png", url: "/api/images/w1" },
    ]);
  });

  it("falls back to the latest image when nothing is adopted", () => {
    const project = addImageRevs(sampleProject(), {
      ...base,
      slot: "ui_hero",
      urls: ["/api/images/u1"],
    }).project;
    const withoutAdoption = {
      ...project,
      styles: project.styles.map((s) =>
        s.id === "a"
          ? {
              ...s,
              assets: {
                ...s.assets,
                ui_hero: {
                  ...s.assets.ui_hero,
                  adoptedId: null,
                  revs: [
                    ...s.assets.ui_hero.revs,
                    { ...s.assets.ui_hero.revs[0], id: "late", url: "/api/images/u2" },
                  ],
                },
              },
            }
          : s,
      ),
    };
    const manifest = exportManifest(styleA(withoutAdoption));
    assert.deepEqual(manifest.images, [
      { slot: "ui_hero", fileName: "ui_hero.png", url: "/api/images/u2" },
    ]);
  });

  it("keeps the extension of a url that names one", () => {
    const project = addImageRevs(sampleProject(), {
      ...base,
      slot: "kv",
      urls: ["https://cdn.example/x/a.webp?sig=1"],
    }).project;
    assert.equal(exportManifest(styleA(project)).images[0].fileName, "kv.webp");
  });

  it("serialises the viewed rev's DNA as dna.json", () => {
    let project = writebackStyle(sampleProject(), {
      styleId: "a",
      changeLog: "c",
      dna: sampleDna({ name: "风格 a", light: "侧逆光" }),
    });
    const latest = JSON.parse(exportManifest(styleA(project)).dna.content);
    assert.equal(latest.light, "侧逆光");
    project = setStyleRev(project, "a", 1);
    const first = JSON.parse(exportManifest(styleA(project)).dna.content);
    assert.equal(first.light, "柔和顶光");
    assert.deepEqual(Object.keys(first.colors), [
      "bg",
      "surface",
      "text",
      "muted",
      "primary",
      "accent",
    ]);
  });

  it("adds token files and prompts.md from the viewed rev", () => {
    const colors = { ...sampleDna().colors, primary: "#112233" };
    let project = writebackStyle(sampleProject(), {
      styleId: "a",
      changeLog: "c",
      dna: sampleDna({ name: "风格 a", geometry: "sharp", colors }),
    });
    const latest = exportManifest(styleA(project), { product: "云栖" });
    assert.equal(latest.tokens.css.fileName, "tokens.css");
    assert.equal(latest.tokens.tailwind.fileName, "tailwind.css");
    assert.equal(latest.tokens.w3c.fileName, "tokens.json");
    assert.equal(latest.prompts.fileName, "prompts.md");
    assert.match(latest.tokens.css.content, /--radius-md: 0px;/);
    assert.match(latest.tokens.css.content, /--color-primary: #112233;/);
    assert.match(latest.tokens.tailwind.content, /@theme \{/);
    assert.match(latest.tokens.tailwind.content, /--spacing-brand: 16px;/);
    assert.doesNotMatch(latest.tokens.tailwind.content, /--spacing:/);
    assert.match(latest.tokens.w3c.content, /"\$type": "fontFamily"/);
    assert.match(latest.tokens.w3c.content, /#112233/);
    assert.match(latest.prompts.content, /云栖/);
    assert.match(latest.prompts.content, / --ar 9:16 --no /);
    assert.match(latest.prompts.content, / --ar 16:9 --no 霓虹, neon/);

    project = setStyleRev(project, "a", 1);
    const first = exportManifest(styleA(project), { product: "云栖" });
    assert.match(first.tokens.css.content, /--radius-md: 8px;/);
    assert.match(first.tokens.css.content, /--color-primary: #4f7cff;/);
    assert.doesNotMatch(first.tokens.css.content, /#112233/);
    assert.doesNotMatch(first.prompts.content, /#112233/);
    assert.match(first.prompts.content, /柔和顶光/);
  });

  it("lists enabled slots that have an image, in that order, and omits a hidden slot", () => {
    let project = sampleProject();
    project = addImageRevs(project, { ...base, slot: "ui_hero", urls: ["/api/images/u1"] }).project;
    project = addImageRevs(project, { ...base, slot: "kv", urls: ["/api/images/k1"] }).project;
    project = addImageRevs(project, {
      ...base,
      slot: "web_home",
      urls: ["/api/images/w1"],
    }).project;

    const manifest = exportManifest(styleA(project), {
      enabledSlotIds: ["web_home", "kv"],
      product: "云栖",
    });
    assert.deepEqual(
      manifest.images.map((image) => image.slot),
      ["web_home", "kv"],
    );
    assert.match(manifest.prompts.content, /官网首屏/);
    assert.match(manifest.prompts.content, /品牌主视觉/);
    assert.doesNotMatch(manifest.prompts.content, /产品旗舰页/);
  });

  it("skips an excluded image and does not replace it with another rev", () => {
    let project = sampleProject();
    const kv = addImageRevs(project, {
      ...base,
      slot: "kv",
      urls: ["/api/images/k1", "/api/images/k2"],
    });
    project = adoptImage(kv.project, "a", "kv", kv.ids[0]);
    project = addImageRevs(project, {
      ...base,
      slot: "ui_hero",
      urls: ["/api/images/u1", "/api/images/u2"],
    }).project;
    project = {
      ...project,
      styles: project.styles.map((style) =>
        style.id === "a"
          ? {
              ...style,
              assets: {
                ...style.assets,
                ui_hero: { ...style.assets.ui_hero, adoptedId: null },
              },
            }
          : style,
      ),
    };
    project = addImageRevs(project, {
      ...base,
      slot: "web_home",
      urls: ["/api/images/w1"],
    }).project;

    const manifest = exportManifest(styleA(project), {
      excludeImageIds: ["k1", "u2"],
    });

    assert.deepEqual(manifest.images, [
      { slot: "web_home", fileName: "web_home.png", url: "/api/images/w1" },
    ]);
  });
});
