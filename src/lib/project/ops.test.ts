import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addImageRevs,
  adoptImage,
  archiveStyle,
  createCustomSlot,
  deleteCustomSlot,
  editCustomSlot,
  enableBuiltinSlot,
  forkStyle,
  hideBuiltinSlot,
  compareRevs,
  lockCandidate,
  restoreStyle,
  rollbackStyle,
  setStyleRev,
  writebackStyle,
} from "./ops.ts";
import { currentDna, projectDocumentSchema, type ImageRev, type StyleBranch } from "./schema.ts";
import { BUILTIN_SLOTS, DEFAULT_ENABLED_SLOT_IDS, SUPPORTED_ASPECTS } from "./slots.ts";
import { slotPrompt } from "../prompts.ts";
import { sampleCandidate, sampleDna, sampleProject, sampleStyle } from "./fixtures.ts";

function counter() {
  let n = 0;
  return { newId: (prefix: string) => `${prefix}_${++n}`, now: () => 1000 + n };
}

function style(project: ReturnType<typeof sampleProject>, id: string) {
  const found = project.styles.find((s) => s.id === id);
  assert.ok(found, `style ${id} exists`);
  return found;
}

describe("lockCandidate", () => {
  it("makes the chosen candidate the active line and two others standby", () => {
    const project = sampleProject({
      phase: "direction",
      currentStyleId: null,
      styles: [],
      candidates: [
        sampleCandidate("1"),
        sampleCandidate("2"),
        sampleCandidate("3"),
        sampleCandidate("4"),
      ],
    });
    const next = lockCandidate(project, "2", counter());
    assert.equal(next.phase, "studio");
    assert.equal(next.styles.length, 3);
    assert.equal(next.styles[0].status, "active");
    assert.equal(next.styles[0].name, "方向 2");
    assert.equal(next.currentStyleId, next.styles[0].id);
    assert.deepEqual(
      next.styles.slice(1).map((s) => s.status),
      ["standby", "standby"],
    );
    assert.equal(next.styles[0].revs[0].changeLog, "锁定");
  });

  it("ignores an unknown candidate", () => {
    const project = sampleProject({ candidates: [sampleCandidate("1")] });
    assert.equal(lockCandidate(project, "nope"), project);
  });

  it("locks a reference candidate the same way as any other direction", () => {
    const reference = sampleCandidate("ref", {
      presetId: "reference",
      dna: sampleDna({ name: "参考雾蓝" }),
    });
    const project = sampleProject({
      phase: "direction",
      currentStyleId: null,
      styles: [],
      candidates: [
        sampleCandidate("1"),
        sampleCandidate("2"),
        sampleCandidate("3"),
        sampleCandidate("4"),
        reference,
      ],
    });
    const next = lockCandidate(project, "ref", counter());
    assert.equal(next.phase, "studio");
    assert.equal(next.currentSlot, "kv");
    assert.equal(next.styles.length, 3);
    assert.equal(next.styles[0].status, "active");
    assert.equal(next.styles[0].name, "参考雾蓝");
    assert.equal(currentDna(next.styles[0]).name, "参考雾蓝");
    assert.deepEqual(
      next.styles.slice(1).map((style) => style.status),
      ["standby", "standby"],
    );
    assert.equal(next.styles[0].revs[0].changeLog, "锁定");
  });
});

