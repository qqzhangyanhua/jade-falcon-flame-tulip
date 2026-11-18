import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { slotLabel } from "./project/slot-label.ts";

describe("slotLabel", () => {
  it("uses the catalog name for every built-in slot, including the original three", () => {
    assert.deepEqual(
      [
        slotLabel("ui_hero"),
        slotLabel("kv"),
        slotLabel("web_home"),
        slotLabel("app_icon"),
        slotLabel("xhs_cover"),
        slotLabel("wechat_header"),
        slotLabel("banner"),
        slotLabel("poster"),
        slotLabel("namecard"),
        slotLabel("ppt_cover"),
        slotLabel("empty_state"),
      ],
      [
        "产品旗舰页",
        "品牌主视觉",
        "官网首屏",
        "App 图标",
        "小红书封面",
        "公众号头图",
        "横幅 Banner",
        "竖版海报",
        "名片",
        "PPT 封面",
        "空状态插画",
      ],
    );
  });

  it("calls any other slot a custom slot and keeps a missing slot as the direction", () => {
    assert.equal(slotLabel("slot_custom"), "自定义物料槽");
    assert.equal(slotLabel("not_a_catalog_id"), "自定义物料槽");
    assert.equal(slotLabel(null), "方向");
  });
});
