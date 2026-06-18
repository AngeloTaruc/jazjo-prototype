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
