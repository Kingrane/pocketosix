import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

test("selected owner wallpaper is the verified lossless RGB8 asset, with its original preserved", () => {
  const asset = readFileSync(new URL("../../public/assets/alpine_bg.png", import.meta.url));
  const candidate = readFileSync(new URL("../../public/assets/alpine_bg_rgb.png", import.meta.url));
  const original = readFileSync(new URL("../../public/assets/Без названия.png", import.meta.url));
  assert.deepEqual(asset, candidate);
  assert.deepEqual(Array.from(asset.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(asset.toString("ascii", 12, 16), "IHDR");
  assert.equal(asset.readUInt32BE(16), 1420);
  assert.equal(asset.readUInt32BE(20), 799);
  assert.equal(asset[24], 8);
  assert.equal(asset[25], 2); // True-color RGB, not RGBA.
  assert.equal(createHash("sha256").update(asset).digest("hex"), "77bbd116eb2ebfa5ced8c59371f94add29a28f7cc5f2dc65e5524f2e31f3c254");
  assert.equal(createHash("sha256").update(original).digest("hex"), "39c3d44234355feefccf2efecfaa6d6da1ec2f84199e63987361ebfe17f3f980");
});
