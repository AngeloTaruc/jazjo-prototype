import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("frontend/customer/src/App.jsx", "utf8");

test("checkout presents payment methods as accessible radio cards", () => {
  assert.match(source, /type="radio"/);
  assert.match(source, /name="paymentMethod"/);
  assert.match(source, /checked=\{form\.paymentMethod === method\.value\}/);
  assert.match(source, />\s*Selected\s*</);
  assert.match(source, /Continue to QR Payment/);
  assert.match(source, /Place COD Order/);
});

test("checkout submit button shows loading while payment redirect is prepared", () => {
  assert.match(source, /const \[placing, setPlacing\] = useState\(false\)/);
  assert.match(source, /setPlacing\(true\)/);
  assert.match(source, /finally \{\s*setPlacing\(false\);/);
  assert.match(source, /isLoading=\{placing\}/);
  assert.match(source, /isDisabled=\{placing\}/);
  assert.match(source, /Redirecting to payment/);
});
