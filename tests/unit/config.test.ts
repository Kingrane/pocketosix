import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DISK_ID, DEFAULT_DISK_URL, formatBytes, getDiskConfig, getDisplaySize, validateLoginUrl } from "../../lib/webvm-config";

test("the default disk is pinned to an immutable Alpine image and overlay ID", () => {
  assert.deepEqual(getDiskConfig({}), { url: DEFAULT_DISK_URL, backend: "cloud", id: DEFAULT_DISK_ID });
});
test("a different base cannot reuse the existing overlay", () => {
  assert.throws(() => getDiskConfig({ url: "https://example.com/new.ext2" }), /новый NEXT_PUBLIC_DISK_ID/);
  assert.throws(() => getDiskConfig({ url: "https://example.com/new.ext2", id: DEFAULT_DISK_ID }), /новый NEXT_PUBLIC_DISK_ID/);
});
test("custom HTTP images require an own namespaced disk", () => {
  assert.deepEqual(getDiskConfig({ url: "/alpine.ext2", backend: "bytes", id: "pocketosix-custom-v2" }), { url: "/alpine.ext2", backend: "bytes", id: "pocketosix-custom-v2" });
  assert.throws(() => getDiskConfig({ id: "other-app" }), /pocketosix-/);
  assert.throws(() => getDiskConfig({ id: "pocketosix-a/b" }), /pocketosix-/);
});
test("unknown disk transports and unsafe URLs are rejected", () => {
  assert.throws(() => getDiskConfig({ backend: "websocket" }), /cloud или bytes/);
  assert.throws(() => getDiskConfig({ backend: "bytes" }), /HTTP/);
  assert.throws(() => getDiskConfig({ url: "javascript:alert(1)", id: "pocketosix-test" }), /HTTPS/);
  assert.throws(() => getDiskConfig({ url: "//untrusted.example/disk", id: "pocketosix-test" }), /HTTPS/);
});
test("display dimensions preserve aspect ratio and the minimum usable desktop", () => {
  assert.deepEqual(getDisplaySize(1440, 900), { width: 1440, height: 900 });
  assert.deepEqual(getDisplaySize(800, 600), { width: 1024, height: 768 });
  assert.deepEqual(getDisplaySize(360, 720), { width: 1024, height: 2048 });
  assert.ok(Number.isFinite(getDisplaySize(0, 0).width));
});
test("display dimensions ignore subpixel jitter and cap oversized or narrow stages", () => {
  assert.deepEqual(getDisplaySize(1439.9, 899.9), getDisplaySize(1440.1, 900.1));
  assert.deepEqual(getDisplaySize(3840, 2160), { width: 3840, height: 2160 });
  assert.deepEqual(getDisplaySize(5120, 2880), { width: 4096, height: 2304 });
  assert.deepEqual(getDisplaySize(1440, 1), { width: 4096, height: 768 });
  assert.deepEqual(getDisplaySize(1, 900), { width: 1024, height: 4096 });
  for (const [width, height] of [[NaN, Infinity], [Number.MAX_VALUE, Number.MAX_VALUE], [-1, 0]]) {
    const size = getDisplaySize(width, height);
    assert.ok(Number.isInteger(size.width) && size.width >= 1024 && size.width <= 4096);
    assert.ok(Number.isInteger(size.height) && size.height >= 768 && size.height <= 4096);
  }
});
test("login redirect permits only HTTPS Tailscale domains", () => {
  assert.equal(validateLoginUrl("https://login.tailscale.com/a/test"), "https://login.tailscale.com/a/test");
  for (const value of ["javascript:alert(1)", "http://login.tailscale.com/a", "https://tailscale.com.evil.example/", "https://example.com/"]) {
    assert.throws(() => validateLoginUrl(value));
  }
});
test("storage formatting handles unavailable data and scale", () => {
  assert.equal(formatBytes(null), "—");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(1572864), "1.5 MB");
  assert.equal(formatBytes(1073741824), "1.0 GB");
});