describe("writebackStyle", () => {
  it("creates the next rev from the viewed rev and records the changes", () => {
    const project = sampleProject();
    const dna = sampleDna({ name: "风格 a", light: "侧逆光" });
    const next = writebackStyle(project, { styleId: "a", changeLog: "改光线", dna }, counter());
    const a = style(next, "a");
    assert.equal(a.currentRev, 2);
    assert.equal(a.revs.length, 2);
    assert.deepEqual(
      { rev: a.revs[1].rev, parentRev: a.revs[1].parentRev, changeLog: a.revs[1].changeLog },
      { rev: 2, parentRev: 1, changeLog: "改光线" },
    );
    assert.deepEqual(a.revs[1].changes, [{ field: "light", from: "柔和顶光", to: "侧逆光" }]);
    assert.equal(currentDna(a).light, "侧逆光");
  });

  it("does not repeat a rev number when writing back from an older rev", () => {
    let project = sampleProject();
    project = writebackStyle(project, {
      styleId: "a",
      changeLog: "v2",
      dna: sampleDna({ light: "x" }),
    });
    project = writebackStyle(project, {
      styleId: "a",
      changeLog: "v3",
      dna: sampleDna({ light: "y" }),
    });
    project = setStyleRev(project, "a", 1);
    project = writebackStyle(project, {
      styleId: "a",
      changeLog: "from v1",
      dna: sampleDna({ light: "z" }),
    });
    const a = style(project, "a");
    assert.deepEqual(
      a.revs.map((r) => r.rev),
      [1, 2, 3, 4],
    );
    assert.equal(a.revs[3].parentRev, 1);
    assert.equal(a.currentRev, 4);
  });

  it("prefers explicitly supplied changes", () => {
    const changes = [{ field: "mood", from: "a", to: "b" }];
    const next = writebackStyle(sampleProject(), {
      styleId: "a",
      changeLog: "c",
      dna: sampleDna(),
      changes,
    });
    assert.deepEqual(style(next, "a").revs[1].changes, changes);
  });
});

describe("rollbackStyle", () => {
  it("appends a new rev that copies the target DNA and records the change from the viewed rev", () => {
    let project = sampleProject();
    project = writebackStyle(project, {
      styleId: "a",
      changeLog: "v2",
      dna: sampleDna({ name: "风格 a", light: "侧逆光" }),
    });
    project = writebackStyle(project, {
      styleId: "a",
      changeLog: "v3",
      dna: sampleDna({ name: "风格 a", light: "硬光" }),
    });
    project = setStyleRev(project, "a", 2);
    const source = style(project, "a").revs[0].dna;

    const next = rollbackStyle(project, "a", 1, counter());
    const a = style(next, "a");
    const rolled = a.revs[3];

    assert.deepEqual(
      a.revs.map((rev) => rev.rev),
      [1, 2, 3, 4],
    );
    assert.equal(a.currentRev, 4);
    assert.deepEqual(
      { rev: rolled.rev, parentRev: rolled.parentRev, changeLog: rolled.changeLog },
      { rev: 4, parentRev: 2, changeLog: "回滚至 rev1" },
    );
    assert.deepEqual(rolled.dna, source);
    assert.notEqual(rolled.dna, source);
    assert.deepEqual(rolled.changes, [{ field: "light", from: "侧逆光", to: "柔和顶光" }]);
    assert.equal(currentDna(a).light, "柔和顶光");
  });

  it("does nothing when the target DNA matches the viewed DNA", () => {
    const viewingTarget = sampleProject();
    assert.equal(rollbackStyle(viewingTarget, "a", 1), viewingTarget);

    let project = sampleProject();
    const same = sampleDna({ name: "风格 a", light: "柔和顶光" });
    project = writebackStyle(project, {
      styleId: "a",
      changeLog: "v2",
      dna: sampleDna({ name: "风格 a", light: "侧逆光" }),
    });
    project = writebackStyle(project, { styleId: "a", changeLog: "v3", dna: same });
    assert.equal(style(project, "a").currentRev, 3);
    assert.equal(rollbackStyle(project, "a", 1), project);
    assert.equal(style(project, "a").revs.length, 3);
  });

  it("does not rewrite or mutate older revs", () => {
    let project = sampleProject();
    project = writebackStyle(project, {
      styleId: "a",
      changeLog: "v2",
      dna: sampleDna({ name: "风格 a", light: "侧逆光", mood: ["冷静", "锋利"] }),
    });
    project = setStyleRev(project, "a", 1);
    const before = style(project, "a").revs.map((rev) => rev);
    const sourceLight = before[0].dna.light;
    const sourcePrimary = before[0].dna.colors.primary;

    const next = rollbackStyle(project, "a", 2, counter());
    const a = style(next, "a");

    assert.equal(a.revs[0], before[0]);
    assert.equal(a.revs[1], before[1]);
    assert.equal(before[0].dna.light, sourceLight);
    assert.equal(before[0].changeLog, "锁定");
    assert.equal(before[1].changeLog, "v2");
    assert.equal(a.revs[2].changeLog, "回滚至 rev2");
    assert.equal(a.revs[2].parentRev, 1);

    a.revs[2].dna.light = "被改";
    a.revs[2].dna.colors.primary = "#000000";
    a.revs[2].dna.mood.push("多余");
    assert.equal(before[1].dna.light, "侧逆光");
    assert.equal(before[1].dna.colors.primary, sourcePrimary);
    assert.deepEqual(before[1].dna.mood, ["冷静", "锋利"]);
  });

  it("ignores an unknown style or rev", () => {
    const project = sampleProject();
    assert.equal(rollbackStyle(project, "zzz", 1), project);
    assert.equal(rollbackStyle(project, "a", 9), project);
    assert.equal(style(project, "a").revs.length, 1);
    assert.equal(style(project, "b").currentRev, 1);
  });
});

