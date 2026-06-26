import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("frontend/customer/src/App.jsx", "utf8");
const adminSource = fs.readFileSync("frontend/customer/src/AdminPanel.jsx", "utf8");
const apiSource = fs.readFileSync("frontend/customer/src/lib/api.js", "utf8");
const serverSource = fs.readFileSync("server/index.mjs", "utf8");

test("registration uses a timed verification-code modal with resend", () => {
  assert.match(source, /verificationModalOpen/);
  assert.match(source, /verificationExpiresIn/);
  assert.match(source, /resendAvailableIn/);
  assert.match(source, /<Modal\.Header>[\s\S]*Verify your email/);
  assert.match(source, /Resend code/);
  assert.match(source, /Confirm Code/);
});

test("registration checks existing email before enabling verification and registration", () => {
  assert.match(apiSource, /apiCheckRegistrationEmail/);
  assert.match(apiSource, /\/api\/auth\/check-email/);
  assert.match(serverSource, /\/api\/auth\/check-email/);
  assert.match(source, /apiCheckRegistrationEmail/);
  assert.match(source, /window\.setTimeout\([\s\S]*,\s*650\)/);
  assert.match(source, /registrationState\.canSendVerificationCode/);
  assert.match(source, /registrationState\.canRegister/);
  assert.match(source, /Email is already registered\./);
});

test("login page orders browse products before login and create account", () => {
  const loginStart = source.indexOf("function LoginPage");
  const loginEnd = source.indexOf("function RegisterPage");
  const loginSource = source.slice(loginStart, loginEnd);
  assert.match(loginSource, /Browse products first[\s\S]*Login[\s\S]*Create an account/);
});

test("registration routes account and verification errors to inline fields", () => {
  assert.match(source, /setFieldErrors\(\{ email:/);
  assert.match(source, /setFieldErrors\(\{ verificationCode:/);
  assert.match(source, /isInvalid=\{Boolean\(displayedFieldErrors\.email\)\}/);
  assert.match(source, /isInvalid=\{Boolean\(fieldErrors\.verificationCode\)\}/);
});

test("profile routes validation errors to inline fields", () => {
  assert.match(source, /setFieldErrors\(\{ address:/);
  assert.match(source, /fieldErrors\.address/);
  assert.match(source, /isInvalid=\{Boolean\(fieldErrors\.currentPassword\)\}/);
  assert.match(source, /isInvalid=\{Boolean\(fieldErrors\.newPassword\)\}/);
});

test("admin delivery details modal uses order timeline and grouped items", () => {
  assert.match(adminSource, /function DeliveryTimeline/);
  assert.match(adminSource, /function collapseDeliveryTracks/);
  assert.match(adminSource, /const tracks = collapseDeliveryTracks\(data\?\.productTracks \|\| \[\]\)/);
  assert.match(adminSource, /selectedOrderItems/);
  assert.match(adminSource, /selectedOrderMatches\.flatMap/);
  assert.match(adminSource, /Order Progress/);
  assert.match(adminSource, /selectedOrderItems\.map/);
  assert.match(adminSource, />\s*Previous\s*</);
  assert.match(adminSource, />\s*Next\s*</);
  assert.match(serverSource, /const items = \(order\.items \|\| \[\]\)\.map/);
  assert.match(serverSource, /productName: items\.length > 1 \? `\$\{items\.length\} items`/);
});

test("admin orders use api pagination and status bulk delete", () => {
  assert.match(apiSource, /apiAdminOrders\(\{ page = 1, perPage = 10, status = "All", search = "" \}/);
  assert.match(apiSource, /if \(data\.pagination\)/);
  assert.match(apiSource, /matchesStatus = status === "All" \|\| statusLabel\(order\.status\) === status/);
  assert.match(apiSource, /apiAdminBulkDeleteOrdersByStatus/);
  assert.match(adminSource, /bulkDeleteByStatus/);
  assert.match(adminSource, /const pageControls =/);
  assert.match(adminSource, />\s*Previous\s*</);
  assert.match(adminSource, />\s*Next\s*</);
  assert.match(adminSource, /apiAdminOrders\(\{ page: 1, perPage: 10000, status: filter, search: "" \}\)/);
  assert.match(adminSource, /await apiAdminDeleteOrder\(order\.id\)/);
  assert.match(adminSource, /Delete \{filter === "All" \? "by Status" : filter\}/);
  assert.match(serverSource, /listAdminOrdersDetailedPage/);
  assert.match(serverSource, /\/api\/panel\/admin\/orders\/bulk-delete/);
});
