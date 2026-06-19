import assert from "node:assert/strict";
import test from "node:test";

import {
  canAddCartQuantity,
  isRetryablePaymentReason,
  normalizeCategory,
  statusLabel,
  toggleFavoriteProduct,
  validateContact,
  validatePassword
} from "../frontend/customer/src/lib/customerLogic.js";

test("normalizeCategory maps brand categories into customer groups", () => {
  assert.equal(normalizeCategory("Coke Products", "Coke Sakto"), "Soft Drinks");
  assert.equal(normalizeCategory("Nature Spring Distilled Water Products", "Nature Spring 500ML"), "Water");
  assert.equal(normalizeCategory("Cobra Products", "Cobra Green"), "Energy Drinks");
  assert.equal(normalizeCategory("C2 Drink Products", "C2 Apple"), "Juice");
});

test("canAddCartQuantity blocks quantities above stock cases", () => {
  const result = canAddCartQuantity({
    existingQty: 2,
    addQty: 1,
    caseQty: 1,
    stockCases: 2
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /Only 2 case/);
});

test("canAddCartQuantity allows half-case additions within stock", () => {
  const result = canAddCartQuantity({
    existingQty: 1,
    addQty: 1,
    caseQty: 0.5,
    stockCases: 2
  });

  assert.equal(result.ok, true);
});

test("toggleFavoriteProduct adds and removes a product id", () => {
  const saved = toggleFavoriteProduct(["p1"], "p2");
  assert.deepEqual(saved, ["p1", "p2"]);

  const removed = toggleFavoriteProduct(saved, "p1");
  assert.deepEqual(removed, ["p2"]);
});

test("statusLabel maps API status keys to customer labels", () => {
  assert.equal(statusLabel("order_placed"), "Order Placed");
  assert.equal(statusLabel("out_for_delivery"), "Out for Delivery");
  assert.equal(statusLabel("delivered"), "Delivered");
});

test("isRetryablePaymentReason flags asynchronous QRPH states", () => {
  assert.equal(isRetryablePaymentReason("processing"), true);
  assert.equal(isRetryablePaymentReason("still_pending"), true);
  assert.equal(isRetryablePaymentReason("paid"), false);
});

test("validateContact requires Philippine mobile format", () => {
  assert.equal(validateContact("09123456789").ok, true);
  assert.equal(validateContact("+639123456789").ok, false);
});

test("validatePassword requires complexity", () => {
  assert.equal(validatePassword("StrongPass1!").ok, true);
  assert.equal(validatePassword("password123").ok, false);
});