function imageRev(id: string, styleRev: number, createdAt: number, url: string): ImageRev {
  return {
    id,
    parentId: null,
    url,
    createdAt,
    action: "generate",
    diff: id,
    writeback: "none",
    styleRev,
  };
}

function lineWithImages(
  project: ReturnType<typeof sampleProject>,
  images: { kv?: ImageRev[]; ui_hero?: ImageRev[] },
): StyleBranch {
  const branch = style(project, "a");
  return {
    ...branch,
    assets: {
      ...branch.assets,
      kv: { ...branch.assets.kv, revs: images.kv ?? [] },
      ui_hero: { ...branch.assets.ui_hero, revs: images.ui_hero ?? [] },
    },
  };
}

describe("compareRevs", () => {
  it("diffs the two DNAs and picks each slot's latest image for those revs", () => {
    let project = sampleProject();
    project = writebackStyle(project, {
      styleId: "a",
      changeLog: "v2",
      dna: sampleDna({ name: "风格 a", light: "侧逆光" }),
    });
    const branch = lineWithImages(project, {
      kv: [
        imageRev("kv-old", 1, 10, "/api/images/kv-old"),
        imageRev("kv-new", 1, 30, "/api/images/kv-new"),
        imageRev("kv-stale", 1, 20, "/api/images/kv-stale"),
        imageRev("kv-rev2", 2, 40, "/api/images/kv-rev2"),
      ],
      ui_hero: [imageRev("hero-1", 1, 5, "/api/images/hero")],
    });

    const compared = compareRevs(branch, 1, 2, ["kv", "web_home", "ui_hero"]);

    assert.deepEqual(compared.changes, [{ field: "light", from: "柔和顶光", to: "侧逆光" }]);
    assert.deepEqual(
      compared.slots.map((slot) => slot.slot),
      ["kv", "web_home", "ui_hero"],
    );
    assert.equal(compared.slots[0].revA?.url, "/api/images/kv-new");
    assert.equal(compared.slots[0].revB?.url, "/api/images/kv-rev2");
    assert.equal(compared.slots[1].revA, null);
    assert.equal(compared.slots[1].revB, null);
    assert.equal(compared.slots[2].revA?.url, "/api/images/hero");
    assert.equal(compared.slots[2].revB, null);
  });

  it("keeps the later image when createdAt ties, and returns null for a slot with no image", () => {
    let project = sampleProject();
    project = writebackStyle(project, {
      styleId: "a",
      changeLog: "v2",
      dna: sampleDna({ name: "风格 a", light: "侧逆光" }),
    });
    const branch = lineWithImages(project, {
      kv: [
        imageRev("tie-a", 1, 30, "/api/images/tie-a"),
        imageRev("other-rev", 2, 99, "/api/images/other"),
        imageRev("tie-b", 1, 30, "/api/images/tie-b"),
      ],
    });

    const compared = compareRevs(branch, 1, 2, ["missing", "kv"]);

    assert.deepEqual(
      compared.slots.map((slot) => [slot.slot, slot.revA?.url ?? null, slot.revB?.url ?? null]),
      [
        ["missing", null, null],
        ["kv", "/api/images/tie-b", "/api/images/other"],
      ],
    );
    assert.deepEqual(compared.changes, [{ field: "light", from: "柔和顶光", to: "侧逆光" }]);
  });
});

