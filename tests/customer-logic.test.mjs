import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCsvContent,
  buildCheckoutPrefill,
  calculateDeliveryFee,
  canAddCartQuantity,
  canAccessPanelRoute,
  createDemandForecast,
  canRepayOrder,
  formatCountdown,
  isRetryablePaymentReason,
  mergeOrdersByOrderNumber,
  normalizeContactInput,
  normalizeCategory,
  paymentStatusLabel,
  partitionProductsByFavorites,
  getRegistrationFieldState,
  statusLabel,
  toggleFavoriteProduct,
  validateContact,
  validateDeliveryAddress,
  validateGmailAddress,
  validatePassword
} from "../frontend/customer/src/lib/customerLogic.js";
import { normalizeCustomerProfile, normalizeOrder } from "../frontend/customer/src/lib/api.js";

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

test("createDemandForecast ranks products by trend-adjusted demand", () => {
  const products = [
    { name: "C2 Lemon", stockCases: 4 },
    { name: "Water 500ml", stockCases: 20 }
  ];
  const orders = [
    { createdAtRaw: "2026-06-20T08:00:00Z", items: [{ name: "C2 Lemon", qty: 2 }, { name: "Water 500ml", qty: 1 }] },
    { createdAtRaw: "2026-06-21T08:00:00Z", items: [{ name: "C2 Lemon", qty: 4 }] },
    { createdAtRaw: "2026-06-22T08:00:00Z", items: [{ name: "C2 Lemon", qty: 6 }] }
  ];

  const forecast = createDemandForecast(products, orders, { horizonDays: 5 });

  assert.equal(forecast[0].name, "C2 Lemon");
  assert.equal(forecast[0].forecastCases, 30);
  assert.equal(forecast[0].recommendedRestock, 26);
  assert.equal(forecast[0].model, "ARIMA-style trend");
});

test("buildCsvContent escapes report values for Excel-compatible export", () => {
  const csv = buildCsvContent(
    ["Report Type", "Coverage"],
    [{ reportType: "Sales, Report", coverage: "10 orders \"total\"" }],
    { reportType: "Report Type", coverage: "Coverage" }
  );

  assert.equal(csv, "\"Report Type\",\"Coverage\"\r\n\"Sales, Report\",\"10 orders total\"");
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
  assert.equal(validateContact("12345678901").ok, false);
  assert.equal(validateContact("+639123456789").ok, false);
  assert.match(validateContact("1").message, /must start with 09/);
  assert.match(validateContact("0").message, /exactly 11 digits/);
  assert.match(validateContact("08").message, /must start with 09/);
  assert.match(validateContact("0912345678").message, /exactly 11 digits/);
  assert.match(validateContact("091234567890").message, /exactly 11 digits/);
  assert.match(validateContact("09123abc789").message, /Only numeric/);
  assert.match(validateContact("08123456789").message, /must start with 09/);
});

