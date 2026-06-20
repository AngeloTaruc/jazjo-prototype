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
      email: "juan@gmail.com",
      contact: "09123456789",
      address: "San Juan City",
      password: "Aa12345!"
    }),
    /First name and last name are required/
  );
});

test("validateCustomerRegistration accepts valid Philippine contact and strong password", () => {
  const result = server.validateCustomerRegistration({
    firstName: "Juan",
    lastName: "Dela Cruz",
    email: "JUAN@gmail.com",
    contact: "09123456789",
    address: "San Juan City",
    password: "Aa12345!"
  });

  assert.equal(result.email, "juan@gmail.com");
  assert.equal(result.fullName, "Juan Dela Cruz");
  assert.equal(result.contact, "09123456789");
});

test("validateCustomerRegistration requires Gmail addresses", () => {
  assert.throws(
    () => server.validateCustomerRegistration({
      firstName: "Juan",
      lastName: "Dela Cruz",
      email: "juan@example.com",
      contact: "09123456789",
      address: "San Juan City",
      password: "Aa12345!"
    }),
    /Email must end with @gmail.com/
  );
});

test("validateCustomerRegistration rejects invalid Philippine contact", () => {
  assert.throws(
    () => server.validateCustomerRegistration({
      firstName: "Juan",
      lastName: "Dela Cruz",
      email: "juan@gmail.com",
      contact: "+639123456789",
      address: "San Juan City",
      password: "Aa12345!"
    }),
    /Contact number must use Philippine format/
  );
});

test("validatePasswordComplexity requires mixed character classes", () => {
  assert.equal(server.validatePasswordComplexity("Aa12345!"), "Aa12345!");
  assert.throws(
    () => server.validatePasswordComplexity("StrongPass1!"),
    /Password must be exactly 8 characters/
  );
  assert.throws(
    () => server.validatePasswordComplexity("password123"),
    /Password must be exactly 8 characters/
  );
});

test("buildEmailJsVerificationPayload matches the verification template variables", () => {
  const payload = server.buildEmailJsVerificationPayload({
    email: "juan@gmail.com",
    code: "123456",
    serviceId: "service_test",
    templateId: "template_test",
    publicKey: "public_test",
    privateKey: "private_test"
  });

  assert.deepEqual(payload, {
    service_id: "service_test",
    template_id: "template_test",
    user_id: "public_test",
    accessToken: "private_test",
    template_params: {
      to_email: "juan@gmail.com",
      verification_code: "123456"
    }
  });
});

test("getPsgcCitiesPath uses the NCR region endpoint for Metro Manila", () => {
  assert.equal(
    server.getPsgcCitiesPath("130000000"),
    "/regions/130000000/cities-municipalities/"
  );
  assert.equal(
    server.getPsgcCitiesPath("030800000"),
    "/provinces/030800000/cities-municipalities/"
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