describe("setStyleRev", () => {
  it("changes the viewed rev", () => {
    const project = writebackStyle(sampleProject(), {
      styleId: "a",
      changeLog: "c",
      dna: sampleDna({ light: "x" }),
    });
    assert.equal(style(setStyleRev(project, "a", 1), "a").currentRev, 1);
  });

  it("ignores a rev that does not exist", () => {
    const project = sampleProject();
    assert.equal(style(setStyleRev(project, "a", 9), "a").currentRev, 1);
  });
});

describe("archiveStyle and restoreStyle", () => {
  it("promotes the next live line when the current line is archived", () => {
    const result = archiveStyle(sampleProject(), "a");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(style(result.project, "a").status, "archived");
    assert.equal(result.project.currentStyleId, "b");
    assert.equal(style(result.project, "b").status, "active");
    assert.equal(style(result.project, "c").status, "standby");
  });

  it("keeps the current line when another line is archived", () => {
    const result = archiveStyle(sampleProject(), "c");
    assert.ok(result.ok);
    assert.equal(result.project.currentStyleId, "a");
    assert.equal(style(result.project, "c").status, "archived");
  });

  it("skips already archived lines when promoting", () => {
    const first = archiveStyle(sampleProject(), "b");
    assert.ok(first.ok);
    const second = archiveStyle(first.project, "a");
    assert.ok(second.ok);
    assert.equal(second.project.currentStyleId, "c");
  });

  it("refuses to archive the last live line", () => {
    const project = sampleProject({
      styles: [sampleStyle("a", { status: "active" }), sampleStyle("b", { status: "archived" })],
    });
    const result = archiveStyle(project, "a");
    assert.deepEqual(result, { ok: false, reason: "last_live_style" });
  });

  it("reports an unknown line", () => {
    assert.deepEqual(archiveStyle(sampleProject(), "zzz"), { ok: false, reason: "not_found" });
  });

  it("restores an archived line as standby without changing the current line", () => {
    const archived = archiveStyle(sampleProject(), "c");
    assert.ok(archived.ok);
    const restored = restoreStyle(archived.project, "c");
    assert.equal(style(restored, "c").status, "standby");
    assert.equal(restored.currentStyleId, "a");
  });
});

describe("forkStyle", () => {
  it("forks from the viewed rev into a new current line", () => {
    let project = sampleProject();
    project = writebackStyle(project, {
      styleId: "a",
      changeLog: "v2",
      dna: sampleDna({ name: "风格 a", light: "侧逆光" }),
    });
    project = writebackStyle(project, {
      styleId: "a",
      changeLog: "v3",
      dna: sampleDna({ name: "风格 a", light: "硬光" }),
    });
    project = setStyleRev(project, "a", 2);
    project = addImageRevs(
      project,
      {
        styleId: "a",
        slot: "kv",
        urls: ["/api/images/x"],
        action: "generate",
        diff: "d",
        parentId: null,
      },
      counter(),
    ).project;

    const next = forkStyle(project, "a", counter());
    assert.equal(next.styles.length, 4);
    const forked = next.styles.find((s) => s.origin === "fork");
    assert.ok(forked);
    assert.equal(forked.name, "风格 a · 分叉");
    assert.equal(forked.origin, "fork");
    assert.equal(forked.status, "active");
    assert.equal(forked.currentRev, 1);
    assert.equal(forked.revs.length, 1);
    assert.equal(forked.revs[0].changeLog, "分叉自 风格 a rev2");
    assert.equal(forked.revs[0].parentRev, null);
    assert.equal(forked.revs[0].dna.light, "侧逆光");
    assert.equal(forked.candidateUrl, "/api/images/preview_a");
    assert.deepEqual(forked.assets.kv.revs, []);
    assert.equal(forked.assets.kv.adoptedId, null);
    assert.equal(next.currentStyleId, forked.id);
    assert.equal(style(next, "a").status, "standby");
    assert.equal(style(next, "a").revs.length, 3);
    assert.equal(style(next, "a").assets.kv.revs.length, 1);
  });

  it("leaves archived lines archived", () => {
    const archived = archiveStyle(sampleProject(), "c");
    assert.ok(archived.ok);
    const next = forkStyle(archived.project, "a");
    assert.equal(style(next, "c").status, "archived");
  });
});

