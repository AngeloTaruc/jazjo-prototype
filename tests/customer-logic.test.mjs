import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDeliveryFee,
  canAddCartQuantity,
  canAccessPanelRoute,
  canRepayOrder,
  formatCountdown,
  isRetryablePaymentReason,
  normalizeCategory,
  paymentStatusLabel,
  partitionProductsByFavorites,
  statusLabel,
  toggleFavoriteProduct,
  validateContact,
  validateDeliveryAddress,
  validatePassword
} from "../frontend/customer/src/lib/customerLogic.js";

test("normalizeCategory maps brand categories into customer groups", () => {
  assert.equal(normalizeCategory("Coke Products", "Coke Sakto"), "Soft Drinks");
  assert.equal(normalizeCategory("Nature Spring Distilled Water Products", "Nature Spring 500ML"), "Water");
  assert.equal(normalizeCategory("Cobra Products", "Cobra Green"), "Energy Drinks");
  assert.equal(normalizeCategory("C2 Drink Products", "C2 Apple"), "Juice");
  assert.equal(normalizeCategory("RC Products", "RC Big 1 Liter"), "Soft Drinks");
  assert.equal(normalizeCategory("Juice/Tea", "C2 Lemon"), "Juice");
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

test("partitionProductsByFavorites separates saved products without changing order", () => {
  const products = [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }];
  const result = partitionProductsByFavorites(products, ["p3", "p2"]);

  assert.deepEqual(result.favoriteProducts.map((product) => product.id), ["p2", "p3"]);
  assert.deepEqual(result.otherProducts.map((product) => product.id), ["p1", "p4"]);
  assert.deepEqual(products.map((product) => product.id), ["p1", "p2", "p3", "p4"]);
});

test("calculateDeliveryFee uses configurable fee and free-delivery minimum", () => {
  const settings = { deliveryFee: 75, freeDeliveryMinimum: 500 };

  assert.equal(calculateDeliveryFee(0, settings), 0);
  assert.equal(calculateDeliveryFee(499, settings), 75);
  assert.equal(calculateDeliveryFee(500, settings), 0);
  assert.equal(calculateDeliveryFee(499, { deliveryFee: -1, freeDeliveryMinimum: "bad" }), 60);
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

test("paymentStatusLabel presents webhook payment state for QRPH orders", () => {
  assert.equal(paymentStatusLabel("paid", "Pending Payment"), "Paid");
  assert.equal(paymentStatusLabel("pending", "Pending Payment"), "Awaiting QRPH");
  assert.equal(paymentStatusLabel("processing", "Pending Payment"), "Processing");
  assert.equal(paymentStatusLabel("", "Order Placed"), "Pending");
});

test("canAccessPanelRoute allows only matching admin and staff roles", () => {
  assert.equal(canAccessPanelRoute("admin/orders", "admin"), true);
  assert.equal(canAccessPanelRoute("admin/orders", "customer"), false);
  assert.equal(canAccessPanelRoute("staff/orders", "staff"), true);
  assert.equal(canAccessPanelRoute("staff/orders", "admin"), true);
  assert.equal(canAccessPanelRoute("orders", "customer"), true);
});

test("canRepayOrder only allows pending unpaid QRPH orders", () => {
  assert.equal(canRepayOrder({ status: "Pending Payment", paymentStatus: "pending", paymentMethod: "QRPH" }), true);
  assert.equal(canRepayOrder({ status: "Pending Payment", paymentStatus: "paid", paymentMethod: "QRPH" }), false);
  assert.equal(canRepayOrder({ status: "Order Placed", paymentStatus: "pending", paymentMethod: "QRPH" }), false);
  assert.equal(canRepayOrder({ status: "Pending Payment", paymentStatus: "pending", paymentMethod: "Cash" }), false);
});

test("validateContact requires Philippine mobile format", () => {
  assert.equal(validateContact("09123456789").ok, true);
  assert.equal(validateContact("+639123456789").ok, false);
});

test("validateDeliveryAddress requires province and city selections", () => {
  const result = validateDeliveryAddress({
    fullAddress: "Unit 12, Jazjo Building",
    street: "Road 11",
    barangay: "West Crame",
    provinceCode: "012800000",
    provinceName: "Ilocos Norte",
    cityCode: "012805000",
    cityName: "Laoag City"
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.address, "Unit 12, Jazjo Building, Road 11, Barangay West Crame, Laoag City, Ilocos Norte");
  assert.equal(validateDeliveryAddress({ provinceCode: "012800000", provinceName: "Ilocos Norte" }).ok, false);
});

test("validatePassword requires exactly 8 complex characters", () => {
  assert.equal(validatePassword("Aa12345!").ok, true);
  assert.equal(validatePassword("StrongPass1!").ok, false);
  assert.equal(validatePassword("password123").ok, false);
});

test("formatCountdown formats verification timers", () => {
  assert.equal(formatCountdown(600), "10:00");
  assert.equal(formatCountdown(65), "01:05");
  assert.equal(formatCountdown(0), "00:00");
});
