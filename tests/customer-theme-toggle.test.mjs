import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("frontend/customer/src/App.jsx", "utf8");

test("customer header uses the HeroUI v3 compound switch API", () => {
  assert.match(source, /<Switch\.Content>/);
  assert.match(source, /<Switch\.Control>/);
  assert.match(source, /<Switch\.Thumb/);
  assert.doesNotMatch(source, /<Switch[\s\S]{0,250}startContent=/);
});
