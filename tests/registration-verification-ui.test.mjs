import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("frontend/customer/src/App.jsx", "utf8");

test("registration uses a timed verification-code modal with resend", () => {
  assert.match(source, /verificationModalOpen/);
  assert.match(source, /verificationExpiresIn/);
  assert.match(source, /resendAvailableIn/);
  assert.match(source, /<Modal\.Header>[\s\S]*Verify your email/);
  assert.match(source, /Resend code/);
  assert.match(source, /Confirm Code/);
});