describe("addImageRevs and adoptImage", () => {
  const input = {
    styleId: "a",
    slot: "kv" as const,
    action: "generate" as const,
    diff: "d",
    parentId: null,
  };

  it("records the viewed style rev and adopts the first new image when none is adopted", () => {
    const { project, ids } = addImageRevs(
      sampleProject(),
      { ...input, urls: ["/u/1", "/u/2"] },
      counter(),
    );
    assert.equal(ids.length, 2);
    const kv = style(project, "a").assets.kv;
    assert.deepEqual(
      kv.revs.map((r) => r.url),
      ["/u/1", "/u/2"],
    );
    assert.equal(kv.adoptedId, ids[0]);
    assert.equal(kv.revs[0].styleRev, 1);
  });

  it("keeps every image rev past ten", () => {
    let project = sampleProject();
    for (let i = 0; i < 15; i += 1) {
      project = addImageRevs(project, { ...input, urls: [`/u/${i}`] }).project;
    }
    const kv = style(project, "a").assets.kv;
    assert.equal(kv.revs.length, 15);
    assert.equal(kv.revs[0].url, "/u/0");
  });

  it("does not move an existing adoption", () => {
    const first = addImageRevs(sampleProject(), { ...input, urls: ["/u/1"] });
    const second = addImageRevs(first.project, { ...input, urls: ["/u/2"] });
    assert.equal(style(second.project, "a").assets.kv.adoptedId, first.ids[0]);
  });

  it("adopts a chosen image", () => {
    const first = addImageRevs(sampleProject(), { ...input, urls: ["/u/1", "/u/2"] });
    const next = adoptImage(first.project, "a", "kv", first.ids[1]);
    assert.equal(style(next, "a").assets.kv.adoptedId, first.ids[1]);
  });

  it("ignores adopting an image the slot does not hold", () => {
    const project = sampleProject();
    assert.equal(style(adoptImage(project, "a", "kv", "ghost"), "a").assets.kv.adoptedId, null);
  });

  it("returns no ids for an unknown style", () => {
    const result = addImageRevs(sampleProject(), { ...input, styleId: "zzz", urls: ["/u/1"] });
    assert.deepEqual(result.ids, []);
  });
});

const EXTRA_BUILTINS = [
  {
    id: "app_icon",
    name: "App 图标",
    aspect: "1:1",
    purpose: "方形应用图标，居中图形符号，不要做成海报",
    lead: /centered graphic symbol/,
  },
  {
    id: "xhs_cover",
    name: "小红书封面",
    aspect: "3:4",
    purpose: "小红书笔记封面，竖版，标题清楚",
    lead: /Xiaohongshu note cover/,
  },
  {
    id: "wechat_header",
    name: "公众号头图",
    aspect: "21:9",
    purpose: "公众号文章头图，超宽横幅",
    lead: /WeChat official-account header/,
  },
  {
    id: "banner",
    name: "横幅 Banner",
    aspect: "5:2",
    purpose: "横幅 Banner，宽幅品牌或活动条",
    lead: /wide brand or campaign banner/,
  },
  {
    id: "poster",
    name: "竖版海报",
    aspect: "2:3",
    purpose: "竖版海报，适合打印张贴",
    lead: /vertical print poster/,
  },
  {
    id: "namecard",
    name: "名片",
    aspect: "3:2",
    purpose: "横版名片，姓名和联系方式位置清楚",
    lead: /name and contact details/,
  },
  {
    id: "ppt_cover",
    name: "PPT 封面",
    aspect: "16:9",
    purpose: "演示文稿封面，标题明确，留白干净",
    lead: /presentation cover/,
  },
  {
    id: "empty_state",
    name: "空状态插画",
    aspect: "4:3",
    purpose: "空状态插画，元素少，说明暂时没有内容",
    lead: /empty-state illustration/,
  },
] as const;

