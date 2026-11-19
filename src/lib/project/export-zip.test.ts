import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import { buildExportZip, exportZipName } from "./export-zip.ts";
import { addImageRevs, adoptImage } from "./ops.ts";
import { sampleProject } from "./fixtures.ts";
import type { StyleBranch } from "./schema.ts";

const base = { styleId: "a", action: "generate" as const, diff: "d", parentId: null };

function styleA(project: ReturnType<typeof sampleProject>): StyleBranch {
  const found = project.styles.find((s) => s.id === "a");
  assert.ok(found);
  return found;
}

function withImages() {
  let project = sampleProject();
  const kv = addImageRevs(project, {
    ...base,
    slot: "kv",
    urls: ["/api/images/k1", "/api/images/k2"],
  });
  project = adoptImage(kv.project, "a", "kv", kv.ids[1]);
  project = addImageRevs(project, { ...base, slot: "web_home", urls: ["/api/images/w1"] }).project;
  return styleA(project);
}

const PNG = new Uint8Array([137, 80, 78, 71, 1]);
const JPG = new Uint8Array([255, 216, 255, 9]);

function fakeFetch(types: Record<string, { type: string; bytes: Uint8Array } | number>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const hit = types[url];
    if (typeof hit === "number") return new Response("nope", { status: hit });
    if (!hit) return new Response("nope", { status: 404 });
    return new Response(hit.bytes as BodyInit, {
      status: 200,
      headers: { "Content-Type": hit.type },
    });
  }) as typeof fetch;
  return { impl, calls };
}

describe("exportZipName", () => {
  it("is <project>-<style line>-rev<n>.zip", () => {
    assert.equal(exportZipName("云栖", "雾蓝", 3), "云栖-雾蓝-rev3.zip");
  });

  it("replaces characters that are unsafe in file names", () => {
    assert.equal(exportZipName("a/b:c", 'x*y?"z', 2), "a_b_c-x_y__z-rev2.zip");
  });

  it("falls back when a name is blank", () => {
    assert.equal(exportZipName("  ", "", 1), "project-style-rev1.zip");
  });
});

describe("buildExportZip", () => {
  it("packs adopted images named by slot with the extension of the content type, plus dna.json", async () => {
    const { impl, calls } = fakeFetch({
      "/api/images/k2": { type: "image/jpeg", bytes: JPG },
      "/api/images/w1": { type: "image/png", bytes: PNG },
    });
    const result = await buildExportZip({
      projectName: "云栖",
      styleLine: withImages(),
      fetchImpl: impl,
    });

    assert.equal(result.fileName, "云栖-风格 a-rev1.zip");
    assert.deepEqual(calls.sort(), ["/api/images/k2", "/api/images/w1"]);
    const files = unzipSync(result.bytes);
    assert.deepEqual(Object.keys(files).sort(), [
      "dna.json",
      "kv.jpg",
      "prompts.md",
      "tailwind.css",
      "tokens.css",
      "tokens.json",
      "web_home.png",
    ]);
    assert.deepEqual(files["kv.jpg"], JPG);
    assert.deepEqual(files["web_home.png"], PNG);
    assert.equal(JSON.parse(strFromU8(files["dna.json"])).name, "风格 a");
    assert.match(strFromU8(files["tokens.css"]), /--color-bg: #0b1020;/);
    assert.match(strFromU8(files["tokens.css"]), /--radius-md: 8px;/);
    assert.match(strFromU8(files["tailwind.css"]), /@theme \{/);
    assert.match(strFromU8(files["tokens.json"]), /"\$type": "dimension"/);
    assert.match(strFromU8(files["prompts.md"]), / --ar 16:9 --no 霓虹, neon/);
    assert.match(strFromU8(files["prompts.md"]), / --ar 9:16 --no /);
    assert.equal("ui_hero.png" in files, false);
  });

  it("maps webp and ignores content-type parameters", async () => {
    const { impl } = fakeFetch({
      "/api/images/w1": { type: "image/webp; charset=binary", bytes: PNG },
    });
    let project = sampleProject();
    project = addImageRevs(project, {
      ...base,
      slot: "web_home",
      urls: ["/api/images/w1"],
    }).project;
    const result = await buildExportZip({
      projectName: "p",
      styleLine: styleA(project),
      fetchImpl: impl,
    });
    assert.ok("web_home.webp" in unzipSync(result.bytes));
  });

  it("rejects when an image cannot be fetched, naming the slot", async () => {
    const { impl } = fakeFetch({
      "/api/images/k2": 500,
      "/api/images/w1": { type: "image/png", bytes: PNG },
    });
    await assert.rejects(
      buildExportZip({ projectName: "p", styleLine: withImages(), fetchImpl: impl }),
      /kv/,
    );
  });

  it("packs only enabled slots that have an image, and still adds the token files", async () => {
    const { impl, calls } = fakeFetch({
      "/api/images/k2": { type: "image/jpeg", bytes: JPG },
      "/api/images/w1": { type: "image/png", bytes: PNG },
    });
    const result = await buildExportZip({
      projectName: "云栖",
      styleLine: withImages(),
      fetchImpl: impl,
      enabledSlotIds: ["kv"],
      product: "云栖",
    });
    assert.deepEqual(calls, ["/api/images/k2"]);
    const files = unzipSync(result.bytes);
    assert.deepEqual(files["kv.jpg"], JPG);
    assert.equal("web_home.png" in files, false);
    assert.match(strFromU8(files["prompts.md"]), /品牌主视觉/);
    assert.match(strFromU8(files["prompts.md"]), /云栖/);
    assert.doesNotMatch(strFromU8(files["prompts.md"]), /官网首屏/);
    assert.match(strFromU8(files["tokens.css"]), /--font-sans: system-ui, sans-serif;/);
  });

  it("does not fetch or pack an excluded image, and does not use another rev", async () => {
    const { impl, calls } = fakeFetch({
      "/api/images/k1": { type: "image/png", bytes: PNG },
      "/api/images/k2": { type: "image/jpeg", bytes: JPG },
      "/api/images/w1": { type: "image/png", bytes: PNG },
    });
    const result = await buildExportZip({
      projectName: "p",
      styleLine: withImages(),
      fetchImpl: impl,
      excludeImageIds: ["k2"],
    });
    assert.deepEqual(calls, ["/api/images/w1"]);
    const files = unzipSync(result.bytes);
    assert.equal("kv.jpg" in files, false);
    assert.equal("kv.png" in files, false);
    assert.deepEqual(files["web_home.png"], PNG);
  });

  it("rejects when no slot has an image", async () => {
    const { impl } = fakeFetch({});
    await assert.rejects(
      buildExportZip({ projectName: "p", styleLine: styleA(sampleProject()), fetchImpl: impl }),
      /没有可导出的图片/,
    );
  });
});
