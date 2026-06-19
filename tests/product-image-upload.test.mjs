import assert from "node:assert/strict";
import test from "node:test";

process.env.VERCEL = "1";

const server = await import("../server/index.mjs");

test("parseProductImagePayload accepts a valid data URL image", () => {
  const tinyPng = "data:image/png;base64,iVBORw0KGgo=";

  const image = server.parseProductImagePayload({
    fileName: "C2 Apple.png",
    dataUrl: tinyPng
  });

  assert.equal(image.contentType, "image/png");
  assert.equal(image.extension, "png");
  assert.equal(image.buffer.length, 8);
  assert.match(image.safeName, /^c2-apple-/);
});

test("parseProductImagePayload rejects non-image uploads", () => {
  assert.throws(
    () => server.parseProductImagePayload({
      fileName: "notes.txt",
      dataUrl: "data:text/plain;base64,SGVsbG8="
    }),
    /Only PNG, JPEG, WebP, and GIF images are allowed/
  );
});

test("parseProductImagePayload rejects oversized images", () => {
  const oversized = Buffer.alloc((5 * 1024 * 1024) + 1).toString("base64");

  assert.throws(
    () => server.parseProductImagePayload({
      fileName: "large.png",
      dataUrl: `data:image/png;base64,${oversized}`
    }),
    /Product image must be 5MB or smaller/
  );
});

test("validateCustomerRegistration requires first and last name", () => {
  assert.throws(
    () => server.validateCustomerRegistration({
      firstName: "Juan",
      lastName: "",
      email: "juan@example.com",
      contact: "09123456789",
      address: "San Juan City",
      password: "StrongPass1!"
    }),
    /First name and last name are required/
  );
});

test("validateCustomerRegistration accepts valid Philippine contact and strong password", () => {
  const result = server.validateCustomerRegistration({
    firstName: "Juan",
    lastName: "Dela Cruz",
    email: "JUAN@example.com",
    contact: "09123456789",
    address: "San Juan City",
    password: "StrongPass1!"
  });

  assert.equal(result.email, "juan@example.com");
  assert.equal(result.fullName, "Juan Dela Cruz");
  assert.equal(result.contact, "09123456789");
});

test("validateCustomerRegistration rejects invalid Philippine contact", () => {
  assert.throws(
    () => server.validateCustomerRegistration({
      firstName: "Juan",
      lastName: "Dela Cruz",
      email: "juan@example.com",
      contact: "+639123456789",
      address: "San Juan City",
      password: "StrongPass1!"
    }),
    /Contact number must use Philippine format/
  );
});

test("validatePasswordComplexity requires mixed character classes", () => {
  assert.throws(
    () => server.validatePasswordComplexity("password123"),
    /Password must include uppercase, lowercase, number, and special character/
  );
});

test("normalizeReturnBaseUrl accepts only http origins", () => {
  assert.equal(server.normalizeReturnBaseUrl("https://jazjo.example.com/customer-app/#/cart"), "https://jazjo.example.com");
  assert.equal(server.normalizeReturnBaseUrl("javascript:alert(1)"), "http://localhost:3000");
});

test("isPaymongoProcessingStatusError detects asynchronous source state", () => {
  assert.equal(server.isPaymongoProcessingStatusError(new Error("Source src_123 has processing status")), true);
  assert.equal(server.isPaymongoProcessingStatusError(new Error("Invalid token")), false);
});

test("parsePaymongoWebhookEvent extracts checkout session payment events", () => {
  const parsed = server.parsePaymongoWebhookEvent({
    data: {
      id: "evt_123",
      attributes: {
        type: "checkout_session.payment.paid",
        data: {
          id: "cs_123",
          attributes: {
            metadata: { order_code: "ORD-20260619-001" },
            payments: [{ id: "pay_123", attributes: { status: "paid" } }]
          }
        }
      }
    }
  });

  assert.equal(parsed.eventId, "evt_123");
  assert.equal(parsed.eventType, "checkout_session.payment.paid");
  assert.equal(parsed.orderCode, "ORD-20260619-001");
  assert.equal(parsed.checkoutSessionId, "cs_123");
  assert.equal(parsed.paymentId, "pay_123");
});

test("parsePaymongoWebhookEvent does not treat payment id as checkout session id", () => {
  const parsed = server.parsePaymongoWebhookEvent({
    data: {
      id: "evt_456",
      attributes: {
        type: "payment.paid",
        data: {
          id: "pay_456",
          attributes: {
            metadata: { order_code: "ORD-20260619-002" },
            status: "paid"
          }
        }
      }
    }
  });

  assert.equal(parsed.eventType, "payment.paid");
  assert.equal(parsed.orderCode, "ORD-20260619-002");
  assert.equal(parsed.checkoutSessionId, null);
  assert.equal(parsed.paymentId, "pay_456");
});