describe("built-in slot catalog", () => {
  it("keeps eleven slots, with new projects still enabling only the original three", () => {
    assert.deepEqual(
      BUILTIN_SLOTS.slice(0, 3).map((slot) => slot.id),
      ["ui_hero", "kv", "web_home"],
    );
    assert.deepEqual(DEFAULT_ENABLED_SLOT_IDS, ["ui_hero", "kv", "web_home"]);
    assert.equal(BUILTIN_SLOTS.length, 11);
    assert.equal(new Set(BUILTIN_SLOTS.map((slot) => slot.promptTemplate)).size, 11);

    for (const expected of EXTRA_BUILTINS) {
      const slot = BUILTIN_SLOTS.find((item) => item.id === expected.id);
      assert.ok(slot, expected.id);
      assert.equal(slot.name, expected.name);
      assert.equal(slot.aspect, expected.aspect);
      assert.equal(slot.purpose, expected.purpose);
      assert.ok(SUPPORTED_ASPECTS.includes(slot.aspect));
      assert.match(slot.promptTemplate, expected.lead);
      assert.match(slot.promptTemplate, /\{product\}/);
    }
  });

  it("asks for an app icon as a centered symbol, not a poster", () => {
    const prompt = slotPrompt(sampleDna(), "app_icon", "Northwind", "");
    assert.match(prompt, /centered graphic symbol/);
    assert.match(prompt, /not a poster/);
    assert.match(prompt, /Northwind/);
    assert.equal(prompt.includes("Brand key visual poster"), false);
  });
});

describe("enableBuiltinSlot and hideBuiltinSlot", () => {
  it("appends a built-in and puts an empty asset on every style line", () => {
    const next = enableBuiltinSlot(sampleProject(), "app_icon");
    assert.deepEqual(next.enabledSlotIds, ["ui_hero", "kv", "web_home", "app_icon"]);
    for (const line of next.styles) {
      assert.deepEqual(line.assets.app_icon, { slot: "app_icon", adoptedId: null, revs: [] });
    }
  });

  it("does not enable an id that is not built in, or the same built-in twice", () => {
    const unknown = enableBuiltinSlot(sampleProject(), "custom_banner");
    assert.deepEqual(unknown.enabledSlotIds, ["ui_hero", "kv", "web_home"]);
    const once = enableBuiltinSlot(sampleProject(), "poster");
    const twice = enableBuiltinSlot(once, "poster");
    assert.equal(twice.enabledSlotIds.filter((id) => id === "poster").length, 1);
  });

  it("keeps images when a slot is hidden and still has them when it is enabled again", () => {
    const enabled = enableBuiltinSlot(sampleProject(), "app_icon");
    const added = addImageRevs(
      enabled,
      {
        styleId: "a",
        slot: "app_icon",
        urls: ["/api/images/icon"],
        action: "generate",
        diff: "图标",
        parentId: null,
      },
      counter(),
    );
    const hidden = hideBuiltinSlot(added.project, "app_icon");
    assert.deepEqual(hidden.enabledSlotIds, ["ui_hero", "kv", "web_home"]);
    assert.equal(hidden.currentSlot, "kv");
    assert.equal(style(hidden, "a").assets.app_icon.revs[0]?.url, "/api/images/icon");
    assert.equal(style(hidden, "b").assets.app_icon.revs.length, 0);

    const again = enableBuiltinSlot(hidden, "app_icon");
    assert.deepEqual(again.enabledSlotIds, ["ui_hero", "kv", "web_home", "app_icon"]);
    assert.equal(style(again, "a").assets.app_icon.revs[0]?.url, "/api/images/icon");
    assert.equal(style(again, "a").assets.app_icon.adoptedId, added.ids[0]);
  });

  it("selects the first remaining slot when the current one is hidden", () => {
    const hidden = hideBuiltinSlot(sampleProject({ currentSlot: "kv" }), "kv");
    assert.deepEqual(hidden.enabledSlotIds, ["ui_hero", "web_home"]);
    assert.equal(hidden.currentSlot, "ui_hero");
    assert.equal(style(hidden, "a").assets.kv.revs.length, 0);
  });

  it("refuses to hide the last enabled slot", () => {
    const project = sampleProject({ enabledSlotIds: ["kv"], currentSlot: "kv" });
    const next = hideBuiltinSlot(project, "kv");
    assert.deepEqual(next.enabledSlotIds, ["kv"]);
    assert.equal(next.currentSlot, "kv");
    assert.equal(style(next, "a").assets.kv.slot, "kv");
  });
});

