import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("frontend/customer/src/App.jsx", "utf8");

test("shared checkout controls use theme-aware semantic colors", () => {
  assert.match(source, /text-\[var\(--text-secondary\)\]/);
  assert.match(source, /text-\[var\(--text-heading\)\]/);
  assert.match(source, /bg-\[var\(--bg-input\)\]/);
  assert.match(source, /border-\[var\(--border\)\]/);
  assert.match(source, /text-\[var\(--text-muted\)\]/);
});

test("registration surfaces use theme-aware backgrounds and text", () => {
  assert.match(
    source,
    /<Card className="border border-\[var\(--border\)\] bg-\[var\(--bg-card\)\] font-sans shadow-xl shadow-black\/20">/,
  );
  assert.match(
    source,
    /<p className="text-sm font-black text-\[var\(--text-heading\)\]">Email Verification<\/p>/,
  );
  assert.match(
    source,
    /<h2 className="text-lg font-black text-\[var\(--text-heading\)\]">Verify your email<\/h2>/,
  );
});
