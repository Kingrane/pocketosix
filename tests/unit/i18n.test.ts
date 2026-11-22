import test from "node:test";
import assert from "node:assert/strict";
import { languages, loadMessages, resolveLocale, translate, type Messages } from "../../lib/i18n";

function keys(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : keys(value, path);
  }).sort();
}

test("locale defaults to English and rejects values outside the configured languages", () => {
  assert.equal(resolveLocale(), "en");
  assert.equal(resolveLocale("ru"), "ru");
  assert.equal(resolveLocale("zh"), "en");
  assert.equal(resolveLocale("../en"), "en");
  assert.equal(resolveLocale("toString"), "en");
});

test("every configured language supplies all non-empty interface translations", async () => {
  const english = await loadMessages("en");
  const reference = keys(english);
  assert.ok(reference.length > 60);
  for (const locale of Object.keys(languages) as (keyof typeof languages)[]) {
    const messages = await loadMessages(locale);
    assert.deepEqual(keys(messages), reference, `Translation keys differ for ${locale}`);
    for (const key of reference) assert.ok(translate(messages, key).trim(), `Empty translation: ${locale}.${key}`);
  }
});

test("missing or non-string translation keys are explicit errors", () => {
  assert.equal(translate({ test: { label: "Hello" } }, "test.label"), "Hello");
  assert.throws(() => translate({ test: {} }, "test.absent"), /Missing translation/);
  assert.throws(() => translate({ test: {} }, "test"), /not text/);
});