describe("createCustomSlot", () => {
  it("appends a custom slot definition, enables it, and puts an empty asset on every style line", () => {
    const next = createCustomSlot(
      sampleProject(),
      {
        name: " 电梯海报 ",
        aspect: "1:2",
        purpose: " 竖向张贴 ",
        extraPrompt: " 底部留白 ",
      },
      counter(),
    );

    assert.deepEqual(next.customSlots, [
      {
        id: "cslot_1",
        name: "电梯海报",
        aspect: "1:2",
        purpose: "竖向张贴",
        extraPrompt: "底部留白",
      },
    ]);
    assert.equal(next.customSlots[0]?.id.startsWith("cslot_"), true);
    assert.deepEqual(next.enabledSlotIds, ["ui_hero", "kv", "web_home", "cslot_1"]);
    assert.equal(next.currentSlot, "kv");
    for (const line of next.styles) {
      assert.deepEqual(line.assets.cslot_1, { slot: "cslot_1", adoptedId: null, revs: [] });
    }
    const { mode: _mode, ...document } = next;
    assert.equal(projectDocumentSchema.safeParse(document).success, true);
  });

  it("omits an empty extra prompt and rejects drafts outside the limits", () => {
    const project = sampleProject();
    const plain = createCustomSlot(
      project,
      { name: "贴纸", aspect: "1:1", purpose: "封口", extraPrompt: "   " },
      counter(),
    );
    assert.equal("extraPrompt" in (plain.customSlots[0] ?? {}), false);

    const atLimit = createCustomSlot(
      project,
      {
        name: "a".repeat(40),
        aspect: "9:20",
        purpose: "b".repeat(200),
        extraPrompt: "c".repeat(400),
      },
      counter(),
    );
    assert.equal(atLimit.customSlots[0]?.name.length, 40);
    assert.equal(atLimit.customSlots[0]?.purpose.length, 200);
    assert.equal(atLimit.customSlots[0]?.extraPrompt?.length, 400);
    assert.equal(atLimit.customSlots[0]?.aspect, "9:20");

    const rejected = [
      { name: "", aspect: "1:1", purpose: "封口" },
      { name: "   ", aspect: "1:1", purpose: "封口" },
      { name: "a".repeat(41), aspect: "1:1", purpose: "封口" },
      { name: "贴纸", aspect: "1:1", purpose: "" },
      { name: "贴纸", aspect: "1:1", purpose: "b".repeat(201) },
      { name: "贴纸", aspect: "1:1", purpose: "封口", extraPrompt: "c".repeat(401) },
      { name: "贴纸", aspect: "auto", purpose: "封口" },
      { name: "贴纸", aspect: "7:1", purpose: "封口" },
    ];
    for (const draft of rejected) {
      assert.equal(createCustomSlot(project, draft, counter()), project);
    }
  });
});

