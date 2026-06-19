import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("frontend/customer/src/StaffPanel.jsx", "utf8");

test("staff panel uses the HeroUI v3 compound pagination API", () => {
  assert.doesNotMatch(source, /<Pagination\s+total=/);
  assert.match(source, /<Pagination\.Content>/);
  assert.match(source, /<Pagination\.Previous/);
  assert.match(source, /<Pagination\.Next/);
});