test("normalizeContactInput keeps only the first 11 digits", () => {
  assert.equal(normalizeContactInput("098723432432432"), "09872343243");
  assert.equal(normalizeContactInput("09abc872-343 24"), "0987234324");
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

test("validatePassword only requires a non-empty password", () => {
  assert.equal(validatePassword("").ok, false);
  assert.match(validatePassword("").message, /required/i);
  assert.equal(validatePassword("a").ok, false);
  assert.match(validatePassword("short").message, /at least 8/i);
  assert.equal(validatePassword("password123").ok, true);
});

test("validateGmailAddress reports format errors before Gmail domain errors", () => {
  assert.match(validateGmailAddress("juan").message, /Invalid email format/);
  assert.match(validateGmailAddress("juan@").message, /Invalid email format/);
  assert.match(validateGmailAddress("juan@example.com").message, /gmail\.com/);
  assert.equal(validateGmailAddress("JUAN@gmail.com").value, "juan@gmail.com");
});

test("getRegistrationFieldState blocks registration fields sequentially", () => {
  const empty = getRegistrationFieldState({});
  assert.deepEqual(
    Object.fromEntries(Object.entries(empty.enabled).filter((entry) => entry[1])),
    { firstName: true }
  );
  assert.equal(empty.canSendVerificationCode, false);
  assert.equal(empty.canRegister, false);

  const readyForEmailCheck = getRegistrationFieldState({
    firstName: "Ana",
    lastName: "Santos",
    email: "ana@gmail.com",
    contact: "09123456789",
    password: "password123",
    confirmPassword: "password123",
    address: {
      fullAddress: "Unit 1",
      street: "Road 1",
      barangay: "Central",
      provinceCode: "130000000",
      provinceName: "Metro Manila",
      cityCode: "137401000",
      cityName: "City of Manila"
    }
  }, { emailExists: true, emailChecked: true });
  assert.equal(readyForEmailCheck.enabled.contact, false);
  assert.equal(readyForEmailCheck.errors.email, "Email is already registered.");
  assert.equal(readyForEmailCheck.canSendVerificationCode, false);

  const verified = getRegistrationFieldState(readyForEmailCheck.values, {
    emailExists: false,
    emailChecked: true,
    emailVerified: true,
    verificationExpiresIn: 300
  });
  assert.equal(verified.enabled.city, true);
  assert.equal(verified.canSendVerificationCode, true);
  assert.equal(verified.canRegister, true);
});

test("buildCheckoutPrefill maps logged-in profile fields to checkout fields", () => {
  const result = buildCheckoutPrefill({
    profile: {
      full_name: "Juan Dela Cruz",
      email: "juan@gmail.com",
      contact: "09123456789",
      address: "12 U, Road 11"
    }
  });

  assert.deepEqual(result, {
    customerName: "Juan Dela Cruz",
    email: "juan@gmail.com",
    contact: "09123456789",
    addressText: "12 U, Road 11"
  });
});

test("buildCheckoutPrefill accepts normalized profile fields", () => {
  const result = buildCheckoutPrefill({
    fullName: "Angelo Taruc",
    email: "angelo@gmail.com",
    contact: "09123456789",
    address: { fullAddress: "12 U, Road 11" }
  });

  assert.deepEqual(result, {
    customerName: "Angelo Taruc",
    email: "angelo@gmail.com",
    contact: "09123456789",
    addressText: "12 U, Road 11"
  });
});

test("normalizeCustomerProfile maps API profile wrapper to profile form fields", () => {
  const result = normalizeCustomerProfile({
    profile: {
      full_name: "Angelo Taruc",
      email: "angelo@gmail.com",
      contact: "09123456789",
      address: "12 U, Road 11"
    }
  });

  assert.deepEqual(result, {
    firstName: "Angelo",
    lastName: "Taruc",
    fullName: "Angelo Taruc",
    email: "angelo@gmail.com",
    contact: "09123456789",
    address: { fullAddress: "12 U, Road 11" }
  });
});

test("normalizeOrder carries fulfillment type and pickup delivery fee", () => {
  const order = normalizeOrder({
    id: "ORD-PICKUP",
    fulfillment_type: "pickup",
    delivery_fee: 0,
    total: 200,
    order_items: []
  });
  assert.equal(order.fulfillmentType, "pickup");
  assert.equal(order.deliveryFee, 0);
});

test("mergeOrdersByOrderNumber groups duplicate order rows under one order", () => {
  const result = mergeOrdersByOrderNumber([
    {
      id: "ORD-1",
      customerName: "Ana",
      createdAt: "2026-06-25",
      total: 50,
      status: "Order Placed",
      items: [{ name: "C2", qty: 1 }]
    },
    {
      id: "ORD-1",
      customerName: "Ana",
      createdAt: "2026-06-25",
      total: 75,
      status: "Preparing",
      items: [{ name: "Water", qty: 2 }]
    },
    {
      id: "ORD-2",
      customerName: "Ben",
      createdAt: "2026-06-25",
      total: 10,
      status: "Pending Payment",
      items: [{ name: "Soda", qty: 1 }]
    }
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].id, "ORD-1");
  assert.equal(result[0].total, 125);
  assert.equal(result[0].status, "Preparing");
  assert.deepEqual(result[0].items.map((item) => item.name), ["C2", "Water"]);
});

test("formatCountdown formats verification timers", () => {
  assert.equal(formatCountdown(600), "10:00");
  assert.equal(formatCountdown(65), "01:05");
  assert.equal(formatCountdown(0), "00:00");
});