describe("editCustomSlot", () => {
  it("updates the definition and keeps the id and existing images", () => {
    const created = createCustomSlot(
      sampleProject(),
      { name: "电梯海报", aspect: "1:2", purpose: "竖向张贴", extraPrompt: "底部留白" },
      counter(),
    );
    const id = created.customSlots[0]?.id ?? "";
    const added = addImageRevs(
      created,
      {
        styleId: "a",
        slot: id,
        urls: ["/api/images/tall"],
        action: "generate",
        diff: "电梯",
        parentId: null,
      },
      counter(),
    );
    const edited = editCustomSlot(added.project, id, {
      name: " 门厅海报 ",
      aspect: "9:16",
      purpose: " 入户展示 ",
      extraPrompt: "",
    });

    assert.deepEqual(edited.customSlots, [
      { id, name: "门厅海报", aspect: "9:16", purpose: "入户展示" },
    ]);
    assert.equal("extraPrompt" in (edited.customSlots[0] ?? {}), false);
    assert.deepEqual(edited.enabledSlotIds, created.enabledSlotIds);
    assert.equal(edited.currentSlot, "kv");
    assert.equal(style(edited, "a").assets[id]?.revs[0]?.url, "/api/images/tall");
    assert.equal(style(edited, "a").assets[id]?.adoptedId, added.ids[0]);
    assert.equal(style(edited, "b").assets[id]?.revs.length, 0);
  });

  it("leaves the project unchanged when the id is unknown or the draft is invalid", () => {
    const created = createCustomSlot(
      sampleProject(),
      { name: "电梯海报", aspect: "1:2", purpose: "竖向张贴" },
      counter(),
    );
    const id = created.customSlots[0]?.id ?? "";
    assert.equal(
      editCustomSlot(created, "cslot_missing", { name: "别的", aspect: "1:1", purpose: "别的用途" }),
      created,
    );
    assert.equal(
      editCustomSlot(created, id, { name: "", aspect: "16:9", purpose: "竖向张贴" }),
      created,
    );
    assert.equal(created.customSlots[0]?.aspect, "1:2");
  });
});

describe("deleteCustomSlot", () => {
  it("drops the definition and the enabled id but keeps the images", () => {
    const created = createCustomSlot(
      sampleProject(),
      { name: "电梯海报", aspect: "1:2", purpose: "竖向张贴" },
      counter(),
    );
    const id = created.customSlots[0]?.id ?? "";
    const added = addImageRevs(
      { ...created, currentSlot: id },
      {
        styleId: "a",
        slot: id,
        urls: ["/api/images/tall"],
        action: "generate",
        diff: "电梯",
        parentId: null,
      },
      counter(),
    );
    const deleted = deleteCustomSlot(added.project, id);

    assert.deepEqual(deleted.customSlots, []);
    assert.deepEqual(deleted.enabledSlotIds, ["ui_hero", "kv", "web_home"]);
    assert.equal(deleted.enabledSlotIds.includes(id), false);
    assert.equal(deleted.currentSlot, "ui_hero");
    assert.equal(style(deleted, "a").assets[id]?.revs[0]?.url, "/api/images/tall");
    assert.equal(style(deleted, "b").assets[id]?.revs.length, 0);
  });

  it("refuses to delete the last enabled slot or an unknown id", () => {
    const only = sampleProject({
      enabledSlotIds: ["cslot_only"],
      currentSlot: "cslot_only",
      customSlots: [{ id: "cslot_only", name: "只剩", aspect: "1:1", purpose: "唯一" }],
    });
    assert.equal(deleteCustomSlot(only, "cslot_only"), only);
    const project = sampleProject();
    assert.equal(deleteCustomSlot(project, "cslot_missing"), project);
  });
});

describe("custom slot prompt", () => {
  it("uses one generic template plus the name, purpose, and extra prompt", () => {
    const dna = sampleDna();
    const tall = slotPrompt(dna, "cslot_1", "Northwind", "春季", {
      name: "竖条海报",
      purpose: "电梯间张贴",
      extraPrompt: "留出底部二维码",
    });
    const sticker = slotPrompt(dna, "cslot_2", "Northwind", "春季", {
      name: "方形贴纸",
      purpose: "包装封口",
    });

    assert.equal(
      tall.startsWith(
        'Custom brand deliverable "竖条海报" for "Northwind". Purpose: 电梯间张贴. 留出底部二维码',
      ),
      true,
    );
    assert.equal(
      sticker.startsWith('Custom brand deliverable "方形贴纸" for "Northwind". Purpose: 包装封口.'),
      true,
    );
    assert.equal(sticker.includes("留出底部二维码"), false);
    assert.equal(tall.includes("方形贴纸"), false);
    assert.match(tall, /Headline \/ offer: "春季"/);
    assert.match(tall, /Visual system: calm blue interface/);
    assert.equal(tall.includes("Brand key visual poster"), false);
    assert.equal(sticker.includes("centered graphic symbol"), false);
    assert.equal(sticker.includes("Website homepage hero"), false);
  });
});
