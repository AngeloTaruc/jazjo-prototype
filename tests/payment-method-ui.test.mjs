import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("frontend/customer/src/App.jsx", "utf8");
const apiSource = fs.readFileSync("frontend/customer/src/lib/api.js", "utf8");
const serverSource = fs.readFileSync("server/index.mjs", "utf8");
const migrationSource = fs.existsSync("sql/2026-06-26_order_fulfillment_type.sql")
  ? fs.readFileSync("sql/2026-06-26_order_fulfillment_type.sql", "utf8")
  : "";

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

test("checkout supports delivery and pickup fulfillment", () => {
  assert.match(source, /FULFILLMENT_OPTIONS/);
  assert.match(source, /name="fulfillmentType"/);
  assert.match(source, /form\.fulfillmentType === "pickup"/);
  assert.match(source, /const deliveryFee = form\.fulfillmentType === "pickup" \? 0 : calculateDeliveryFee/);
  assert.match(source, /Place Pickup Order/);
  assert.match(source, /Pickup orders do not require a delivery address/);
  assert.match(apiSource, /fulfillmentType: order\.fulfillmentType \|\| order\.fulfillment_type \|\| "delivery"/);
  assert.match(serverSource, /fulfillment_type/);
  assert.match(serverSource, /const fulfillmentType = normalizeFulfillmentType/);
  assert.match(migrationSource, /add column if not exists fulfillment_type/);
});

test("cart checkout shows inline related product recommendations", () => {
  const shopPage = source.slice(
    source.indexOf("function ShopPage"),
    source.indexOf("function Dashboard"),
  );
  const cartPage = source.slice(
    source.indexOf("function CartPage"),
    source.indexOf("function OrdersPage"),
  );
  const recommendationCard = source.slice(
    source.indexOf("function RecommendationCard"),
    source.indexOf("function ShopPage"),
  );
  assert.match(source, /<CartPage[\s\S]*onAdd=\{addToCart\}/);
  assert.match(cartPage, /recommendRelatedProducts\(products, recommendationAnchor, \{ limit: 5 \}\)/);
  assert.match(cartPage, /You may also like/);
  assert.match(source, /function RecommendationCard/);
  assert.match(cartPage, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(420px,460px\)\]/);
  assert.doesNotMatch(cartPage, /lg:grid-cols-\[1\.2fr_\.8fr\]/);
  assert.match(cartPage, /grid gap-3 sm:grid-cols-2/);
  assert.doesNotMatch(cartPage, /overflow-x-auto/);
  assert.match(cartPage, /<RecommendationCard key=\{product\.id\} product=\{product\} onAdd=\{onAdd\}/);
  assert.match(recommendationCard, /grid-cols-\[64px_1fr\]/);
  assert.doesNotMatch(recommendationCard, /min-w-\[/);
  assert.doesNotMatch(recommendationCard, /sm:flex/);
  assert.doesNotMatch(shopPage, /You may also like/);
  assert.doesNotMatch(shopPage, /<Modal/);
});
