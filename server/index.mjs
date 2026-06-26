import http from "node:http";
import fs from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const cwd = process.cwd();
const PUBLIC_DIR = path.join(cwd, "public");
const ENV = loadEnv(path.join(cwd, ".env"));
const PORT = Number(process.env.PORT || 3000);

function loadEnv(filePath){
  try{
    const raw = fs.readFileSync(filePath, "utf8");
    const out = {};
    for(const line of raw.split(/\r?\n/)){
      const trimmed = line.trim();
      if(!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if(idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))){
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  }catch{
    return {};
  }
}

function env(name){
  return process.env[name] || ENV[name] || "";
}

const SUPABASE_URL = env("SUPABASE_URL").replace(/\/$/, "");
const SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const PAYMONGO_SECRET_KEY = env("PAYMONGO_SECRET_KEY");
const PAYMONGO_WEBHOOK_SECRET = env("PAYMONGO_WEBHOOK_SECRET");
const EMAILJS_SERVICE_ID = env("EMAILJS_SERVICE_ID");
const EMAILJS_TEMPLATE_ID = env("EMAILJS_TEMPLATE_ID");
const EMAILJS_PUBLIC_KEY = env("EMAILJS_PUBLIC_KEY");
const EMAILJS_PRIVATE_KEY = env("EMAILJS_PRIVATE_KEY");
const APP_BASE_URL = (env("APP_BASE_URL") || `http://localhost:${PORT}`).replace(/\/$/, "");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};
const REWARD_CATALOG = {
  free_delivery: {
    type: "free_delivery",
    label: "Free Delivery",
    cost: 500
  },
  discount_10: {
    type: "discount_10",
    label: "10% Discount",
    cost: 1000
  }
};
const PRODUCT_IMAGE_BUCKET = "product-images";
const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_DELIVERY_SETTINGS = {
  deliveryFee: 60,
  freeDeliveryMinimum: 800
};
const PRODUCT_IMAGE_ALLOWED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);
const PSGC_API_BASE = "https://psgc.gitlab.io/api";
const METRO_MANILA_CODE = "130000000";
const METRO_MANILA_LOCATION = { code: METRO_MANILA_CODE, name: "Metro Manila", regionCode: METRO_MANILA_CODE };
const CUSTOMER_PENDING_ORDER_TTL_MS = 24 * 60 * 60 * 1000;
const LOW_STOCK_THRESHOLD = 10;
const locationCache = new Map();
const registrationVerificationCodes = new Map();

function sendJson(res, status, body){
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0"
  });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body, type="text/plain; charset=utf-8"){
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function readBody(req, { limit = 1_000_000 } = {}){
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if(body.length > limit){
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJson(req, options = {}){
  const body = await readBody(req, options);
  return body ? JSON.parse(body) : {};
}

function supabaseHeaders(serviceRole = false, extra = {}){
  const key = serviceRole ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra
  };
}

async function supabaseRequest(pathname, { method="GET", body, serviceRole=false, headers={} } = {}){
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY){
    throw new Error("Missing Supabase env vars. Check .env (SUPABASE_URL / ANON / SERVICE_ROLE).");
  }

  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    method,
    headers: {
      ...supabaseHeaders(serviceRole, headers),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if(!res.ok){
    const msg = data?.message || data?.error || text || `Supabase error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function makeSafeFileBase(fileName){
  const withoutExt = String(fileName || "product-image")
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return withoutExt || "product-image";
}

function parseProductImagePayload(payload){
  const dataUrl = String(payload?.dataUrl || payload?.data_url || "").trim();
  const match = dataUrl.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if(!match){
    throw new Error("Upload a valid base64 image data URL.");
  }

  const contentType = match[1].toLowerCase();
  const extension = PRODUCT_IMAGE_ALLOWED_TYPES.get(contentType);
  if(!extension){
    throw new Error("Only PNG, JPEG, WebP, and GIF images are allowed.");
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if(!buffer.length){
    throw new Error("Product image cannot be empty.");
  }
  if(buffer.length > PRODUCT_IMAGE_MAX_BYTES){
    throw new Error("Product image must be 5MB or smaller.");
  }

  const safeName = `${makeSafeFileBase(payload?.fileName || payload?.file_name)}-${Date.now()}`;
  return { buffer, contentType, extension, safeName };
}

async function ensureProductImageBucket(){
  try{
    await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(true, { "Content-Type": "application/json" })
      },
      body: JSON.stringify({
        id: PRODUCT_IMAGE_BUCKET,
        name: PRODUCT_IMAGE_BUCKET,
        public: true
      })
    });
  }catch(_err){}
}

async function uploadProductImage(payload){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY){
    throw new Error("Missing Supabase storage env vars.");
  }
  const image = parseProductImagePayload(payload);
  await ensureProductImageBucket();

  const objectPath = `products/${image.safeName}.${image.extension}`;
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${PRODUCT_IMAGE_BUCKET}/${objectPath}`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(true, {
        "Content-Type": image.contentType,
        "x-upsert": "true"
      })
    },
    body: image.buffer
  });

  if(!uploadRes.ok){
    const text = await uploadRes.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    const msg = data?.message || data?.error || text || `Supabase storage error ${uploadRes.status}`;
    throw new Error(msg);
  }

  return {
    imageUrl: `${SUPABASE_URL}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${objectPath}`,
    path: objectPath
  };
}

function escapeCsvValues(values){
  return values.map(v => `"${String(v).replace(/"/g, "")}"`).join(",");
}

function toUiStatus(dbStatus){
  const map = {
    pending_payment: "Pending Payment",
    order_placed: "Order Placed",
    preparing: "Preparing",
    in_transit: "In Transit",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled"
  };
  return map[dbStatus] || dbStatus || "Order Placed";
}

function statusLabel(status){
  return toUiStatus(status);
}

function httpError(message, status = 400){
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeReturnBaseUrl(value){
  const fallback = APP_BASE_URL;
  try{
    const parsed = new URL(String(value || fallback));
    if(parsed.protocol !== "http:" && parsed.protocol !== "https:") return fallback;
    return parsed.origin.replace(/\/$/, "");
  }catch{
    return fallback;
  }
}

function normalizeDeliverySettings(settings = {}){
  const deliveryFee = Number(settings.deliveryFee ?? settings.delivery_fee);
  const freeDeliveryMinimum = Number(settings.freeDeliveryMinimum ?? settings.free_delivery_minimum);
  return {
    deliveryFee: Number.isFinite(deliveryFee) && deliveryFee >= 0
      ? deliveryFee
      : DEFAULT_DELIVERY_SETTINGS.deliveryFee,
    freeDeliveryMinimum: Number.isFinite(freeDeliveryMinimum) && freeDeliveryMinimum >= 0
      ? freeDeliveryMinimum
      : DEFAULT_DELIVERY_SETTINGS.freeDeliveryMinimum
  };
}

function calculateDeliveryFee(subtotal, settings = DEFAULT_DELIVERY_SETTINGS){
  const safeSubtotal = Math.max(0, Number(subtotal || 0));
  if(safeSubtotal === 0) return 0;
  const normalized = normalizeDeliverySettings(settings);
  return safeSubtotal >= normalized.freeDeliveryMinimum ? 0 : normalized.deliveryFee;
}

function normalizeFulfillmentType(value){
  return String(value || "delivery").trim().toLowerCase() === "pickup" ? "pickup" : "delivery";
}

function normalizePaymentMethod(value){
  const normalized = String(value || "bank_qr_ph").trim().toLowerCase();
  if(
    normalized === "cod"
    || normalized === "cash_on_delivery"
    || normalized.includes("cash on delivery")
  ) return "cod";
  if(normalized === "gcash" || normalized.includes("gcash")) return "gcash";
  if(normalized === "maya" || normalized === "paymaya" || normalized.includes("maya")) return "maya";
  if(
    normalized === "bank qr"
    || normalized === "bank_qr"
    || normalized === "bank_qr_ph"
    || normalized === "qrph"
    || normalized.includes("bank qr")
    || normalized.includes("qrph")
  ) return "bank_qr_ph";
  return normalized || "bank_qr_ph";
}

function paymentMethodLabel(value){
  const normalized = normalizePaymentMethod(value);
  if(normalized === "cod") return "COD";
  if(normalized === "gcash") return "GCash";
  if(normalized === "maya") return "Maya";
  return "Bank QR PH";
}

function isOnlinePaymentMethod(value){
  return normalizePaymentMethod(value) !== "cod";
}

function startOfDay(date){
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date){
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getRangeBounds(range, from, to, now = new Date()){
  const current = new Date(now);
  const normalized = String(range || "all").trim().toLowerCase();
  if(normalized === "all" || normalized === "all_time" || normalized === ""){
    return { start: null, end: null, key: "all" };
  }
  if(normalized === "custom"){
    const start = from ? startOfDay(from) : null;
    const end = to ? endOfDay(to) : null;
    return { start, end, key: "custom" };
  }
  if(normalized === "today"){
    return { start: startOfDay(current), end: endOfDay(current), key: "today" };
  }
  if(normalized === "week"){
    const start = startOfDay(current);
    const weekday = start.getDay();
    start.setDate(start.getDate() - weekday);
    return { start, end: endOfDay(current), key: "week" };
  }
  if(normalized === "month"){
    const start = startOfDay(new Date(current.getFullYear(), current.getMonth(), 1));
    return { start, end: endOfDay(current), key: "month" };
  }
  if(normalized === "year"){
    const start = startOfDay(new Date(current.getFullYear(), 0, 1));
    return { start, end: endOfDay(current), key: "year" };
  }
  return { start: null, end: null, key: normalized || "all" };
}

function isWithinRange(value, bounds){
  if(!bounds?.start && !bounds?.end) return true;
  const time = Date.parse(value || "");
  if(!Number.isFinite(time)) return false;
  if(bounds.start && time < bounds.start.getTime()) return false;
  if(bounds.end && time > bounds.end.getTime()) return false;
  return true;
}

function filterOrdersByRange(orders, range, from, to){
  const bounds = getRangeBounds(range, from, to);
  return (orders || []).filter((order) => isWithinRange(order.createdAtRaw || order.createdAt, bounds));
}

function sumOrderItemQty(order){
  return (order?.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function formatDurationHours(hours){
  const safe = Number(hours || 0);
  if(!Number.isFinite(safe) || safe <= 0) return "-";
  if(safe < 1) return `${Math.round(safe * 60)} min`;
  return `${safe.toFixed(safe >= 10 ? 0 : 1)} hr`;
}

async function getStoreSettings(){
  try{
    const rows = await supabaseRequest(
      "/rest/v1/app_settings?select=key,value&key=in.(delivery_fee,free_delivery_minimum)",
      { serviceRole: true }
    );
    const raw = {};
    for(const row of rows || []){
      if(row?.key === "delivery_fee") raw.deliveryFee = row.value;
      if(row?.key === "free_delivery_minimum") raw.freeDeliveryMinimum = row.value;
    }
    return normalizeDeliverySettings(raw);
  }catch(err){
    console.warn("[store settings] using defaults:", err.message);
    return normalizeDeliverySettings();
  }
}

function validatePhilippineContact(contact){
  const normalized = String(contact || "").trim();
  if(!/^09\d{9}$/.test(normalized)){
    throw httpError("Contact number must use Philippine mobile format: 09xxxxxxxxx.");
  }
  return normalized;
}

function validateGmailEmail(email){
  const normalized = String(email || "").trim().toLowerCase();
  if(!normalized){
    throw httpError("email is required.");
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)){
    throw httpError("Invalid email format.");
  }
  if(!normalized.endsWith("@gmail.com")){
    throw httpError("Email must end with @gmail.com.");
  }
  return normalized;
}

function buildEmailJsVerificationPayload({ email, code, serviceId, templateId, publicKey, privateKey }){
  return {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    ...(privateKey ? { accessToken: privateKey } : {}),
    template_params: {
      to_email: email,
      verification_code: code
    }
  };
}

async function sendRegistrationVerificationEmail(email, code){
  const configured = EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY;
  if(!configured) return false;

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildEmailJsVerificationPayload({
      email,
      code,
      serviceId: EMAILJS_SERVICE_ID,
      templateId: EMAILJS_TEMPLATE_ID,
      publicKey: EMAILJS_PUBLIC_KEY,
      privateKey: EMAILJS_PRIVATE_KEY
    }))
  });
  if(!response.ok){
    const message = (await response.text()).trim();
    throw httpError(message || "Unable to send the verification email.", 502);
  }
  return true;
}

async function createRegistrationVerificationCode(payload){
  const email = validateGmailEmail(payload?.email);
  const existing = await getProfileByEmail(email);
  if(existing){
    throw httpError("An account with this email already exists.", 409);
  }
  const code = String(crypto.randomInt(100000, 1000000));
  const emailSent = await sendRegistrationVerificationEmail(email, code);
  registrationVerificationCodes.set(email, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000
  });
  if(!emailSent){
    console.log(`[auth] Verification code for ${email}: ${code}`);
  }
  return {
    ok: true,
    message: emailSent ? "Verification code sent to your email." : "Verification code generated for local development.",
    ...(!emailSent ? { devCode: code } : {})
  };
}

function verifyRegistrationCode(email, code, { consume = true } = {}){
  const normalizedEmail = validateGmailEmail(email);
  const normalizedCode = String(code || "").trim();
  const saved = registrationVerificationCodes.get(normalizedEmail);
  if(!saved || saved.expiresAt <= Date.now()){
    registrationVerificationCodes.delete(normalizedEmail);
    throw httpError("Verification code is missing or expired.");
  }
  if(saved.code !== normalizedCode){
    throw httpError("Verification code is incorrect.");
  }
  if(consume) registrationVerificationCodes.delete(normalizedEmail);
  return true;
}

function normalizePsgcLocation(entry){
  return {
    code: String(entry?.code || "").trim(),
    name: String(entry?.name || "").trim(),
    provinceCode: String(entry?.provinceCode || entry?.province_code || "").trim(),
    regionCode: String(entry?.regionCode || entry?.region_code || "").trim()
  };
}

function getPsgcCitiesPath(locationCode){
  const code = String(locationCode || "").trim();
  const scope = code === METRO_MANILA_CODE ? "regions" : "provinces";
  return `/${scope}/${encodeURIComponent(code)}/cities-municipalities/`;
}

async function fetchPsgc(pathname){
  const key = pathname;
  const cached = locationCache.get(key);
  if(cached && cached.expiresAt > Date.now()) return cached.data;

  const res = await fetch(`${PSGC_API_BASE}${pathname}`);
  const text = await res.text();
  let data = null;
  try{
    data = text ? JSON.parse(text) : null;
  }catch{
    data = null;
  }
  if(!res.ok){
    throw httpError(data?.error || data?.message || `Failed to fetch PSGC data (${res.status}).`, 502);
  }
  locationCache.set(key, { data, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return data;
}

async function listPsgcProvinces(){
  const data = await fetchPsgc("/provinces/");
  const provinces = (Array.isArray(data) ? data : data?.data || [])
    .map(normalizePsgcLocation)
    .filter((entry) => entry.code && entry.name);
  if(!provinces.some((entry) => entry.code === METRO_MANILA_CODE)){
    provinces.push(METRO_MANILA_LOCATION);
  }
  return provinces.sort((a, b) => a.name.localeCompare(b.name));
}

async function getPsgcProvince(provinceCode){
  const code = String(provinceCode || "").trim();
  if(!code) throw httpError("Please choose a province.");
  const provinces = await listPsgcProvinces();
  const province = provinces.find((entry) => entry.code === code);
  if(!province){
    throw httpError("Please choose a valid province.");
  }
  return province;
}

async function listPsgcProvinceCities(provinceCode){
  const code = String(provinceCode || "").trim();
  if(!code) throw httpError("Please choose a province.");
  let rows = [];
  try{
    const data = await fetchPsgc(getPsgcCitiesPath(code));
    rows = Array.isArray(data) ? data : data?.data || [];
  }catch(err){
    if(Number(err?.status || 0) !== 502 && Number(err?.status || 0) !== 404) throw err;
    try{
      const data = await fetchPsgc("/cities-municipalities/");
      rows = Array.isArray(data) ? data : data?.data || [];
    }catch(_fallbackErr){
      const [cities, municipalities] = await Promise.all([
        fetchPsgc("/cities/").catch(() => []),
        fetchPsgc("/municipalities/").catch(() => [])
      ]);
      rows = [
        ...(Array.isArray(cities) ? cities : cities?.data || []),
        ...(Array.isArray(municipalities) ? municipalities : municipalities?.data || [])
      ];
    }
  }
  return rows
    .map(normalizePsgcLocation)
    .filter((entry) => entry.code && entry.name && (!entry.provinceCode || entry.provinceCode === code))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function validateDeliveryAddress(payload){
  const fullAddress = String(payload?.fullAddress || payload?.full_address || "").trim().replace(/\s+/g, " ");
  const street = String(payload?.street || "").trim().replace(/\s+/g, " ");
  const barangay = String(payload?.barangay || payload?.baranggay || "").trim().replace(/^barangay\s+/i, "").replace(/\s+/g, " ");
  const provinceCode = String(payload?.provinceCode || payload?.province_code || "").trim();
  const provinceName = String(payload?.provinceName || payload?.province_name || "").trim();
  const cityCode = String(payload?.cityCode || payload?.city_code || "").trim();
  const cityName = String(payload?.cityName || payload?.city_name || "").trim();
  if(!fullAddress) throw httpError("Please enter the full delivery address.");
  if(!street && !barangay && !provinceCode && !cityCode){
    return {
      fullAddress,
      street: "",
      barangay: "",
      provinceCode: "",
      provinceName: "",
      cityCode: "",
      cityName: "",
      address: fullAddress
    };
  }
  if(!street) throw httpError("Please enter the street.");
  if(!barangay) throw httpError("Please enter the barangay.");
  if(!provinceCode) throw httpError("Please choose a province.");
  if(!cityCode) throw httpError("Please choose a city or municipality.");

  let province = { code: provinceCode, name: provinceName };
  let city = { code: cityCode, name: cityName };
  try{
    const [verifiedProvince, cities] = await Promise.all([
      getPsgcProvince(provinceCode),
      listPsgcProvinceCities(provinceCode)
    ]);
    const verifiedCity = cities.find((entry) => entry.code === cityCode);
    if(verifiedProvince) province = verifiedProvince;
    if(verifiedCity) city = verifiedCity;
  }catch(err){
    console.warn(`[locations] PSGC validation fallback: ${err.message}`);
  }
  if(!province.name){
    throw httpError("Please choose a valid province.");
  }
  if(!city.name){
    throw httpError("Please choose a valid city or municipality for the selected province.");
  }
  return {
    fullAddress,
    street,
    barangay,
    provinceCode: province.code,
    provinceName: province.name,
    cityCode: city.code,
    cityName: city.name,
    address: [fullAddress, street, `Barangay ${barangay}`, city.name, province.name].join(", ")
  };
}

function validatePasswordComplexity(password){
  const value = String(password || "");
  if(!value.trim()){
    throw httpError("Password is required.");
  }
  if(value.length < 8){
    throw httpError("Password must be at least 8 characters.");
  }
  return value;
}

function validateQuantityPerCase(value){
  const quantity = Number(value ?? 1);
  if(!Number.isInteger(quantity) || quantity <= 0){
    throw httpError("Quantity per case must be a positive integer.");
  }
  return quantity;
}

function validateCustomerRegistration(payload){
  const firstName = String(payload.firstName || payload.first_name || "").trim().replace(/\s+/g, " ");
  const lastName = String(payload.lastName || payload.last_name || "").trim().replace(/\s+/g, " ");
  const fallbackFullName = String(payload.fullName || payload.full_name || "").trim().replace(/\s+/g, " ");
  const email = validateGmailEmail(payload.email);
  const password = validatePasswordComplexity(payload.password);
  const contact = validatePhilippineContact(payload.contact);

  if(!firstName || !lastName){
    if(!fallbackFullName || fallbackFullName.split(/\s+/).length < 2){
      throw httpError("First name and last name are required.");
    }
  }
  const fullName = firstName && lastName ? `${firstName} ${lastName}` : fallbackFullName;
  return { firstName, lastName, fullName, email, contact, password };
}

function validateStaffAccountPayload(payload, { requirePassword = true } = {}){
  const fullName = String(payload.fullName || payload.full_name || payload.name || "").trim().replace(/\s+/g, " ");
  const email = validateGmailEmail(payload.email);
  const contact = validatePhilippineContact(payload.contact);
  const password = String(payload.password || "");
  const confirmPassword = String(payload.confirmPassword || payload.confirm_password || "");

  if(!fullName){
    throw httpError("Staff name is required.");
  }
  if(requirePassword){
    validatePasswordComplexity(password);
    if(password !== confirmPassword){
      throw httpError("Passwords do not match.");
    }
    return { fullName, email, contact, password };
  }
  return { fullName, email, contact };
}

function assertProfileIsActive(profile){
  if(profile && profile.is_active === false){
    throw httpError("This account has been disabled.", 403);
  }
  return true;
}

function toUiOrder(order, items = [], events = []){
  return {
    dbId: order.id,
    id: order.order_code,
    createdAt: order.created_at,
    customerName: order.customer_name,
    contact: order.contact,
    address: order.address,
    fulfillmentType: order.fulfillment_type || "delivery",
    paymentMethod: paymentMethodLabel(order.payment_method),
    paymentMethodKey: normalizePaymentMethod(order.payment_method),
    paymentStatus: order.payment_status || "",
    subtotal: Number(order.subtotal || 0),
    deliveryFee: Number(order.delivery_fee || 0),
    discountAmount: Number(order.discount_amount || 0),
    total: Number(order.total || 0),
    status: toUiStatus(order.status),
    items: items.map(it => ({
      productId: it.sku,
      dbProductId: it.product_id,
      name: it.name,
      price: Number(it.unit_price || 0),
      qty: Number(it.qty || 0),
      img: it.image_url || ""
    })),
    status_events: events,
    preparedAt: order.prepared_at || "",
    preparedBy: order.prepared_by || "",
    preparationCompleted: order.preparation_completed === true
  };
}

function isStaleCustomerPendingOrder(order, now = Date.now()){
  const status = String(order?.status || "").toLowerCase();
  const paymentStatus = String(order?.payment_status || "").toLowerCase();
  if(status !== "pending_payment" || paymentStatus === "paid") return false;

  const createdAt = Date.parse(order?.created_at || "");
  if(!Number.isFinite(createdAt)) return false;
  return now - createdAt > CUSTOMER_PENDING_ORDER_TTL_MS;
}

function makeOrderCode(date = new Date(), sequence = 1){
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  const safeSequence = Math.max(1, Number(sequence || 1));
  return `ORD-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${String(safeSequence).padStart(4, "0")}`;
}

function getNextOrderSequenceFromRows(rows = [], prefix = ""){
  let maxSequence = 0;
  for(const row of rows || []){
    const code = String(row?.order_code || "");
    if(!code.startsWith(prefix)) continue;
    const suffix = code.slice(prefix.length);
    if(!/^\d+$/.test(suffix)) continue;
    maxSequence = Math.max(maxSequence, Number(suffix));
  }
  return maxSequence + 1;
}

function isOrderCodeUniqueViolation(error){
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("duplicate key")
    && (message.includes("orders_order_code") || message.includes("order_code"));
}

async function makeNextOrderCode(date = new Date()){
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  const prefix = `ORD-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-`;
  const rows = await supabaseRequest(
    `/rest/v1/orders?select=order_code&order_code=like.${encodeURIComponent(`${prefix}%`)}&order=order_code.desc&limit=1000`,
    { serviceRole: true }
  ).catch(() => []);
  return makeOrderCode(d, getNextOrderSequenceFromRows(rows, prefix));
}

function formatDate(value){
  if(!value) return "";
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildInvoiceNumber(orderCode){
  const normalized = String(orderCode || "").trim().replace(/[^A-Z0-9-]+/gi, "").toUpperCase();
  return normalized ? `INV-${normalized}` : "INV-DRAFT";
}

async function listInventoryHistory({ from = "", to = "" } = {}){
  try{
    const params = ["select=id,product_id,product_name,product_sku,order_id,before_stock,after_stock,stock_added,stock_deducted,action,remarks,updated_by,updated_by_name,created_at"];
    if(from) params.push(`created_at=gte.${encodeURIComponent(startOfDay(from).toISOString())}`);
    if(to) params.push(`created_at=lte.${encodeURIComponent(endOfDay(to).toISOString())}`);
    params.push("order=created_at.desc");
    return await supabaseRequest(`/rest/v1/inventory_history?${params.join("&")}`, { serviceRole: true });
  }catch(err){
    if(isMissingRelationError(err, "inventory_history")) return [];
    throw err;
  }
}

async function createInventoryHistoryEntry(entry){
  try{
    await supabaseRequest("/rest/v1/inventory_history", {
      method: "POST",
      serviceRole: true,
      headers: { Prefer: "return=minimal" },
      body: [{
        product_id: entry.productId || null,
        product_name: entry.productName || "",
        product_sku: entry.productSku || "",
        order_id: entry.orderId || null,
        before_stock: Number(entry.beforeStock || 0),
        after_stock: Number(entry.afterStock || 0),
        stock_added: Number(entry.stockAdded || 0),
        stock_deducted: Number(entry.stockDeducted || 0),
        action: String(entry.action || "update"),
        remarks: String(entry.remarks || "").trim() || null,
        updated_by: entry.updatedBy || null,
        updated_by_name: entry.updatedByName || null
      }]
    });
  }catch(err){
    if(isMissingRelationError(err, "inventory_history")) return;
    throw err;
  }
}

async function listPreparationRows(orderIds){
  if(!orderIds.length) return [];
  try{
    const inFilter = encodeURIComponent(`(${escapeCsvValues(orderIds)})`);
    return await supabaseRequest(`/rest/v1/order_preparation_items?select=order_id,product_sku,product_name,required_qty,is_prepared,prepared_by,prepared_at,validation_message&order_id=in.${inFilter}&order=created_at.asc`, {
      serviceRole: true
    });
  }catch(err){
    if(isMissingRelationError(err, "order_preparation_items")) return [];
    throw err;
  }
}

function buildPreparationItems(order, rows = []){
  const rowBySku = new Map((rows || []).map((row) => [String(row.product_sku || ""), row]));
  return (order?.items || []).map((item) => {
    const saved = rowBySku.get(String(item.productId || "")) || rowBySku.get(String(item.sku || "")) || null;
    return {
      productId: item.productId || item.sku || "",
      name: item.name,
      qty: Number(item.qty || 0),
      prepared: saved?.is_prepared === true,
      preparedAt: saved?.prepared_at || "",
      preparedBy: saved?.prepared_by || "",
      validationMessage: saved?.validation_message || ""
    };
  });
}

function buildPreparationSummary(order, rows = []){
  const items = buildPreparationItems(order, rows);
  const total = items.length;
  const prepared = items.filter((item) => item.prepared).length;
  const percent = total > 0 ? Math.round((prepared / total) * 100) : 0;
  return {
    items,
    preparedItems: prepared,
    totalItems: total,
    percent,
    completed: total > 0 && prepared === total
  };
}

async function getProfileByEmail(email){
  const q = `/rest/v1/profiles?select=user_id,email,role,is_active&email=eq.${encodeURIComponent(email)}&limit=1`;
  const rows = await supabaseRequest(q, { serviceRole: true });
  return rows?.[0] || null;
}

async function getProfileFullByEmail(email){
  const q = `/rest/v1/profiles?select=user_id,email,role,full_name,contact,address,is_active,created_at,updated_at&email=eq.${encodeURIComponent(email)}&limit=1`;
  const rows = await supabaseRequest(q, { serviceRole: true });
  return rows?.[0] || null;
}

async function updateProfileByEmail(email, payload){
  const profile = await getProfileByEmail(email);
  if(!profile) throw new Error("Profile not found.");
  const patch = {};
  if("full_name" in payload) patch.full_name = payload.full_name;
  if("contact" in payload) patch.contact = validatePhilippineContact(payload.contact);
  if("address" in payload) patch.address = payload.address;
  if("email" in payload) patch.email = payload.email;
  const rows = await supabaseRequest(`/rest/v1/profiles?user_id=eq.${profile.user_id}`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=representation" },
    body: patch
  });
  return rows?.[0] || null;
}

async function getProductsBySkus(skus){
  if(!skus.length) return [];
  const inFilter = encodeURIComponent(`(${escapeCsvValues(skus)})`);
  const baseSelect = "id,sku,name,category_id,unit,price,stock_cases,quantity_per_case,image_url,is_active";
  const embedQuery = `/rest/v1/products?select=${baseSelect},categories(name)&sku=in.${inFilter}`;
  try{
    const rows = await supabaseRequest(embedQuery, { serviceRole: true });
    return rows.map((r) => ({ ...r, category: getProductCategoryName(r) }));
  }catch{
    const rows = await supabaseRequest(`/rest/v1/products?select=${baseSelect}&sku=in.${inFilter}`, { serviceRole: true });
    const categories = await supabaseRequest("/rest/v1/categories?select=id,name", { serviceRole: true }).catch(() => []);
    const categoryById = new Map((categories || []).map((c) => [c.id, c.name]));
    return rows.map((r) => ({ ...r, category: categoryById.get(r.category_id) || "" }));
  }
}

function getProductCategoryName(row){
  if(Array.isArray(row?.categories)) return String(row.categories?.[0]?.name || "");
  return String(row?.categories?.name || "");
}

async function listProducts(){
  const baseSelect = "id,sku,name,category_id,unit,price,stock_cases,quantity_per_case,image_url,is_active";
  const embedQuery = `/rest/v1/products?select=${baseSelect},categories(name)&is_active=eq.true&order=name.asc`;
  let rows = [];
  try{
    rows = await supabaseRequest(embedQuery, { serviceRole: true });
  }catch{
    const rawRows = await supabaseRequest(`/rest/v1/products?select=${baseSelect}&is_active=eq.true&order=name.asc`, { serviceRole: true });
    const categories = await supabaseRequest("/rest/v1/categories?select=id,name", { serviceRole: true }).catch(() => []);
    const categoryById = new Map((categories || []).map((c) => [c.id, c.name]));
    rows = rawRows.map((r) => ({
      ...r,
      categories: { name: categoryById.get(r.category_id) || "" }
    }));
  }
  return rows.map(r => ({
    id: r.sku,
    dbId: r.id,
    sku: r.sku,
    name: r.name,
    category: getProductCategoryName(r),
    category_id: r.category_id || null,
    unit: r.unit,
    price: Number(r.price),
    stockCases: Number(r.stock_cases),
    quantityPerCase: validateQuantityPerCase(r.quantity_per_case || 1),
    image_url: r.image_url || ""
  }));
}

async function listAdminCategories(){
  const rows = await supabaseRequest("/rest/v1/categories?select=id,name&order=name.asc", { serviceRole: true });
  return rows.map((r) => String(r.name || "").trim()).filter(Boolean);
}

function normalizeCategoryName(name){
  return String(name || "").trim().replace(/\s+/g, " ");
}

async function getCategoryByName(name){
  const normalized = normalizeCategoryName(name);
  if(!normalized) return null;
  const rows = await supabaseRequest(`/rest/v1/categories?select=id,name&name=ilike.${encodeURIComponent(normalized)}&limit=1`, {
    serviceRole: true
  });
  return rows?.[0] || null;
}

async function ensureCategory(name){
  const normalized = normalizeCategoryName(name);
  if(!normalized) throw new Error("Category name is required.");
  const existing = await getCategoryByName(normalized);
  if(existing) return existing;
  const inserted = await supabaseRequest("/rest/v1/categories", {
    method: "POST",
    serviceRole: true,
    headers: { Prefer: "return=representation" },
    body: [{ name: normalized }]
  });
  return inserted?.[0] || null;
}

async function addAdminCategory(name){
  const normalized = normalizeCategoryName(name);
  if(!normalized){
    throw new Error("Category name is required.");
  }
  await ensureCategory(normalized);
  return await listAdminCategories();
}

async function deleteAdminCategory(name){
  const normalized = normalizeCategoryName(name);
  if(!normalized){
    throw new Error("Category name is required.");
  }
  const existing = await getCategoryByName(normalized);
  if(!existing){
    return await listAdminCategories();
  }
  const assignedProducts = await supabaseRequest(
    `/rest/v1/products?select=id&category_id=eq.${encodeURIComponent(existing.id)}&limit=1`,
    { serviceRole: true }
  );
  if(assignedProducts.length){
    throw httpError(`Cannot delete "${existing.name}" because products are still assigned to it. Move or delete those products first.`, 409);
  }
  await supabaseRequest(`/rest/v1/categories?id=eq.${encodeURIComponent(existing.id)}`, {
    method: "DELETE",
    serviceRole: true
  });
  return await listAdminCategories();
}

async function getProductBySkuRaw(sku){
  const baseSelect = "id,sku,name,category_id,unit,price,stock_cases,quantity_per_case,image_url,is_active";
  const encodedSku = encodeURIComponent(sku);
  try{
    const rows = await supabaseRequest(
      `/rest/v1/products?select=${baseSelect},categories(name)&sku=eq.${encodedSku}&limit=1`,
      { serviceRole: true }
    );
    return rows?.[0] || null;
  }catch{
    const rows = await supabaseRequest(
      `/rest/v1/products?select=${baseSelect}&sku=eq.${encodedSku}&limit=1`,
      { serviceRole: true }
    );
    const row = rows?.[0] || null;
    if(!row) return null;
    const cat = row.category_id
      ? (await supabaseRequest(`/rest/v1/categories?select=id,name&id=eq.${encodeURIComponent(row.category_id)}&limit=1`, { serviceRole: true }).catch(() => []))?.[0]
      : null;
    return { ...row, categories: { name: cat?.name || "" } };
  }
}

async function getProductByNameRaw(name){
  const baseSelect = "id,sku,name,category_id,unit,price,stock_cases,quantity_per_case,image_url,is_active";
  const encodedName = encodeURIComponent(String(name || "").trim());
  try{
    const rows = await supabaseRequest(
      `/rest/v1/products?select=${baseSelect},categories(name)&name=ilike.${encodedName}&limit=1`,
      { serviceRole: true }
    );
    return rows?.[0] || null;
  }catch{
    const rows = await supabaseRequest(
      `/rest/v1/products?select=${baseSelect}&name=ilike.${encodedName}&limit=1`,
      { serviceRole: true }
    );
    const row = rows?.[0] || null;
    if(!row) return null;
    const cat = row.category_id
      ? (await supabaseRequest(`/rest/v1/categories?select=id,name&id=eq.${encodeURIComponent(row.category_id)}&limit=1`, { serviceRole: true }).catch(() => []))?.[0]
      : null;
    return { ...row, categories: { name: cat?.name || "" } };
  }
}

function makeSkuBase(name){
  const normalized = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "PRODUCT";
}

async function generateUniqueSku(name){
  const base = makeSkuBase(name).slice(0, 18);
  for(let i = 0; i < 1000; i++){
    const suffix = i === 0
      ? `${Date.now().toString().slice(-5)}`
      : `${Date.now().toString().slice(-5)}-${i}`;
    const candidate = `${base}-${suffix}`;
    const exists = await getProductBySkuRaw(candidate);
    if(!exists) return candidate;
  }
  throw new Error("Failed to generate unique SKU.");
}

function toInventoryProductRow(row){
  return {
    id: row.sku,
    dbId: row.id,
    sku: row.sku,
    name: row.name,
    category: getProductCategoryName(row),
    category_id: row.category_id || null,
    unit: row.unit,
    price: Number(row.price || 0),
    stockCases: Number(row.stock_cases || 0),
    quantityPerCase: validateQuantityPerCase(row.quantity_per_case || 1),
    image_url: row.image_url || "",
    is_active: row.is_active !== false
  };
}

async function createInventoryProduct(payload, actorProfile = null){
  const providedSku = String(payload.sku || "").trim();
  const name = String(payload.name || "").trim();
  const category = normalizeCategoryName(payload.category || "");
  const unit = String(payload.unit || "").trim();
  const price = Number(payload.price || 0);
  const stockCases = Number(payload.stockCases ?? payload.stock_cases ?? 0);
  const quantityPerCase = validateQuantityPerCase(payload.quantityPerCase ?? payload.quantity_per_case ?? 1);
  const imageUrl = String(payload.imageUrl || payload.image_url || "").trim();
  const isActive = payload.isActive !== false;

  if(!name || !category || !unit){
    throw new Error("name, category, and unit are required.");
  }
  if(Number.isNaN(price) || price < 0){
    throw new Error("price must be a non-negative number.");
  }
  if(Number.isNaN(stockCases) || stockCases < 0){
    throw new Error("stockCases must be a non-negative number.");
  }
  let sku = providedSku;
  if(sku){
    const exists = await getProductBySkuRaw(sku);
    if(exists){
      const err = new Error("Product SKU already exists.");
      err.status = 409;
      throw err;
    }
  } else {
    sku = await generateUniqueSku(name);
  }

  const categoryRow = await ensureCategory(category);

  const inserted = await supabaseRequest("/rest/v1/products", {
    method: "POST",
    serviceRole: true,
    headers: { Prefer: "return=representation" },
    body: [{
      sku,
      name,
      category_id: categoryRow?.id || null,
      unit,
      price,
      stock_cases: stockCases,
      quantity_per_case: quantityPerCase,
      image_url: imageUrl || null,
      is_active: isActive
    }]
  });
  if(inserted?.[0]){
    await createInventoryHistoryEntry({
      productId: inserted[0].id,
      productName: inserted[0].name || name,
      productSku: inserted[0].sku || sku,
      beforeStock: 0,
      afterStock: stockCases,
      stockAdded: stockCases,
      stockDeducted: 0,
      action: "create_product",
      remarks: `Product ${name} created.`,
      updatedBy: actorProfile?.user_id || null,
      updatedByName: actorProfile?.full_name || actorProfile?.email || null
    });
  }
  return toInventoryProductRow(inserted?.[0] || {});
}

async function updateInventoryProductByName(name, payload, actorProfile = null){
  const existing = await getProductByNameRaw(name);
  if(!existing){
    const err = new Error("Product not found.");
    err.status = 404;
    throw err;
  }

  const patch = {};
  if("name" in payload) patch.name = String(payload.name || "").trim();
  if("category" in payload){
    const categoryName = normalizeCategoryName(payload.category || "");
    if(!categoryName) throw new Error("category cannot be empty.");
    const categoryRow = await ensureCategory(categoryName);
    patch.category_id = categoryRow?.id || null;
  }
  if("unit" in payload) patch.unit = String(payload.unit || "").trim();
  if("price" in payload){
    const price = Number(payload.price);
    if(Number.isNaN(price) || price < 0) throw new Error("price must be a non-negative number.");
    patch.price = price;
  }
  if("stockCases" in payload || "stock_cases" in payload){
    const stockCases = Number(payload.stockCases ?? payload.stock_cases);
    if(Number.isNaN(stockCases) || stockCases < 0) throw new Error("stockCases must be a non-negative number.");
    patch.stock_cases = stockCases;
  }
  if("quantityPerCase" in payload || "quantity_per_case" in payload){
    patch.quantity_per_case = validateQuantityPerCase(payload.quantityPerCase ?? payload.quantity_per_case);
  }
  if("imageUrl" in payload || "image_url" in payload){
    patch.image_url = String(payload.imageUrl ?? payload.image_url ?? "").trim() || null;
  }
  if("isActive" in payload) patch.is_active = payload.isActive !== false;

  for(const key of ["name", "unit"]){
    if(key in patch && !patch[key]){
      throw new Error(`${key} cannot be empty.`);
    }
  }
  if(!Object.keys(patch).length){
    throw new Error("No editable fields provided.");
  }

  const updated = await supabaseRequest(`/rest/v1/products?id=eq.${existing.id}`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=representation" },
    body: patch
  });
  if("stock_cases" in patch){
    await createInventoryHistoryEntry({
      productId: existing.id,
      productName: patch.name || existing.name,
      productSku: existing.sku,
      beforeStock: Number(existing.stock_cases || 0),
      afterStock: Number(patch.stock_cases || 0),
      stockAdded: Math.max(0, Number(patch.stock_cases || 0) - Number(existing.stock_cases || 0)),
      stockDeducted: Math.max(0, Number(existing.stock_cases || 0) - Number(patch.stock_cases || 0)),
      action: "update_stock",
      remarks: `Stock updated while editing ${patch.name || existing.name}.`,
      updatedBy: actorProfile?.user_id || null,
      updatedByName: actorProfile?.full_name || actorProfile?.email || null
    });
  }
  return toInventoryProductRow(updated?.[0] || existing);
}

async function restockInventoryProductByName(payload, actorProfile = null){
  const productName = String(payload.productName || payload.product_name || "").trim();
  const addCases = Number(payload.addCases ?? payload.add_cases ?? 0);
  if(!productName) throw new Error("productName is required.");
  if(Number.isNaN(addCases) || addCases <= 0){
    throw new Error("addCases must be greater than zero.");
  }
  const product = await getProductByNameRaw(productName);
  if(!product){
    const err = new Error("Product not found.");
    err.status = 404;
    throw err;
  }
  const nextStock = Number(product.stock_cases || 0) + addCases;
  const updated = await supabaseRequest(`/rest/v1/products?id=eq.${product.id}`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=representation" },
    body: { stock_cases: nextStock, is_active: true }
  });
  await createInventoryHistoryEntry({
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    beforeStock: Number(product.stock_cases || 0),
    afterStock: nextStock,
    stockAdded: addCases,
    stockDeducted: 0,
    action: "restock",
    remarks: `Restocked ${product.name} by ${addCases} case(s).`,
    updatedBy: actorProfile?.user_id || null,
    updatedByName: actorProfile?.full_name || actorProfile?.email || null
  });
  return toInventoryProductRow(updated?.[0] || product);
}

async function deleteInventoryProductByName(name){
  const product = await getProductByNameRaw(name);
  if(!product){
    const err = new Error("Product not found.");
    err.status = 404;
    throw err;
  }
  await supabaseRequest(`/rest/v1/products?id=eq.${product.id}`, {
    method: "DELETE",
    serviceRole: true
  });
}

async function listProfiles(){
  return await supabaseRequest("/rest/v1/profiles?select=user_id,email,role,full_name,contact,address,is_active,created_at,updated_at", { serviceRole: true });
}

async function listAllOrdersRaw(){
  return await supabaseRequest("/rest/v1/orders?select=id,order_code,user_id,customer_name,contact,address,fulfillment_type,subtotal,delivery_fee,discount_amount,total,status,payment_status,payment_method,created_at,paid_at,prepared_at,prepared_by,preparation_completed&order=created_at.desc", { serviceRole: true });
}

async function listAllOrderItems(orderIds){
  if(!orderIds.length) return [];
  const inFilter = encodeURIComponent(`(${escapeCsvValues(orderIds)})`);
  return await supabaseRequest(`/rest/v1/order_items?select=order_id,product_id,sku,name,image_url,unit_price,qty,line_total,created_at&order_id=in.${inFilter}&order=created_at.asc`, { serviceRole: true });
}

async function listAllOrderEvents(orderIds){
  if(!orderIds.length) return [];
  const inFilter = encodeURIComponent(`(${escapeCsvValues(orderIds)})`);
  return await supabaseRequest(`/rest/v1/order_status_events?select=order_id,status,note,changed_by,created_at&order_id=in.${inFilter}&order=created_at.asc`, { serviceRole: true });
}

async function listAllOrdersDetailed(){
  const [orders, profiles] = await Promise.all([listAllOrdersRaw(), listProfiles()]);
  if(!orders.length) return [];
  const orderIds = orders.map(o => o.id);
  const [items, events, preparationRows] = await Promise.all([
    listAllOrderItems(orderIds),
    listAllOrderEvents(orderIds),
    listPreparationRows(orderIds)
  ]);
  const profileByUser = new Map(profiles.map(p => [p.user_id, p]));
  return orders.map(order => ({
    ...toUiOrder(
      order,
      items.filter(i => i.order_id === order.id),
      events.filter(e => e.order_id === order.id)
    ),
    userId: order.user_id,
    createdAtRaw: order.created_at,
    paymentStatus: order.payment_status,
    paidAt: order.paid_at || "",
    preparation: buildPreparationSummary(
      toUiOrder(order, items.filter(i => i.order_id === order.id), events.filter(e => e.order_id === order.id)),
      preparationRows.filter((row) => row.order_id === order.id)
    ),
    profile: profileByUser.get(order.user_id) || null
  }));
}

async function listAdminOrdersDetailedPage({ page = 1, perPage = 10, status = "All", search = "" } = {}){
  const orders = await listAllOrdersDetailed();
  const query = String(search || "").trim().toLowerCase();
  const filtered = orders.filter((order) => {
    const matchesStatus = !status || status === "All" || toUiStatus(order.status) === status || String(order.status || "") === status;
    if(!matchesStatus) return false;
    if(!query) return true;
    const haystack = [
      order.id,
      order.customerName,
      order.contact,
      order.createdAt,
      toUiStatus(order.status),
      order.paymentStatus,
      ...(order.items || []).map((item) => item.name)
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });
  const safePerPage = Math.min(100, Math.max(1, Number(perPage) || 10));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / safePerPage));
  const safePage = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const start = (safePage - 1) * safePerPage;
  return {
    orders: filtered.slice(start, start + safePerPage),
    pagination: {
      page: safePage,
      perPage: safePerPage,
      total,
      totalPages
    }
  };
}

function getRewardConfig(type){
  return REWARD_CATALOG[String(type || "").trim()] || null;
}

function toRewardLabel(type){
  return getRewardConfig(type)?.label || String(type || "");
}

function isMissingRelationError(err, relation){
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes(`relation "${String(relation || "").toLowerCase()}"`) || msg.includes(`${String(relation || "").toLowerCase()} does not exist`);
}

function computeRewardEarnings(orders){
  const nonCancelled = (orders || []).filter((o) => String(o.status || "") !== "Cancelled");
  const deliveredCount = nonCancelled.filter((o) => String(o.status || "") === "Delivered").length;
  const totalSpent = nonCancelled.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const spendPoints = nonCancelled.reduce((sum, o) => sum + Math.floor(Number(o.total || 0) / 100) * 10, 0);
  const completionPoints = deliveredCount * 25;
  return {
    totalSpent,
    spendPoints,
    completionPoints,
    earnedPoints: spendPoints + completionPoints
  };
}

async function listRewardRedemptionsByUserId(userId){
  try{
    return await supabaseRequest(
      `/rest/v1/reward_redemptions?select=id,user_id,email,reward_type,points_cost,status,order_id,created_by,created_at,used_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
      { serviceRole: true }
    );
  }catch(err){
    if(isMissingRelationError(err, "reward_redemptions")) return [];
    throw err;
  }
}

async function listAllRewardRedemptions(){
  try{
    return await supabaseRequest(
      "/rest/v1/reward_redemptions?select=id,user_id,email,reward_type,points_cost,status,order_id,created_by,created_at,used_at&order=created_at.desc",
      { serviceRole: true }
    );
  }catch(err){
    if(isMissingRelationError(err, "reward_redemptions")) return [];
    throw err;
  }
}

async function getRewardSummaryForUserId(userId, email = ""){
  const [orders, redemptions] = await Promise.all([
    listOrdersForUserId(userId),
    listRewardRedemptionsByUserId(userId)
  ]);
  const earnings = computeRewardEarnings(orders);
  const reservedOrUsed = (redemptions || []).filter((r) => {
    const s = String(r.status || "").toLowerCase();
    return s === "reserved" || s === "used";
  });
  const redeemedPoints = reservedOrUsed.reduce((sum, r) => sum + Number(r.points_cost || 0), 0);
  const points = Math.max(0, Number(earnings.earnedPoints || 0) - redeemedPoints);
  const activeRedemptions = (redemptions || [])
    .filter((r) => String(r.status || "").toLowerCase() === "reserved")
    .map((r) => ({
      id: r.id,
      rewardType: r.reward_type,
      rewardLabel: toRewardLabel(r.reward_type),
      pointsCost: Number(r.points_cost || 0),
      createdAt: r.created_at
    }));
  return {
    email,
    totalSpent: Number(earnings.totalSpent || 0),
    spendPoints: Number(earnings.spendPoints || 0),
    completionPoints: Number(earnings.completionPoints || 0),
    earnedPoints: Number(earnings.earnedPoints || 0),
    redeemedPoints: Number(redeemedPoints || 0),
    points: Number(points || 0),
    activeRedemptions
  };
}

async function createRewardRedemption({ userId, email, rewardType, actorUserId }){
  const cfg = getRewardConfig(rewardType);
  if(!cfg){
    throw new Error("Invalid reward type.");
  }
  const summary = await getRewardSummaryForUserId(userId, email);
  if(Number(summary.points || 0) < Number(cfg.cost || 0)){
    const err = new Error("Customer has insufficient points.");
    err.status = 409;
    throw err;
  }
  let row;
  try{
    const inserted = await supabaseRequest("/rest/v1/reward_redemptions", {
      method: "POST",
      serviceRole: true,
      headers: { Prefer: "return=representation" },
      body: [{
        user_id: userId,
        email: email || null,
        reward_type: cfg.type,
        points_cost: cfg.cost,
        status: "reserved",
        created_by: actorUserId || null
      }]
    });
    row = inserted?.[0];
  }catch(err){
    if(isMissingRelationError(err, "reward_redemptions")){
      const migrationErr = new Error("Rewards table missing. Run sql/2026-03-07_rewards_logic.sql first.");
      migrationErr.status = 500;
      throw migrationErr;
    }
    throw err;
  }
  const next = await getRewardSummaryForUserId(userId, email);
  return {
    ok: true,
    reward: {
      id: row?.id,
      rewardType: cfg.type,
      rewardLabel: cfg.label,
      pointsCost: Number(cfg.cost || 0)
    },
    summary: next
  };
}

async function getReservedRedemptionForUser(redemptionId, userId){
  if(!redemptionId) return null;
  try{
    const rows = await supabaseRequest(
      `/rest/v1/reward_redemptions?select=id,user_id,email,reward_type,points_cost,status,order_id,created_at&id=eq.${encodeURIComponent(redemptionId)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.reserved&limit=1`,
      { serviceRole: true }
    );
    return rows?.[0] || null;
  }catch(err){
    if(isMissingRelationError(err, "reward_redemptions")){
      const migrationErr = new Error("Rewards table missing. Run sql/2026-03-07_rewards_logic.sql first.");
      migrationErr.status = 500;
      throw migrationErr;
    }
    throw err;
  }
}

function computeRewardDiscount({ rewardType, subtotal, deliveryFee }){
  const type = String(rewardType || "");
  if(type === "free_delivery"){
    return Math.max(0, Number(deliveryFee || 0));
  }
  if(type === "discount_10"){
    const raw = Number(subtotal || 0) * 0.10;
    return Math.max(0, Number(raw.toFixed(2)));
  }
  return 0;
}

function computeTopSellingProducts(orders = []){
  const byProduct = new Map();
  for(const order of orders || []){
    for(const item of order.items || []){
      const key = String(item.name || item.productId || "").trim();
      if(!key) continue;
      const current = byProduct.get(key) || { product: key, quantitySold: 0, revenue: 0 };
      current.quantitySold += Number(item.qty || 0);
      current.revenue += Number(item.qty || 0) * Number(item.price || 0);
      byProduct.set(key, current);
    }
  }
  return [...byProduct.values()].sort((a, b) => Number(b.quantitySold || 0) - Number(a.quantitySold || 0));
}

function computePaymentBreakdown(orders = []){
  const breakdown = new Map();
  for(const order of orders || []){
    const label = paymentMethodLabel(order.paymentMethod || order.payment_method);
    const current = breakdown.get(label) || { paymentMethod: label, orders: 0, revenue: 0 };
    current.orders += 1;
    current.revenue += Number(order.total || 0);
    breakdown.set(label, current);
  }
  return [...breakdown.values()].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
}

function computeFulfillmentBreakdown(orders = []){
  const breakdown = new Map();
  for(const order of orders || []){
    const label = normalizeFulfillmentType(order.fulfillmentType || order.fulfillment_type) === "pickup" ? "Pickup" : "Delivery";
    const current = breakdown.get(label) || { fulfillmentType: label, orders: 0, revenue: 0 };
    current.orders += 1;
    current.revenue += Number(order.total || 0);
    breakdown.set(label, current);
  }
  return [...breakdown.values()];
}

async function getPanelDashboard(){
  const [orders, products, profiles] = await Promise.all([listAllOrdersDetailed(), listProducts(), listProfiles()]);
  const recentOrders = orders.slice(0, 8);
  const totalSales = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const transactions = orders.length;
  const todayOrders = filterOrdersByRange(orders, "today");
  const salesToday = todayOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const topProducts = computeTopSellingProducts(orders);
  const bestSeller = topProducts[0]?.product || "-";
  const lowStock = products
    .filter((p) => Number(p.stockCases) > 0 && Number(p.stockCases) <= LOW_STOCK_THRESHOLD)
    .map((p) => ({ ...p, status: "Low Stock" }))
    .sort((a, b) => Number(a.stockCases || 0) - Number(b.stockCases || 0));
  const outOfStock = products
    .filter((p) => Number(p.stockCases) <= 0)
    .map((p) => ({ ...p, status: "Out of Stock" }));
  const customers = profiles.filter((profile) => String(profile.role || "") === "customer");
  return {
    recentOrders,
    orders,
    customers,
    todayOrders,
    lowStock,
    outOfStock,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    analytics: {
      topProducts,
      paymentBreakdown: computePaymentBreakdown(orders),
      fulfillmentBreakdown: computeFulfillmentBreakdown(orders)
    },
    kpis: {
      totalSales,
      salesToday,
      transactions,
      totalOrders: orders.length,
      totalCustomers: customers.length,
      bestSeller,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length
    }
  };
}

async function getPanelCustomers(){
  const [profiles, orders] = await Promise.all([listProfiles(), listAllOrdersRaw()]);
  const byUser = new Map();
  for(const p of profiles){
    byUser.set(p.user_id, {
      name: p.full_name || p.email || "Unknown",
      email: p.email || "",
      totalOrders: 0,
      lastOrder: ""
    });
  }
  for(const o of orders){
    const rec = byUser.get(o.user_id) || {
      name: o.customer_name || "Unknown",
      email: "",
      totalOrders: 0,
      lastOrder: ""
    };
    rec.totalOrders += 1;
    rec.lastOrder = rec.lastOrder || formatDate(o.created_at);
    byUser.set(o.user_id, rec);
  }
  return [...byUser.values()].sort((a,b)=>b.totalOrders-a.totalOrders);
}

async function getPanelInventory(){
  const products = await listProducts();
  const inventory = products.map(p => ({
    ...p,
    status: Number(p.stockCases) <= 0 ? "Out of Stock" : Number(p.stockCases) <= LOW_STOCK_THRESHOLD ? "Low Stock" : "In Stock"
  }));
  const lowStock = inventory.filter(p => Number(p.stockCases) > 0 && Number(p.stockCases) <= LOW_STOCK_THRESHOLD).sort((a,b)=>a.stockCases-b.stockCases);
  const outOfStock = inventory.filter(p => Number(p.stockCases) <= 0);
  const categories = await listAdminCategories();
  return { inventory, lowStock, outOfStock, categories, lowStockThreshold: LOW_STOCK_THRESHOLD };
}

async function getPanelSales(){
  const orders = await listAllOrdersDetailed();
  const salesOrders = orders.filter(o => o.status !== "Cancelled");
  const byDate = new Map();
  const byWeek = new Map();
  const byMonth = new Map();
  const productQty = new Map();
  for(const o of salesOrders){
    const d = new Date(o.createdAtRaw || o.createdAt);
    const dateKey = d.toISOString().slice(0,10);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const weekKey = weekStart.toISOString().slice(0,10);
    for(const [m, key] of [[byDate,dateKey],[byWeek,weekKey],[byMonth,monthKey]]){
      const rec = m.get(key) || { sales: 0, transactions: 0, orders: 0 };
      rec.sales += Number(o.total || 0);
      rec.transactions += 1;
      rec.orders += 1;
      m.set(key, rec);
    }
    for(const it of o.items || []){
      productQty.set(it.name, (productQty.get(it.name) || 0) + Number(it.qty || 0));
    }
  }
  let bestSeller = "-";
  let bestQty = 0;
  for(const [name, qty] of productQty){
    if(qty > bestQty){ bestQty = qty; bestSeller = name; }
  }
  const latestDaily = [...byDate.entries()].sort((a,b)=>a[0] < b[0] ? 1 : -1)[0];
  const latestWeekly = [...byWeek.entries()].sort((a,b)=>a[0] < b[0] ? 1 : -1)[0];
  const latestMonthly = [...byMonth.entries()].sort((a,b)=>a[0] < b[0] ? 1 : -1)[0];
  const avgOrderValue =
    (latestDaily?.[1]?.transactions || 0) > 0
      ? Number(latestDaily?.[1]?.sales || 0) / Number(latestDaily?.[1]?.transactions || 1)
      : 0;
  const last7Days = [];
  const now = new Date();
  for(let i = 6; i >= 0; i--){
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    const key = day.toISOString().slice(0,10);
    const rec = byDate.get(key) || { sales: 0, transactions: 0, orders: 0 };
    last7Days.push({
      key,
      date: key,
      label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sales: rec.sales,
      orders: rec.orders,
      transactions: rec.transactions
    });
  }
  const dailyRows = [...last7Days].reverse();
  return {
    kpis: {
      todaySales: latestDaily?.[1]?.sales || 0,
      transactions: latestDaily?.[1]?.transactions || 0,
      bestSeller,
      refunds: 0,
      avgOrderValue
    },
    chart: {
      title: "Sales and Orders by Date (Last 7 Days)",
      points: last7Days
    },
    dailyRows,
    rows: [
      { period: "Daily", sales: latestDaily?.[1]?.sales || 0, transactions: latestDaily?.[1]?.transactions || 0, bestSeller },
      { period: "Weekly", sales: latestWeekly?.[1]?.sales || 0, transactions: latestWeekly?.[1]?.transactions || 0, bestSeller },
      { period: "Monthly", sales: latestMonthly?.[1]?.sales || 0, transactions: latestMonthly?.[1]?.transactions || 0, bestSeller }
    ]
  };
}

async function getPanelReports(){
  const [orders, products] = await Promise.all([listAllOrdersDetailed(), listProducts()]);
  const delivered = orders.filter(o => o.status === "Delivered").length;
  const pending = orders.filter(o => o.status !== "Delivered" && o.status !== "Cancelled").length;
  const low = products.filter(p => Number(p.stockCases) > 0 && Number(p.stockCases) <= LOW_STOCK_THRESHOLD).length;
  const out = products.filter(p => Number(p.stockCases) <= 0).length;
  return [
    { key: "sales", reportType: "Sales Report", coverage: `${orders.length} orders total`, status: "available" },
    { key: "inventory", reportType: "Inventory Report", coverage: `${products.length} products (${low} low, ${out} out)`, status: "available" },
    { key: "top-selling", reportType: "Top Selling Products", coverage: "Computed from order items", status: "available" },
    { key: "delivery", reportType: "Delivery Summary", coverage: `${delivered} delivered / ${pending} pending`, status: "available" }
  ];
}

function previousRangeBounds(range, from, to, now = new Date()){
  const current = getRangeBounds(range, from, to, now);
  if(!current.start || !current.end) return { start: null, end: null, key: "all" };
  const duration = current.end.getTime() - current.start.getTime() + 1;
  return {
    start: new Date(current.start.getTime() - duration),
    end: new Date(current.start.getTime() - 1),
    key: `${current.key}_previous`
  };
}

function filterOrdersByBounds(orders, bounds){
  return (orders || []).filter((order) => isWithinRange(order.createdAtRaw || order.createdAt, bounds));
}

function buildTrendLabel(current, previous){
  const delta = Number(current || 0) - Number(previous || 0);
  if(delta > 0) return "Up";
  if(delta < 0) return "Down";
  return "Stable";
}

async function getPanelReportDetail(type, { range = "all", from = "", to = "" } = {}){
  const reportType = String(type || "").trim().toLowerCase();
  const [orders, products, inventoryHistory] = await Promise.all([
    listAllOrdersDetailed(),
    listProducts(),
    listInventoryHistory({ from, to })
  ]);
  const filteredOrders = filterOrdersByRange(orders, range, from, to);
  const previousOrders = filterOrdersByBounds(orders, previousRangeBounds(range, from, to));
  const activeOrders = filteredOrders.filter((order) => statusLabel(order.status) !== "Cancelled");

  if(reportType === "sales"){
    return {
      type: "sales",
      title: "Sales Report",
      filter: { range, from, to },
      totals: {
        totalSales: activeOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
        orders: activeOrders.length,
        soldProducts: activeOrders.reduce((sum, order) => sum + sumOrderItemQty(order), 0),
        revenue: activeOrders.reduce((sum, order) => sum + Number(order.total || 0), 0)
      },
      paymentBreakdown: computePaymentBreakdown(activeOrders),
      fulfillmentBreakdown: computeFulfillmentBreakdown(activeOrders),
      rows: activeOrders.slice(0, 25)
    };
  }

  if(reportType === "inventory"){
    const bounds = getRangeBounds(range, from, to);
    const filteredHistory = inventoryHistory.filter((row) => isWithinRange(row.created_at, bounds));
    return {
      type: "inventory",
      title: "Inventory Report",
      filter: { range, from, to },
      totals: {
        products: products.length,
        lowStock: products.filter((p) => Number(p.stockCases) > 0 && Number(p.stockCases) <= LOW_STOCK_THRESHOLD).length,
        outOfStock: products.filter((p) => Number(p.stockCases) <= 0).length,
        movements: filteredHistory.length
      },
      rows: filteredHistory
    };
  }

  if(reportType === "top-selling"){
    const currentTop = computeTopSellingProducts(activeOrders);
    const previousTop = computeTopSellingProducts(previousOrders);
    const previousByProduct = new Map(previousTop.map((row) => [row.product, row]));
    const stockByName = new Map(products.map((product) => [product.name, product.stockCases]));
    return {
      type: "top-selling",
      title: "Top Selling Products",
      filter: { range, from, to },
      rows: currentTop.map((row, index) => ({
        ranking: index + 1,
        product: row.product,
        quantitySold: row.quantitySold,
        revenue: row.revenue,
        currentStock: Number(stockByName.get(row.product) || 0),
        trend: buildTrendLabel(row.quantitySold, previousByProduct.get(row.product)?.quantitySold || 0)
      }))
    };
  }

  if(reportType === "delivery"){
    const statusKeys = ["Order Placed", "Preparing", "Prepared", "Out for Delivery", "Delivered", "Ready for Pickup", "Picked Up", "Cancelled"];
    const counts = Object.fromEntries(statusKeys.map((key) => [key, 0]));
    let completed = 0;
    const deliveryTimes = [];
    for(const order of filteredOrders){
      const label = statusLabel(order.status);
      if(label in counts) counts[label] += 1;
      if(label === "Preparing" && order.preparationCompleted) counts.Prepared += 1;
      const fulfillment = normalizeFulfillmentType(order.fulfillmentType);
      if(fulfillment === "pickup" && label === "Order Placed" && order.preparationCompleted) counts["Ready for Pickup"] += 1;
      if(fulfillment === "pickup" && label === "Delivered") counts["Picked Up"] += 1;
      if(fulfillment === "delivery" && label === "Delivered") counts["Delivered"] += 0;
      if(label === "Delivered"){
        completed += 1;
        const started = Date.parse(order.createdAtRaw || order.createdAt || "");
        const ended = Date.parse(order.preparedAt || order.createdAtRaw || order.createdAt || "");
        if(Number.isFinite(started) && Number.isFinite(ended) && ended >= started){
          deliveryTimes.push((ended - started) / (1000 * 60 * 60));
        }
      }
    }
    const avgHours = deliveryTimes.length
      ? deliveryTimes.reduce((sum, value) => sum + value, 0) / deliveryTimes.length
      : 0;
    const codOrders = filteredOrders.filter((order) => normalizePaymentMethod(order.paymentMethod) === "cod");
    const onlineOrders = filteredOrders.filter((order) => normalizePaymentMethod(order.paymentMethod) !== "cod");
    return {
      type: "delivery",
      title: "Delivery Summary",
      filter: { range, from, to },
      statusBreakdown: counts,
      fulfillmentBreakdown: computeFulfillmentBreakdown(filteredOrders),
      paymentBreakdown: [
        { label: "COD", orders: codOrders.length },
        { label: "Online Payments", orders: onlineOrders.length }
      ],
      averageDeliveryTime: formatDurationHours(avgHours),
      completionRate: filteredOrders.length ? Math.round((completed / filteredOrders.length) * 100) : 0,
      rows: filteredOrders.slice(0, 25)
    };
  }

  throw httpError("Report not found.", 404);
}

async function getPanelRewards(){
  const [profiles, orders, redemptions] = await Promise.all([
    listProfiles(),
    listAllOrdersDetailed(),
    listAllRewardRedemptions()
  ]);
  const customerProfiles = profiles.filter((p) => String(p.role || "").toLowerCase() === "customer");
  const byUser = new Map();
  for(const p of customerProfiles){
    byUser.set(p.user_id, {
      userId: p.user_id,
      customer: p.full_name || p.email || "Customer",
      email: p.email || "",
      totalSpent: 0,
      spendPoints: 0,
      completionPoints: 0,
      earnedPoints: 0,
      redeemedPoints: 0,
      points: 0,
      activeRedemptions: 0
    });
  }
  for(const o of orders){
    if(!o.userId) continue;
    const rec = byUser.get(o.userId) || {
      userId: o.userId,
      customer: o.customerName || "Customer",
      email: o.profile?.email || "",
      totalSpent: 0,
      spendPoints: 0,
      completionPoints: 0,
      earnedPoints: 0,
      redeemedPoints: 0,
      points: 0,
      activeRedemptions: 0
    };
    if(String(o.status || "") !== "Cancelled"){
      rec.totalSpent += Number(o.total || 0);
      rec.spendPoints += Math.floor(Number(o.total || 0) / 100) * 10;
      if(String(o.status || "") === "Delivered"){
        rec.completionPoints += 25;
      }
    }
    rec.earnedPoints = rec.spendPoints + rec.completionPoints;
    byUser.set(o.userId, rec);
  }
  for(const r of redemptions || []){
    const rec = byUser.get(r.user_id) || {
      userId: r.user_id,
      customer: r.email || "Customer",
      email: r.email || "",
      totalSpent: 0,
      spendPoints: 0,
      completionPoints: 0,
      earnedPoints: 0,
      redeemedPoints: 0,
      points: 0,
      activeRedemptions: 0
    };
    const s = String(r.status || "").toLowerCase();
    if(s === "reserved" || s === "used"){
      rec.redeemedPoints += Number(r.points_cost || 0);
    }
    if(s === "reserved"){
      rec.activeRedemptions += 1;
    }
    byUser.set(r.user_id, rec);
  }
  const rows = [...byUser.values()].map((r) => ({
    ...r,
    points: Math.max(0, Number(r.earnedPoints || 0) - Number(r.redeemedPoints || 0))
  }));
  return rows.sort((a,b)=>Number(b.points || 0)-Number(a.points || 0));
}

async function redeemRewardByAdmin(payload){
  const rewardType = String(payload.rewardType || "").trim();
  const customerEmail = String(payload.customerEmail || "").trim().toLowerCase();
  const profiles = await listProfiles();
  const customers = profiles.filter((p) => String(p.role || "").toLowerCase() === "customer");
  const target = customerEmail
    ? customers.find((p) => String(p.email || "").toLowerCase() === customerEmail)
    : customers[0];
  if(!target?.user_id){
    throw new Error("No eligible customer reward account found.");
  }
  const created = await createRewardRedemption({
    userId: target.user_id,
    email: target.email || "",
    rewardType,
    actorUserId: payload.actorUserId || null
  });
  return {
    ...created,
    customer: target.full_name || target.email || "Customer",
    email: target.email || "",
    rewardType: created.reward.rewardType,
    redeemedPoints: created.reward.pointsCost,
    remainingPoints: created.summary.points
  };
}

async function getPanelDelivery(){
  const orders = await listAllOrdersDetailed();
  const inProgressStatuses = new Set(["In Transit","Out for Delivery","Preparing","Order Placed"]);
  const activeOrders = orders.filter((o) => inProgressStatuses.has(String(o.status || "")));
  const productTracks = [];
  for(const order of orders){
    const items = (order.items || []).map((item) => ({
      productName: item.name,
      name: item.name,
      qty: Number(item.qty || 0)
    }));
    productTracks.push({
      orderId: order.id,
      productName: items.length > 1 ? `${items.length} items` : (items[0]?.name || "-"),
      qty: items.reduce((sum, item) => sum + Number(item.qty || 0), 0),
      items,
      customerName: order.customerName,
      recipientName: order.customerName,
      contact: order.contact,
      fulfillmentType: order.fulfillmentType,
      paymentMethod: paymentMethodLabel(order.paymentMethod || order.payment_method),
      deliveryAddress: order.address,
      status: order.status,
      updatedAt: (order.status_events || []).slice(-1)[0]?.created_at || order.createdAt,
      deliveryDate: String(order.status || "") === "Delivered" ? ((order.status_events || []).slice(-1)[0]?.created_at || order.createdAt) : "",
      orderCreatedAt: order.createdAt,
      statusEvents: order.status_events || []
    });
  }
  return {
    activeOrder: activeOrders[0] || orders[0] || null,
    productTracks
  };
}

async function supabasePasswordLogin(email, password){
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY){
    throw new Error("Missing Supabase frontend keys in .env");
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if(!res.ok){
    throw new Error(data?.msg || data?.error_description || data?.error || "Login failed");
  }
  return data;
}

async function supabaseAdminRequest(pathname, { method="GET", body } = {}){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY){
    throw new Error("Missing Supabase service role config in .env");
  }
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if(!res.ok){
    throw new Error(data?.msg || data?.message || data?.error_description || data?.error || `Supabase admin error ${res.status}`);
  }
  return data;
}

async function supabaseAdminCreateUser({ email, password, fullName }){
  return await supabaseAdminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName
      }
    }
  });
}

async function supabaseAdminDeleteUser(userId){
  if(!userId) return;
  await supabaseAdminRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE"
  });
}

async function supabaseAdminUpdateUserPassword(userId, password){
  if(!userId) throw httpError("Missing user id.", 400);
  await supabaseAdminRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: { password }
  });
}

async function supabaseAuthUser(accessToken){
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY){
    throw new Error("Missing Supabase frontend keys in .env");
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const data = await res.json();
  if(!res.ok){
    throw new Error(data?.msg || data?.error_description || data?.error || "Invalid token");
  }
  return data;
}

function getBearerToken(req){
  const header = req.headers.authorization || "";
  if(!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

async function getProfileByUserId(userId){
  const q = `/rest/v1/profiles?select=user_id,email,role,full_name,contact,address,is_active,created_at,updated_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
  const rows = await supabaseRequest(q, { serviceRole: true });
  return rows?.[0] || null;
}

async function upsertCustomerProfile({ userId, email, fullName, contact, address }){
  const existing = await getProfileByUserId(userId);
  const payload = {
    user_id: userId,
    email,
    role: "customer",
    full_name: fullName,
    contact,
    address
  };
  if(existing){
    const rows = await supabaseRequest(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      serviceRole: true,
      headers: { Prefer: "return=representation" },
      body: payload
    });
    return rows?.[0] || null;
  }
  const rows = await supabaseRequest("/rest/v1/profiles", {
    method: "POST",
    serviceRole: true,
    headers: { Prefer: "return=representation" },
    body: [payload]
  });
  return rows?.[0] || null;
}

function toStaffAccount(row){
  return {
    userId: row.user_id,
    email: row.email || "",
    fullName: row.full_name || "",
    contact: row.contact || "",
    role: row.role || "staff",
    isActive: row.is_active !== false,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

async function listStaffAccounts(){
  const rows = await supabaseRequest(
    "/rest/v1/profiles?select=user_id,email,role,full_name,contact,is_active,created_at,updated_at&role=eq.staff&order=created_at.desc",
    { serviceRole: true }
  );
  return (rows || []).map(toStaffAccount);
}

async function createStaffAccount(payload){
  const input = validateStaffAccountPayload(payload);
  const existing = await getProfileByEmail(input.email);
  if(existing){
    throw httpError("An account with this email already exists.", 409);
  }

  let created = null;
  try{
    created = await supabaseAdminCreateUser({
      email: input.email,
      password: input.password,
      fullName: input.fullName
    });
  }catch(err){
    if(/already|registered|exists|duplicate/i.test(String(err?.message || ""))){
      throw httpError("An account with this email already exists.", 409);
    }
    throw err;
  }

  const userId = created?.id || created?.user?.id || "";
  if(!userId){
    throw new Error("Supabase did not return the new staff user id.");
  }

  try{
    const rows = await supabaseRequest("/rest/v1/profiles", {
      method: "POST",
      serviceRole: true,
      headers: { Prefer: "return=representation" },
      body: [{
        user_id: userId,
        email: input.email,
        role: "staff",
        full_name: input.fullName,
        contact: input.contact,
        is_active: true
      }]
    });
    return toStaffAccount(rows?.[0] || {});
  }catch(err){
    await supabaseAdminDeleteUser(userId).catch((_cleanupErr) => {});
    throw err;
  }
}

async function updateStaffAccount(userId, payload){
  const id = String(userId || "").trim();
  if(!id) throw httpError("Missing staff user id.", 400);
  const fullName = String(payload.fullName || payload.full_name || payload.name || "").trim().replace(/\s+/g, " ");
  const contact = validatePhilippineContact(payload.contact);
  if(!fullName) throw httpError("Staff name is required.");
  const rows = await supabaseRequest(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(id)}&role=eq.staff`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=representation" },
    body: {
      full_name: fullName,
      contact,
      updated_at: new Date().toISOString()
    }
  });
  if(!rows?.[0]) throw httpError("Staff account not found.", 404);
  return toStaffAccount(rows[0]);
}

async function disableStaffAccount(userId){
  const id = String(userId || "").trim();
  if(!id) throw httpError("Missing staff user id.", 400);
  const rows = await supabaseRequest(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(id)}&role=eq.staff`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=representation" },
    body: {
      is_active: false,
      updated_at: new Date().toISOString()
    }
  });
  if(!rows?.[0]) throw httpError("Staff account not found.", 404);
  return toStaffAccount(rows[0]);
}

async function resetStaffPassword(userId, payload){
  const id = String(userId || "").trim();
  if(!id) throw httpError("Missing staff user id.", 400);
  const password = validatePasswordComplexity(payload.password || payload.newPassword || payload.new_password);
  const confirmPassword = String(payload.confirmPassword || payload.confirm_password || payload.password || "");
  if(password !== confirmPassword){
    throw httpError("Passwords do not match.");
  }
  const rows = await supabaseRequest(
    `/rest/v1/profiles?select=user_id,role&user_id=eq.${encodeURIComponent(id)}&role=eq.staff&limit=1`,
    { serviceRole: true }
  );
  if(!rows?.[0]) throw httpError("Staff account not found.", 404);
  await supabaseAdminUpdateUserPassword(id, password);
  return { ok: true };
}

async function registerCustomerAccount(payload){
  const { email, password, fullName, contact } = validateCustomerRegistration(payload);
  verifyRegistrationCode(email, payload?.verificationCode || payload?.verification_code);
  const deliveryAddress = await validateDeliveryAddress(payload);

  const existing = await getProfileByEmail(email);
  if(existing){
    throw httpError("An account with this email already exists.", 409);
  }

  let created = null;
  try{
    created = await supabaseAdminCreateUser({ email, password, fullName });
  }catch(err){
    if(/already|registered|exists|duplicate/i.test(String(err?.message || ""))){
      throw httpError("An account with this email already exists.", 409);
    }
    throw err;
  }
  const userId = created?.id || created?.user?.id || "";
  if(!userId){
    throw new Error("Supabase did not return the new user id.");
  }

  let profile = null;
  try{
    profile = await upsertCustomerProfile({ userId, email, fullName, contact, address: deliveryAddress.address });
  }catch(err){
    await supabaseAdminDeleteUser(userId).catch((_cleanupErr) => {});
    throw err;
  }

  const session = await supabasePasswordLogin(email, password);
  return {
    user: {
      email: profile?.email || email,
      role: profile?.role || "customer",
      full_name: profile?.full_name || fullName
    },
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in
    }
  };
}

async function changePasswordForProfile(profile, payload){
  const currentPassword = String(payload.currentPassword || payload.current_password || "");
  const newPassword = validatePasswordComplexity(payload.newPassword || payload.new_password);
  if(!currentPassword){
    throw httpError("Current password is required.");
  }
  if(currentPassword === newPassword){
    throw httpError("New password must be different from the current password.");
  }
  await supabasePasswordLogin(profile.email, currentPassword);
  await supabaseAdminUpdateUserPassword(profile.user_id, newPassword);
  return { ok: true };
}

async function requireAuth(req, allowedRoles = []){
  const token = getBearerToken(req);
  if(!token){
    const err = new Error("Missing bearer token");
    err.status = 401;
    throw err;
  }
  const authUser = await supabaseAuthUser(token);
  const profile = await getProfileByUserId(authUser.id);
  if(!profile){
    const err = new Error("Profile not found");
    err.status = 403;
    throw err;
  }
  assertProfileIsActive(profile);
  if(allowedRoles.length && !allowedRoles.includes(profile.role)){
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  return { authUser, profile, token };
}

function toCentavos(amount){
  return Math.round(Number(amount || 0) * 100);
}

function buildPaymongoOrderLineItems({ orderCode, total }){
  return [{
    currency: "PHP",
    amount: toCentavos(total),
    name: `Order ${orderCode}`,
    quantity: 1
  }];
}

function isQrphMethod(method){
  return normalizePaymentMethod(method) !== "cod";
}

function paymongoAuthHeader(){
  if(!PAYMONGO_SECRET_KEY || PAYMONGO_SECRET_KEY.includes("...")){
    throw new Error("PayMongo secret key is missing or placeholder.");
  }
  return "Basic " + Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64");
}

async function paymongoCreateCheckoutSession({ orderCode, lineItems, successUrl, cancelUrl }){
  const payload = {
    data: {
      attributes: {
        payment_method_types: ["qrph"],
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { order_code: orderCode }
      }
    }
  };
  const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: paymongoAuthHeader()
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if(!res.ok){
    throw new Error(data?.errors?.[0]?.detail || data?.error || "Failed to create PayMongo checkout session");
  }
  return data?.data || null;
}

async function paymongoRetrieveCheckoutSession(checkoutSessionId){
  if(!checkoutSessionId){
    throw new Error("Missing PayMongo checkout session id.");
  }
  const res = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(checkoutSessionId)}`, {
    method: "GET",
    headers: {
      Authorization: paymongoAuthHeader()
    }
  });
  const data = await res.json();
  if(!res.ok){
    throw new Error(data?.errors?.[0]?.detail || data?.error || "Failed to retrieve PayMongo checkout session");
  }
  return data?.data || null;
}

function parsePaymongoSignature(headerValue){
  const out = {};
  for(const part of String(headerValue || "").split(",")){
    const [k, v] = part.split("=");
    if(k && v) out[k.trim()] = v.trim();
  }
  return out;
}

function verifyPaymongoWebhookSignature(rawBody, headerValue){
  if(!PAYMONGO_WEBHOOK_SECRET || PAYMONGO_WEBHOOK_SECRET.includes("...")){
    const err = new Error("PayMongo webhook secret not configured.");
    err.status = 500;
    throw err;
  }
  const sig = parsePaymongoSignature(headerValue);
  const timestamp = sig.t || "";
  const candidates = [sig.te, sig.li].filter(Boolean);
  if(!timestamp || !candidates.length) return false;
  const signed = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", PAYMONGO_WEBHOOK_SECRET).update(signed).digest("hex");
  return candidates.some((c) => c === expected);
}

function parsePaymongoWebhookEvent(event){
  const eventId = event?.data?.id || event?.id || "";
  const eventType = event?.data?.attributes?.type || event?.type || "";
  const resource = event?.data?.attributes?.data || event?.data?.attributes?.resource || event?.resource || {};
  const resourceId = resource?.id || null;
  const resourceAttr = resource?.attributes || {};
  const checkoutSession =
    resourceAttr?.checkout_session ||
    resourceAttr?.checkout ||
    resourceAttr?.source?.checkout_session ||
    resourceAttr?.payment_intent?.attributes?.checkout_session ||
    {};
  const metadata =
    resourceAttr?.metadata ||
    checkoutSession?.metadata ||
    checkoutSession?.attributes?.metadata ||
    {};
  const checkoutSessionId =
    (eventType === "checkout_session.payment.paid" ? resourceId : null) ||
    checkoutSession?.id ||
    checkoutSession?.attributes?.id ||
    resourceAttr?.checkout_session_id ||
    resourceAttr?.checkoutSessionId ||
    null;
  const firstPayment =
    (Array.isArray(resourceAttr?.payments) && resourceAttr.payments[0]) ||
    (Array.isArray(resourceAttr?.payment_intent?.attributes?.payments) && resourceAttr.payment_intent.attributes.payments[0]) ||
    null;

  return {
    eventId,
    eventType,
    resourceId,
    orderCode: metadata?.order_code || null,
    checkoutSessionId,
    paymentId:
      firstPayment?.id ||
      firstPayment?.attributes?.id ||
      (eventType === "payment.paid" ? resourceId : null)
  };
}

async function listOrdersForEmail(email){
  const profile = await getProfileByEmail(email);
  if(!profile) return [];
  return listOrdersForUserId(profile.user_id);
}

async function listOrdersForUserId(userId){
  if(!userId) return [];

  const orders = await supabaseRequest(
    `/rest/v1/orders?select=id,order_code,user_id,customer_name,contact,address,fulfillment_type,subtotal,delivery_fee,discount_amount,total,status,payment_status,payment_method,created_at,paid_at,prepared_at,prepared_by,preparation_completed&user_id=eq.${userId}&order=created_at.desc`,
    { serviceRole: true }
  );
  const visibleOrders = orders.filter(order => !isStaleCustomerPendingOrder(order));
  if(!visibleOrders.length) return [];

  const orderIds = visibleOrders.map(o => o.id);
  const inFilter = encodeURIComponent(`(${escapeCsvValues(orderIds)})`);
  const [items, events] = await Promise.all([
    supabaseRequest(`/rest/v1/order_items?select=order_id,product_id,sku,name,image_url,unit_price,qty&order_id=in.${inFilter}&order=created_at.asc`, { serviceRole: true }),
    supabaseRequest(`/rest/v1/order_status_events?select=order_id,status,note,changed_by,created_at&order_id=in.${inFilter}&order=created_at.asc`, { serviceRole: true })
  ]);

  const preparationRows = await listPreparationRows(orderIds);

  return visibleOrders.map(order =>
    ({
      ...toUiOrder(
      order,
      items.filter(i => i.order_id === order.id),
      events.filter(e => e.order_id === order.id)
      ),
      paidAt: order.paid_at || "",
      preparation: buildPreparationSummary(
        toUiOrder(order, items.filter(i => i.order_id === order.id), events.filter(e => e.order_id === order.id)),
        preparationRows.filter((row) => row.order_id === order.id)
      )
    })
  );
}

async function getOrderForEmail(orderCode, email){
  const orders = await listOrdersForEmail(email);
  return orders.find(o => o.id === orderCode) || null;
}

async function getOrderForUserId(orderCode, userId){
  const orders = await listOrdersForUserId(userId);
  return orders.find(o => o.id === orderCode) || null;
}

async function getOrderByCodeDetailed(orderCode){
  const rows = await supabaseRequest(
    `/rest/v1/orders?select=id,order_code,user_id,customer_name,contact,address,fulfillment_type,subtotal,delivery_fee,discount_amount,total,status,payment_status,payment_method,created_at,paid_at,prepared_at,prepared_by,preparation_completed&order_code=eq.${encodeURIComponent(orderCode)}&limit=1`,
    { serviceRole: true }
  );
  const order = rows?.[0];
  if(!order) return null;
  const [items, events, preparationRows, profile] = await Promise.all([
    supabaseRequest(`/rest/v1/order_items?select=order_id,product_id,sku,name,image_url,unit_price,qty,line_total,created_at&order_id=eq.${order.id}&order=created_at.asc`, { serviceRole: true }),
    supabaseRequest(`/rest/v1/order_status_events?select=order_id,status,note,changed_by,created_at&order_id=eq.${order.id}&order=created_at.asc`, { serviceRole: true }),
    listPreparationRows([order.id]),
    getProfileByUserId(order.user_id).catch(() => null)
  ]);
  const uiOrder = toUiOrder(order, items || [], events || []);
  return {
    ...uiOrder,
    userId: order.user_id,
    createdAtRaw: order.created_at,
    paymentStatus: order.payment_status,
    paidAt: order.paid_at || "",
    preparation: buildPreparationSummary(uiOrder, preparationRows || []),
    profile
  };
}

async function getOrderInvoice(orderCode){
  const order = await getOrderByCodeDetailed(orderCode);
  if(!order) throw httpError("Order not found.", 404);
  return {
    company: {
      name: "Jazjo Beverages",
      address: "Jazjo Beverages, Philippines",
      contact: "09170000002"
    },
    invoiceNumber: buildInvoiceNumber(order.id),
    orderNumber: order.id,
    customer: order.customerName || "Customer",
    contact: order.contact || "",
    paymentMethod: paymentMethodLabel(order.paymentMethod),
    fulfillmentType: normalizeFulfillmentType(order.fulfillmentType) === "pickup" ? "Pickup" : "Delivery",
    orderStatus: statusLabel(order.status),
    paymentStatus: String(order.paymentStatus || "").trim() || "pending",
    createdAt: order.createdAt || "",
    subtotal: Number(order.subtotal || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    discount: Number(order.discountAmount || 0),
    grandTotal: Number(order.total || 0),
    items: (order.items || []).map((item) => ({
      product: item.name,
      quantity: Number(item.qty || 0),
      unitPrice: Number(item.price || 0),
      lineTotal: Number(item.qty || 0) * Number(item.price || 0)
    }))
  };
}

function uiStatusToDbStatus(status){
  const map = {
    "Pending Payment": "pending_payment",
    "Order Placed": "order_placed",
    "Preparing": "preparing",
    "In Transit": "in_transit",
    "Out for Delivery": "out_for_delivery",
    "Delivered": "delivered",
    "Cancelled": "cancelled",
    pending_payment: "pending_payment",
    order_placed: "order_placed",
    preparing: "preparing",
    in_transit: "in_transit",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    cancelled: "cancelled"
  };
  return map[String(status || "").trim()] || "";
}

async function createOrder(payload, authProfile){
  const customerName = String(payload.customerName || "").trim();
  const contact = validatePhilippineContact(payload.contact);
  const fulfillmentType = normalizeFulfillmentType(payload.fulfillmentType || payload.fulfillment_type);
  const isPickup = fulfillmentType === "pickup";
  const deliveryAddress = isPickup
    ? { address: String(payload.address || payload.fullAddress || "Pickup at Jazjo Beverages").trim() || "Pickup at Jazjo Beverages" }
    : await validateDeliveryAddress(payload);
  const address = deliveryAddress.address;
  const paymentMethod = normalizePaymentMethod(payload.paymentMethod || "bank_qr_ph");
  const rewardRedemptionId = String(payload.rewardRedemptionId || payload.reward_redemption_id || "").trim();
  const returnBaseUrl = normalizeReturnBaseUrl(payload.returnBaseUrl || payload.return_base_url || APP_BASE_URL);
  const items = Array.isArray(payload.items) ? payload.items : [];

  if(!authProfile?.user_id || !customerName || !contact || (!isPickup && !address) || !items.length){
    throw new Error("Missing required order fields.");
  }

  const skuQty = new Map();
  for(const item of items){
    const sku = String(item.productId || "").trim();
    const qty = Number(item.qty || 0);
    if(!sku || qty <= 0) throw new Error("Invalid order item.");
    skuQty.set(sku, (skuQty.get(sku) || 0) + qty);
  }

  const products = await getProductsBySkus([...skuQty.keys()]);
  if(products.length !== skuQty.size){
    throw new Error("Some products were not found in Supabase.");
  }

  const productBySku = new Map(products.map(p => [p.sku, p]));
  const itemRows = [];
  let subtotal = 0;
  for(const [sku, qty] of skuQty.entries()){
    const p = productBySku.get(sku);
    if(!p || !p.is_active) throw new Error(`${sku} is inactive.`);
    if(Number(p.stock_cases) < qty) throw new Error(`${p.name} has insufficient stock.`);
    const unitPrice = Number(p.price);
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;
    itemRows.push({
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      unit: p.unit,
      image_url: p.image_url,
      unit_price: unitPrice,
      qty,
      line_total: lineTotal
    });
  }

  const storeSettings = await getStoreSettings();
  const deliveryFee = isPickup ? 0 : calculateDeliveryFee(subtotal, storeSettings);
  const redemption = rewardRedemptionId
    ? await getReservedRedemptionForUser(rewardRedemptionId, authProfile.user_id)
    : null;
  if(rewardRedemptionId && !redemption){
    const err = new Error("Selected reward is invalid or already used.");
    err.status = 409;
    throw err;
  }
  const discountAmount = redemption
    ? computeRewardDiscount({
      rewardType: redemption.reward_type,
      subtotal,
      deliveryFee
    })
    : 0;
  const total = Math.max(0, Number((subtotal + deliveryFee - discountAmount).toFixed(2)));

  const useQrph = isQrphMethod(paymentMethod);
  const baseOrderInsertBody = {
    user_id: authProfile.user_id,
    customer_name: customerName,
    contact,
    address,
    fulfillment_type: fulfillmentType,
    subtotal,
    delivery_fee: deliveryFee,
    total,
    status: useQrph ? "pending_payment" : "order_placed",
    payment_status: useQrph ? "pending" : "pending",
    payment_provider: useQrph ? "paymongo" : null,
    payment_method: paymentMethod
  };
  if(Number(discountAmount || 0) > 0){
    baseOrderInsertBody.discount_amount = discountAmount;
  }
  let inserted = null;
  let lastInsertError = null;
  for(let attempt = 0; attempt < 5; attempt += 1){
    const orderCode = await makeNextOrderCode();
    try{
      inserted = await supabaseRequest("/rest/v1/orders", {
        method: "POST",
        serviceRole: true,
        headers: { Prefer: "return=representation" },
        body: [{ ...baseOrderInsertBody, order_code: orderCode }]
      });
      break;
    }catch(err){
      lastInsertError = err;
      if(!isOrderCodeUniqueViolation(err)) throw err;
    }
  }
  if(!inserted?.[0]){
    throw lastInsertError || new Error("Unable to create a unique order number.");
  }

  const order = inserted[0];

  await supabaseRequest("/rest/v1/order_items", {
    method: "POST",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: itemRows.map(row => ({ ...row, order_id: order.id }))
  });

  await supabaseRequest("/rest/v1/order_status_events", {
    method: "POST",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: [{
      order_id: order.id,
      status: useQrph ? "pending_payment" : "order_placed",
      note: useQrph ? "Order created. Awaiting QRPH payment." : "Order created from web checkout."
    }]
  });

  if(redemption){
    await supabaseRequest(`/rest/v1/reward_redemptions?id=eq.${encodeURIComponent(redemption.id)}`, {
      method: "PATCH",
      serviceRole: true,
      headers: { Prefer: "return=minimal" },
      body: {
        status: "used",
        order_id: order.id,
        used_at: new Date().toISOString()
      }
    });
    await supabaseRequest("/rest/v1/order_status_events", {
      method: "POST",
      serviceRole: true,
      headers: { Prefer: "return=minimal" },
      body: [{
        order_id: order.id,
        status: useQrph ? "pending_payment" : "order_placed",
        note: `Reward applied: ${toRewardLabel(redemption.reward_type)} (-PHP ${Number(discountAmount || 0).toFixed(2)}).`
      }]
    });
  }

  await supabaseRequest("/rest/v1/payments", {
    method: "POST",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: [{ order_id: order.id, provider: "paymongo", status: "pending", amount: total, currency: "PHP" }]
  });

  let checkoutUrl = null;
  if(useQrph){
    const checkout = await paymongoCreateCheckoutSession({
      orderCode: order.order_code,
      lineItems: buildPaymongoOrderLineItems({
        orderCode: order.order_code,
        total
      }),
      successUrl: `${returnBaseUrl}/customer-app/?paid=${encodeURIComponent(order.order_code)}#/orders`,
      cancelUrl: `${returnBaseUrl}/customer-app/?cancelled=${encodeURIComponent(order.order_code)}#/cart`
    });
    checkoutUrl = checkout?.attributes?.checkout_url || null;
    const checkoutSessionId = checkout?.id || null;
    if(checkoutSessionId){
      await supabaseRequest(`/rest/v1/orders?order_code=eq.${encodeURIComponent(order.order_code)}`, {
        method: "PATCH",
        serviceRole: true,
        headers: { Prefer: "return=minimal" },
        body: { paymongo_checkout_session_id: checkoutSessionId }
      });
      await supabaseRequest(`/rest/v1/payments?order_id=eq.${order.id}`, {
        method: "PATCH",
        serviceRole: true,
        headers: { Prefer: "return=minimal" },
        body: { provider_checkout_session_id: checkoutSessionId }
      });
    }
  }

  const uiOrder = await getOrderForUserId(order.order_code, authProfile.user_id);
  return { order: uiOrder, checkoutUrl };
}

function allowedStatusTransitions(currentStatus){
  const current = uiStatusToDbStatus(currentStatus);
  return {
    pending_payment: ["order_placed", "cancelled"],
    order_placed: ["preparing", "cancelled"],
    preparing: ["in_transit", "out_for_delivery", "delivered", "cancelled"],
    in_transit: ["out_for_delivery", "delivered", "cancelled"],
    out_for_delivery: ["delivered", "cancelled"],
    delivered: [],
    cancelled: []
  }[current] || [];
}

async function resetOrderPreparation(orderId){
  try{
    await supabaseRequest(`/rest/v1/order_preparation_items?order_id=eq.${orderId}`, {
      method: "DELETE",
      serviceRole: true
    });
  }catch(err){
    if(!isMissingRelationError(err, "order_preparation_items")) throw err;
  }
  await supabaseRequest(`/rest/v1/orders?id=eq.${orderId}`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: {
      prepared_at: null,
      prepared_by: null,
      preparation_completed: false
    }
  });
}

async function upsertPreparationItems(order, nextItems, actorProfile){
  try{
    await supabaseRequest(`/rest/v1/order_preparation_items?order_id=eq.${order.id}`, {
      method: "DELETE",
      serviceRole: true
    });
    if(!nextItems.length) return [];
    await supabaseRequest("/rest/v1/order_preparation_items", {
      method: "POST",
      serviceRole: true,
      headers: { Prefer: "return=minimal" },
      body: nextItems.map((item) => ({
        order_id: order.id,
        product_sku: item.productId,
        product_name: item.name,
        required_qty: Number(item.qty || 0),
        is_prepared: item.prepared === true,
        prepared_by: item.prepared === true ? actorProfile?.user_id || null : null,
        prepared_at: item.prepared === true ? new Date().toISOString() : null,
        validation_message: item.validationMessage || null
      }))
    });
  }catch(err){
    if(isMissingRelationError(err, "order_preparation_items")){
      throw httpError("Order preparation migration is required before using this workflow.", 500);
    }
    throw err;
  }
  return nextItems;
}

async function updateOrderPreparation(orderCode, payload, actorProfile){
  const order = await getOrderByCodeDetailed(orderCode);
  if(!order) throw httpError("Order not found.", 404);
  if(statusLabel(order.status) !== "Order Placed" && statusLabel(order.status) !== "Preparing"){
    throw httpError("Preparation is only available for placed or preparing orders.", 409);
  }
  const requestedItems = Array.isArray(payload.items) ? payload.items : [];
  let productRows = await getProductsBySkus((order.items || []).map((item) => item.productId).filter(Boolean));
  const existingIds = new Set(productRows.map(p => p.id));
  const missing = (order.items || []).filter((item) => !existingIds.has(item.dbProductId));
  for (const item of missing) {
    try {
      const encodedName = encodeURIComponent(String(item.name || "").trim());
      const rows = await supabaseRequest(
        `/rest/v1/products?select=id,sku,name,category_id,unit,price,stock_cases,quantity_per_case,image_url,is_active&name=ilike.${encodedName}&limit=1`,
        { serviceRole: true }
      );
      if (rows?.[0] && !existingIds.has(rows[0].id)) {
        productRows.push(rows[0]);
        existingIds.add(rows[0].id);
      }
    } catch {}
  }
  const productBySku = new Map(productRows.map((product) => [String(product.sku || ""), product]));
  const productById = new Map(productRows.map((product) => [String(product.id || ""), product]));
  const nextItems = (order.items || []).map((item) => {
    const incoming = requestedItems.find((entry) => String(entry.productId || "") === String(item.productId || "")) || {};
    const prepared = incoming.prepared === true;
    let validationMessage = "";
    if(prepared){
      const product = productBySku.get(String(item.productId || "")) || productById.get(String(item.dbProductId || ""));
      if(product){
        const currentStock = Number(product.stock_cases ?? product.stockCases ?? 0);
        if(currentStock < Number(item.qty || 0)){
          validationMessage = `${item.name} has only ${currentStock} case(s) remaining.`;
        }
      }
    }
    return {
      productId: item.productId,
      name: item.name,
      qty: Number(item.qty || 0),
      prepared: prepared && !validationMessage,
      validationMessage
    };
  });
  await upsertPreparationItems({ ...order, id: order.dbId || order.id }, nextItems, actorProfile);
  const summary = buildPreparationSummary(order, nextItems.map((item) => ({
    product_sku: item.productId,
    product_name: item.name,
    required_qty: item.qty,
    is_prepared: item.prepared,
    prepared_by: item.prepared ? actorProfile?.user_id || null : null,
    prepared_at: item.prepared ? new Date().toISOString() : null,
    validation_message: item.validationMessage || null
  })));
  await supabaseRequest(`/rest/v1/orders?order_code=eq.${encodeURIComponent(orderCode)}`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: { preparation_completed: summary.completed }
  });
  return await getOrderByCodeDetailed(orderCode);
}

async function prepareOrder(orderCode, actorProfile){
  const orderRows = await supabaseRequest(`/rest/v1/orders?select=id,order_code,status,payment_method,prepared_at,prepared_by,preparation_completed&order_code=eq.${encodeURIComponent(orderCode)}&limit=1`, {
    serviceRole: true
  });
  const rawOrder = orderRows?.[0];
  if(!rawOrder) throw httpError("Order not found.", 404);
  const order = await getOrderByCodeDetailed(orderCode);
  if(!order) throw httpError("Order not found.", 404);
  const summary = order.preparation || buildPreparationSummary(order, []);
  if(!summary.completed){
    throw httpError("Complete all preparation checkboxes before preparing this order.", 409);
  }
  if(!allowedStatusTransitions(rawOrder.status).includes("preparing") && rawOrder.status !== "preparing"){
    throw httpError("This order can no longer be prepared.", 409);
  }
  const stockDeducted = await hasOrderStatusEventNote(rawOrder.id, "Inventory deducted during preparation workflow.") || await hasOrderStatusEventNote(rawOrder.id, "QRPH payment confirmed via PayMongo webhook. Stock deducted.");
  if(!stockDeducted){
    await deductStockForOrder(rawOrder.id, {
      action: "prepare_order",
      updatedBy: actorProfile?.user_id,
      updatedByName: actorProfile?.full_name || actorProfile?.email || actorProfile?.role || "Staff",
      remarks: `Inventory deducted while preparing order ${orderCode}.`,
      note: "Inventory deducted during preparation workflow."
    });
  }
  await supabaseRequest(`/rest/v1/orders?id=eq.${rawOrder.id}`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: {
      status: "preparing",
      preparation_completed: true,
      prepared_at: new Date().toISOString(),
      prepared_by: actorProfile?.user_id || null
    }
  });
  await supabaseRequest("/rest/v1/order_status_events", {
    method: "POST",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: [{
      order_id: rawOrder.id,
      status: "preparing",
      note: `Order prepared by ${actorProfile?.full_name || actorProfile?.email || actorProfile?.role || "staff"}.`,
      changed_by: actorProfile?.user_id || null
    }]
  });
  return await getOrderByCodeDetailed(orderCode);
}

async function updateOrderStatus(orderCode, nextStatusInput, actorProfile){
  const nextStatus = uiStatusToDbStatus(nextStatusInput);
  if(!nextStatus){
    throw new Error("Invalid status.");
  }
  const rows = await supabaseRequest(`/rest/v1/orders?select=id,order_code,status,payment_status,payment_method,user_id,preparation_completed&order_code=eq.${encodeURIComponent(orderCode)}&limit=1`, {
    serviceRole: true
  });
  const order = rows?.[0];
  if(!order) throw new Error("Order not found.");
  const allowed = allowedStatusTransitions(order.status);
  if(nextStatus !== order.status && !allowed.includes(nextStatus)){
    throw httpError(`Cannot change status from ${toUiStatus(order.status)} to ${toUiStatus(nextStatus)}.`, 409);
  }
  if(["preparing", "in_transit", "out_for_delivery", "delivered"].includes(nextStatus) && order.preparation_completed !== true){
    throw httpError("Complete the preparation workflow before progressing this order.", 409);
  }

  const updatedRows = await supabaseRequest(`/rest/v1/orders?order_code=eq.${encodeURIComponent(orderCode)}`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=representation" },
    body: { status: nextStatus }
  });
  const updated = updatedRows?.[0];
  await supabaseRequest("/rest/v1/order_status_events", {
    method: "POST",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: [{
      order_id: order.id,
      status: nextStatus,
      note: `Status updated to ${toUiStatus(nextStatus)} by ${actorProfile.role}.`,
      changed_by: actorProfile.user_id
    }]
  });
  return updated;
}

async function updateOrderDetails(orderCode, payload, actorProfile){
  const rows = await supabaseRequest(
    `/rest/v1/orders?select=id,order_code,user_id,status,customer_name,contact,address,fulfillment_type,subtotal,delivery_fee,total,discount_amount,preparation_completed&order_code=eq.${encodeURIComponent(orderCode)}&limit=1`,
    { serviceRole: true }
  );
  const order = rows?.[0];
  if(!order) throw new Error("Order not found.");

  const body = {};
  const customerName = String(payload.customerName ?? payload.customer_name ?? "").trim();
  if(customerName) body.customer_name = customerName;
  if(payload.contact !== undefined){
    body.contact = validatePhilippineContact(payload.contact);
  }
  const address = String(payload.address || "").trim();
  if(address) body.address = address;
  const nextStatusInput = payload.status || "";
  const nextStatus = nextStatusInput ? uiStatusToDbStatus(nextStatusInput) : "";
  if(nextStatusInput && !nextStatus) throw new Error("Invalid status.");
  if(nextStatus){
    if(!allowedStatusTransitions(order.status).includes(nextStatus) && nextStatus !== order.status){
      throw httpError(`Cannot change status from ${toUiStatus(order.status)} to ${toUiStatus(nextStatus)}.`, 409);
    }
    if(["preparing", "in_transit", "out_for_delivery", "delivered"].includes(nextStatus) && order.preparation_completed !== true){
      throw httpError("Complete the preparation workflow before progressing this order.", 409);
    }
    body.status = nextStatus;
  }

  const items = Array.isArray(payload.items) ? payload.items : null;
  if(items){
    const currentItems = await supabaseRequest(
      `/rest/v1/order_items?select=id,sku,name,unit_price,qty,line_total&order_id=eq.${order.id}`,
      { serviceRole: true }
    );
    const currentBySku = new Map((currentItems || []).map((item) => [String(item.sku || ""), item]));
    let subtotal = 0;
    for(const item of items){
      const sku = String(item.productId || item.sku || "").trim();
      const current = currentBySku.get(sku);
      if(!current) throw new Error(`Order item ${sku || "unknown"} was not found.`);
      const qty = Number(item.qty || 0);
      if(!Number.isFinite(qty) || qty < 0) throw new Error("Order item quantity must be zero or higher.");
      if(qty === 0){
        await supabaseRequest(`/rest/v1/order_items?id=eq.${current.id}`, {
          method: "DELETE",
          serviceRole: true
        });
        continue;
      }
      const lineTotal = Number(current.unit_price || 0) * qty;
      subtotal += lineTotal;
      await supabaseRequest(`/rest/v1/order_items?id=eq.${current.id}`, {
        method: "PATCH",
        serviceRole: true,
        headers: { Prefer: "return=minimal" },
        body: { qty, line_total: lineTotal }
      });
    }
    const settings = await getStoreSettings();
    const deliveryFee = normalizeFulfillmentType(order.fulfillment_type) === "pickup" ? 0 : calculateDeliveryFee(subtotal, settings);
    const discountAmount = Number(order.discount_amount || 0);
    body.subtotal = subtotal;
    body.delivery_fee = deliveryFee;
    body.total = Math.max(0, Number((subtotal + deliveryFee - discountAmount).toFixed(2)));
    body.preparation_completed = false;
    body.prepared_at = null;
    body.prepared_by = null;
  }

  if(!Object.keys(body).length){
    throw new Error("No editable fields provided.");
  }

  const updatedRows = await supabaseRequest(`/rest/v1/orders?id=eq.${order.id}`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=representation" },
    body
  });

  await supabaseRequest("/rest/v1/order_status_events", {
    method: "POST",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: [{
      order_id: order.id,
      status: body.status || order.status,
      note: `Order details updated by ${actorProfile.role}.`,
      changed_by: actorProfile.user_id
    }]
  });

  if(items){
    await resetOrderPreparation(order.id);
  }

  return updatedRows?.[0] || order;
}

async function repayOrder(orderCode, authProfile, payload = {}){
  const rows = await supabaseRequest(
    `/rest/v1/orders?select=id,order_code,user_id,total,status,payment_status,payment_method&order_code=eq.${encodeURIComponent(orderCode)}&limit=1`,
    { serviceRole: true }
  );
  const order = rows?.[0];
  if(!order){
    const err = new Error("Order not found.");
    err.status = 404;
    throw err;
  }
  if(authProfile?.role === "customer" && order.user_id !== authProfile.user_id){
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  if(String(order.payment_status || "").toLowerCase() === "paid"){
    const err = new Error("This order is already paid.");
    err.status = 409;
    throw err;
  }
  if(toUiStatus(order.status) !== "Pending Payment" || !isQrphMethod(order.payment_method)){
    const err = new Error("Only pending QRPH orders can be paid again.");
    err.status = 409;
    throw err;
  }
  const total = Number(order.total || 0);
  if(!Number.isFinite(total) || total <= 0){
    throw new Error("Order total must be greater than zero.");
  }

  const returnBaseUrl = normalizeReturnBaseUrl(payload.returnBaseUrl || payload.return_base_url || APP_BASE_URL);
  const checkout = await paymongoCreateCheckoutSession({
    orderCode: order.order_code,
    lineItems: buildPaymongoOrderLineItems({
      orderCode: order.order_code,
      total
    }),
    successUrl: `${returnBaseUrl}/customer-app/?paid=${encodeURIComponent(order.order_code)}#/orders`,
    cancelUrl: `${returnBaseUrl}/customer-app/?cancelled=${encodeURIComponent(order.order_code)}#/orders`
  });
  const checkoutUrl = checkout?.attributes?.checkout_url || null;
  const checkoutSessionId = checkout?.id || null;
  if(!checkoutUrl || !checkoutSessionId){
    throw new Error("PayMongo did not return a checkout URL.");
  }

  await supabaseRequest(`/rest/v1/orders?id=eq.${order.id}`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: {
      payment_status: "pending",
      status: "pending_payment",
      paymongo_checkout_session_id: checkoutSessionId
    }
  });
  await supabaseRequest(`/rest/v1/payments?order_id=eq.${order.id}`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: {
      status: "pending",
      provider: "paymongo",
      amount: total,
      currency: "PHP",
      provider_checkout_session_id: checkoutSessionId
    }
  });
  await supabaseRequest("/rest/v1/order_status_events", {
    method: "POST",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: [{
      order_id: order.id,
      status: "pending_payment",
      note: "QRPH repayment checkout created."
    }]
  });

  return { ok: true, checkoutUrl, checkoutSessionId };
}

async function deleteOrderByCode(orderCode){
  const rows = await supabaseRequest(`/rest/v1/orders?select=id,order_code&order_code=eq.${encodeURIComponent(orderCode)}&limit=1`, {
    serviceRole: true
  });
  const order = rows?.[0];
  if(!order){
    return { deleted: false, reason: "not_found" };
  }

  await supabaseRequest(`/rest/v1/reward_redemptions?order_id=eq.${order.id}`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: { order_id: null }
  }).catch((err) => {
    if(!isMissingRelationError(err, "reward_redemptions")) throw err;
  });
  await supabaseRequest(`/rest/v1/payments?order_id=eq.${order.id}`, {
    method: "DELETE",
    serviceRole: true
  });
  await supabaseRequest(`/rest/v1/order_status_events?order_id=eq.${order.id}`, {
    method: "DELETE",
    serviceRole: true
  });
  await supabaseRequest(`/rest/v1/order_items?order_id=eq.${order.id}`, {
    method: "DELETE",
    serviceRole: true
  });
  await supabaseRequest(`/rest/v1/orders?id=eq.${order.id}`, {
    method: "DELETE",
    serviceRole: true
  });
  return { deleted: true };
}

async function deleteOrdersByStatus(status){
  const dbStatus = uiStatusToDbStatus(status);
  if(!dbStatus || String(status || "") === "All"){
    throw httpError("Choose a specific order status before bulk deleting.", 400);
  }
  const rows = await supabaseRequest(`/rest/v1/orders?select=id,order_code,status&status=eq.${encodeURIComponent(dbStatus)}&order=created_at.desc`, {
    serviceRole: true
  });
  const results = [];
  for(const order of rows || []){
    const result = await deleteOrderByCode(order.order_code);
    results.push({ orderCode: order.order_code, ...result });
  }
  return {
    status: toUiStatus(dbStatus),
    matched: rows.length,
    deleted: results.filter((entry) => entry.deleted).length,
    results
  };
}

async function findOrderByCode(orderCode){
  const rows = await supabaseRequest(`/rest/v1/orders?select=id,order_code,user_id,status,payment_status,paymongo_checkout_session_id&order_code=eq.${encodeURIComponent(orderCode)}&limit=1`, {
    serviceRole: true
  });
  return rows?.[0] || null;
}

async function findOrderByCheckoutSessionId(checkoutSessionId){
  if(!checkoutSessionId) return null;
  const rows = await supabaseRequest(`/rest/v1/orders?select=id,order_code,user_id,status,payment_status,paymongo_checkout_session_id&paymongo_checkout_session_id=eq.${encodeURIComponent(checkoutSessionId)}&limit=1`, {
    serviceRole: true
  });
  return rows?.[0] || null;
}

async function hasOrderStatusEventNote(orderId, note){
  const rows = await supabaseRequest(
    `/rest/v1/order_status_events?select=id&order_id=eq.${orderId}&note=eq.${encodeURIComponent(note)}&limit=1`,
    { serviceRole: true }
  );
  return Boolean(rows?.length);
}

async function deductStockForOrder(orderId, context = {}){
  const items = await supabaseRequest(
    `/rest/v1/order_items?select=product_id,qty,name&order_id=eq.${orderId}`,
    { serviceRole: true }
  );
  const validItems = (items || []).filter(i => i.product_id && Number(i.qty || 0) > 0);
  for(const item of validItems){
    const productRows = await supabaseRequest(
      `/rest/v1/products?select=id,name,stock_cases&id=eq.${item.product_id}&limit=1`,
      { serviceRole: true }
    );
    const product = productRows?.[0];
    if(!product) continue;
    const current = Number(product.stock_cases || 0);
    const next = Math.max(0, current - Number(item.qty || 0));
    await supabaseRequest(`/rest/v1/products?id=eq.${product.id}`, {
      method: "PATCH",
      serviceRole: true,
      headers: { Prefer: "return=minimal" },
        body: { stock_cases: next }
    });
    await createInventoryHistoryEntry({
      productId: product.id,
      productName: product.name || item.name || "",
      orderId,
      beforeStock: current,
      afterStock: next,
      stockAdded: 0,
      stockDeducted: Number(item.qty || 0),
      action: context.action || "order_deduction",
      remarks: context.remarks || `Inventory deducted for order ${orderId}.`,
      updatedBy: context.updatedBy || null,
      updatedByName: context.updatedByName || null
    });
  }
  if(context.note){
    const exists = await hasOrderStatusEventNote(orderId, context.note);
    if(!exists){
      await supabaseRequest("/rest/v1/order_status_events", {
        method: "POST",
        serviceRole: true,
        headers: { Prefer: "return=minimal" },
        body: [{
          order_id: orderId,
          status: "preparing",
          note: context.note,
          changed_by: context.updatedBy || null
        }]
      });
    }
  }
}

async function markOrderPaidFromWebhook({ orderCode, checkoutSessionId, paymentId, eventId, rawPayload }){
  const STOCK_MARKER_NOTE = "QRPH payment confirmed via PayMongo webhook. Stock deducted.";
  const existingEvent = await supabaseRequest(`/rest/v1/payments?select=id&provider_event_id=eq.${encodeURIComponent(eventId)}&limit=1`, {
    serviceRole: true
  });
  if(existingEvent?.length){
    return { duplicate: true };
  }

  const order = (orderCode ? await findOrderByCode(orderCode) : null) || await findOrderByCheckoutSessionId(checkoutSessionId);
  if(!order) throw new Error("Order not found for webhook.");

  await supabaseRequest(`/rest/v1/orders?id=eq.${order.id}`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: {
      payment_status: "paid",
      status: "order_placed",
      paid_at: new Date().toISOString(),
      paymongo_checkout_session_id: checkoutSessionId || order.paymongo_checkout_session_id || null,
      paymongo_payment_id: paymentId || null
    }
  });

  const stockAlreadyDeducted = await hasOrderStatusEventNote(order.id, STOCK_MARKER_NOTE);
  if(!stockAlreadyDeducted){
    await deductStockForOrder(order.id, {
      action: "payment_confirmed",
      remarks: `Inventory deducted after QRPH payment confirmation for ${order.order_code}.`,
      note: STOCK_MARKER_NOTE
    });
    console.log("[paymongo webhook] stock deducted for order", order.order_code);
  }

  await supabaseRequest(`/rest/v1/payments?order_id=eq.${order.id}`, {
    method: "PATCH",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: {
      status: "paid",
      provider_event_id: eventId,
      provider_checkout_session_id: checkoutSessionId || order.paymongo_checkout_session_id || null,
      provider_payment_id: paymentId || null,
      raw_payload: rawPayload
    }
  });

  await supabaseRequest("/rest/v1/order_status_events", {
    method: "POST",
    serviceRole: true,
    headers: { Prefer: "return=minimal" },
    body: [{
      order_id: order.id,
      status: "order_placed",
      note: "QRPH payment confirmed via PayMongo webhook."
    }]
  });

  return { duplicate: false };
}

function paymongoCheckoutLooksPaid(checkout){
  const attrs = checkout?.attributes || {};
  const checkoutPayments = Array.isArray(attrs.payments) ? attrs.payments : [];
  const intentPayments = Array.isArray(attrs.payment_intent?.attributes?.payments)
    ? attrs.payment_intent.attributes.payments
    : [];
  const payments = [...checkoutPayments, ...intentPayments];
  const paidStatuses = new Set(["paid", "succeeded"]);
  const paidPayment = payments.find(p => paidStatuses.has(String(p?.attributes?.status || p?.status || "").toLowerCase()));
  const intentStatus = String(attrs.payment_intent?.attributes?.status || "").toLowerCase();
  const checkoutStatus = String(attrs.status || "").toLowerCase();
  return {
    paid: Boolean(paidPayment) || paidStatuses.has(intentStatus) || paidStatuses.has(checkoutStatus),
    paymentId: paidPayment?.id || null,
    intentStatus,
    checkoutStatus
  };
}

function isPaymongoProcessingStatusError(err){
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("source") && msg.includes("processing status");
}

async function reconcilePaymongoPayment(orderCode, authProfile){
  const order = await findOrderByCode(orderCode);
  if(!order) throw new Error("Order not found.");
  if(authProfile?.role === "customer" && order.user_id !== authProfile.user_id){
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  if(String(order.payment_status || "").toLowerCase() === "paid"){
    return {
      reconciled: true,
      alreadyPaid: true,
      order: await getOrderForUserId(order.order_code, order.user_id)
    };
  }
  if(!order.paymongo_checkout_session_id){
    return {
      reconciled: false,
      alreadyPaid: false,
      reason: "missing_checkout_session",
      order: await getOrderForUserId(order.order_code, order.user_id)
    };
  }

  let checkout;
  try{
    checkout = await paymongoRetrieveCheckoutSession(order.paymongo_checkout_session_id);
  }catch(err){
    if(isPaymongoProcessingStatusError(err)){
      return {
        reconciled: false,
        alreadyPaid: false,
        reason: "processing",
        order: await getOrderForUserId(order.order_code, order.user_id)
      };
    }
    throw err;
  }
  const state = paymongoCheckoutLooksPaid(checkout);
  if(!state.paid){
    return {
      reconciled: false,
      alreadyPaid: false,
      reason: state.checkoutStatus || state.intentStatus || "still_pending",
      order: await getOrderForUserId(order.order_code, order.user_id)
    };
  }

  await markOrderPaidFromWebhook({
    orderCode: order.order_code,
    checkoutSessionId: order.paymongo_checkout_session_id,
    paymentId: state.paymentId,
    eventId: `reconcile:${order.paymongo_checkout_session_id}:${state.paymentId || "paid"}`,
    rawPayload: {
      source: "paymongo_checkout_reconcile",
      checkout
    }
  });

  return {
    reconciled: true,
    alreadyPaid: false,
    order: await getOrderForUserId(order.order_code, order.user_id)
  };
}

async function handleApi(req, res, url){
  if(req.method === "GET" && url.pathname === "/api/health"){
    sendJson(res, 200, { ok: true });
    return true;
  }

  if(req.method === "GET" && url.pathname === "/api/config"){
    const storeSettings = await getStoreSettings();
    assertProfileIsActive(profile);
    sendJson(res, 200, {
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      storeSettings
    });
    return true;
  }

  if(req.method === "GET" && url.pathname === "/api/store-settings"){
    sendJson(res, 200, { storeSettings: await getStoreSettings() });
    return true;
  }

  if(req.method === "POST" && url.pathname === "/api/paymongo/webhook"){
    const rawBody = await readBody(req);
    const signature = req.headers["paymongo-signature"] || req.headers["Paymongo-Signature"];
    if(!verifyPaymongoWebhookSignature(rawBody, signature)){
      console.warn("[paymongo webhook] invalid signature");
      sendJson(res, 401, { error: "Invalid PayMongo signature" });
      return true;
    }
    const event = rawBody ? JSON.parse(rawBody) : {};
    const {
      eventId,
      eventType,
      resourceId,
      orderCode,
      checkoutSessionId,
      paymentId
    } = parsePaymongoWebhookEvent(event);

    console.log("[paymongo webhook] event", {
      eventId,
      eventType,
      resourceId,
      checkoutSessionId,
      orderCode,
      paymentId
    });

    if(eventType === "checkout_session.payment.paid" || eventType === "payment.paid"){
      await markOrderPaidFromWebhook({
        orderCode,
        checkoutSessionId,
        paymentId,
        eventId,
        rawPayload: event
      });
      console.log("[paymongo webhook] order marked paid");
    } else {
      console.log("[paymongo webhook] ignored event type", eventType);
    }

    sendJson(res, 200, { received: true });
    return true;
  }

  if(req.method === "POST" && url.pathname === "/api/auth/login"){
    const payload = await readJson(req);
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    if(!email || !password){
      sendJson(res, 400, { error: "email and password are required" });
      return true;
    }
    const session = await supabasePasswordLogin(email, password);
    if(session?.user && !session.user.email_confirmed_at && !session.user.confirmed_at){
      sendJson(res, 403, { error: "Please verify your email address before logging in." });
      return true;
    }
    const profile = await getProfileFullByEmail(email);
    if(!profile){
      sendJson(res, 403, { error: "Profile not found for this user." });
      return true;
    }
    sendJson(res, 200, {
      user: {
        email: profile.email,
        role: profile.role,
    full_name: profile.full_name || "",
    contact: profile.contact || "",
    address: profile.address || ""
      },
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in
      }
    });
    return true;
  }

  if(req.method === "GET" && url.pathname === "/api/auth/check-email"){
    const email = validateGmailEmail(url.searchParams.get("email") || "");
    const existing = await getProfileByEmail(email);
    sendJson(res, 200, { email, exists: Boolean(existing) });
    return true;
  }

  if(req.method === "POST" && url.pathname === "/api/auth/register/verification-code"){
    const payload = await readJson(req);
    const result = await createRegistrationVerificationCode(payload);
    sendJson(res, 200, result);
    return true;
  }

  if(req.method === "POST" && url.pathname === "/api/auth/register/verify-code"){
    const payload = await readJson(req);
    verifyRegistrationCode(payload?.email, payload?.verificationCode || payload?.verification_code, { consume: false });
    sendJson(res, 200, { ok: true, message: "Verification code confirmed." });
    return true;
  }

  if(req.method === "POST" && url.pathname === "/api/auth/register"){
    const payload = await readJson(req);
    const result = await registerCustomerAccount(payload);
    sendJson(res, 201, result);
    return true;
  }

  if(req.method === "GET" && url.pathname === "/api/profile"){
    const { profile } = await requireAuth(req);
    sendJson(res, 200, { profile });
    return true;
  }

  if((req.method === "PUT" || req.method === "PATCH") && url.pathname === "/api/profile"){
    const auth = await requireAuth(req);
    const payload = await readJson(req);
    const contact = validatePhilippineContact(payload.contact || auth.profile.contact || "");
    const deliveryAddress = await validateDeliveryAddress(payload);
    const profile = await updateProfileByEmail(auth.profile.email, {
      full_name: String(payload.fullName || payload.full_name || "").trim(),
      contact,
      address: deliveryAddress.address
    });
    sendJson(res, 200, { profile });
    return true;
  }

  if(req.method === "POST" && url.pathname === "/api/auth/change-password"){
    const auth = await requireAuth(req);
    const payload = await readJson(req);
    const result = await changePasswordForProfile(auth.profile, payload);
    sendJson(res, 200, result);
    return true;
  }

  if(req.method === "GET" && url.pathname === "/api/rewards"){
    const auth = await requireAuth(req);
    const rewards = await getRewardSummaryForUserId(auth.profile.user_id, auth.profile.email || "");
    sendJson(res, 200, { rewards });
    return true;
  }
  if(req.method === "POST" && url.pathname === "/api/rewards/redeem"){
    const auth = await requireAuth(req, ["customer", "admin", "staff"]);
    const payload = await readJson(req);
    const result = await createRewardRedemption({
      userId: auth.profile.user_id,
      email: auth.profile.email || "",
      rewardType: payload.rewardType,
      actorUserId: auth.profile.user_id
    });
    sendJson(res, 201, result);
    return true;
  }

  if(req.method === "GET" && url.pathname === "/api/products"){
    const products = await listProducts();
    sendJson(res, 200, { products });
    return true;
  }

  if(req.method === "GET" && url.pathname === "/api/locations/provinces"){
    const provinces = await listPsgcProvinces();
    sendJson(res, 200, { provinces });
    return true;
  }

  if(req.method === "GET" && url.pathname.startsWith("/api/locations/provinces/") && url.pathname.endsWith("/cities")){
    const provinceCode = decodeURIComponent(url.pathname.replace("/api/locations/provinces/", "").replace(/\/cities$/, ""));
    const cities = await listPsgcProvinceCities(provinceCode);
    sendJson(res, 200, { cities });
    return true;
  }

  if(req.method === "GET" && url.pathname === "/api/orders"){
    const auth = await requireAuth(req);
    const orders = await listOrdersForUserId(auth.profile.user_id);
    sendJson(res, 200, { orders });
    return true;
  }

  if(req.method === "GET" && url.pathname.startsWith("/api/orders/") && url.pathname.endsWith("/invoice")){
    const auth = await requireAuth(req, ["customer", "admin", "staff"]);
    const orderCode = decodeURIComponent(url.pathname.replace("/api/orders/", "").replace(/\/invoice$/, ""));
    const invoice = await getOrderInvoice(orderCode);
    if(auth.profile.role === "customer"){
      const order = await getOrderForUserId(orderCode, auth.profile.user_id);
      if(!order){
        sendJson(res, 404, { error: "Order not found" });
        return true;
      }
    }
    sendJson(res, 200, { invoice });
    return true;
  }

  if(req.method === "GET" && url.pathname.startsWith("/api/orders/")){
    const auth = await requireAuth(req);
    const orderCode = decodeURIComponent(url.pathname.replace("/api/orders/", ""));
    const order = await getOrderForUserId(orderCode, auth.profile.user_id);
    if(!order){
      sendJson(res, 404, { error: "Order not found" });
      return true;
    }
    sendJson(res, 200, { order });
    return true;
  }

  if(req.method === "POST" && url.pathname.startsWith("/api/orders/") && url.pathname.endsWith("/reconcile-payment")){
    const auth = await requireAuth(req, ["customer", "admin", "staff"]);
    const orderCode = decodeURIComponent(url.pathname.replace("/api/orders/", "").replace(/\/reconcile-payment$/, ""));
    const result = await reconcilePaymongoPayment(orderCode, auth.profile);
    sendJson(res, 200, result);
    return true;
  }

  if(req.method === "POST" && url.pathname.startsWith("/api/orders/") && url.pathname.endsWith("/repay")){
    const auth = await requireAuth(req, ["customer", "admin", "staff"]);
    const orderCode = decodeURIComponent(url.pathname.replace("/api/orders/", "").replace(/\/repay$/, ""));
    const payload = await readJson(req);
    const result = await repayOrder(orderCode, auth.profile, payload);
    sendJson(res, 200, result);
    return true;
  }

  if(req.method === "POST" && url.pathname === "/api/orders"){
    const auth = await requireAuth(req, ["customer", "admin", "staff"]);
    const payload = await readJson(req);
    const result = await createOrder(payload, auth.profile);
    sendJson(res, 201, result);
    return true;
  }

  if(req.method === "PATCH" && url.pathname.startsWith("/api/orders/") && url.pathname.endsWith("/details")){
    const auth = await requireAuth(req, ["admin", "staff"]);
    const orderCode = decodeURIComponent(url.pathname.replace("/api/orders/", "").replace(/\/details$/, ""));
    const payload = await readJson(req);
    await updateOrderDetails(orderCode, payload, auth.profile);
    const refreshed = await getOrderByCodeDetailed(orderCode);
    sendJson(res, 200, { ok: true, order: refreshed });
    return true;
  }

  if(req.method === "PATCH" && url.pathname.startsWith("/api/orders/") && url.pathname.endsWith("/preparation")){
    const auth = await requireAuth(req, ["admin", "staff"]);
    const orderCode = decodeURIComponent(url.pathname.replace("/api/orders/", "").replace(/\/preparation$/, ""));
    const payload = await readJson(req);
    const order = await updateOrderPreparation(orderCode, payload, auth.profile);
    sendJson(res, 200, { ok: true, order });
    return true;
  }

  if(req.method === "POST" && url.pathname.startsWith("/api/orders/") && url.pathname.endsWith("/prepare")){
    const auth = await requireAuth(req, ["admin", "staff"]);
    const orderCode = decodeURIComponent(url.pathname.replace("/api/orders/", "").replace(/\/prepare$/, ""));
    const order = await prepareOrder(orderCode, auth.profile);
    sendJson(res, 200, { ok: true, order });
    return true;
  }

  if(req.method === "PATCH" && url.pathname.startsWith("/api/orders/") && url.pathname.endsWith("/status")){
    const auth = await requireAuth(req, ["admin", "staff"]);
    const orderCode = decodeURIComponent(url.pathname.replace("/api/orders/", "").replace(/\/status$/, ""));
    const payload = await readJson(req);
    await updateOrderStatus(orderCode, payload.status, auth.profile);
    const refreshed = await getOrderByCodeDetailed(orderCode);
    sendJson(res, 200, { ok: true, order: refreshed });
    return true;
  }

  if(req.method === "GET" && url.pathname === "/api/panel/admin/dashboard"){
    await requireAuth(req, ["admin"]);
    sendJson(res, 200, await getPanelDashboard());
    return true;
  }
  if(req.method === "GET" && url.pathname === "/api/panel/admin/orders"){
    await requireAuth(req, ["admin"]);
    const result = await listAdminOrdersDetailedPage({
      page: url.searchParams.get("page"),
      perPage: url.searchParams.get("perPage"),
      status: url.searchParams.get("status") || "All",
      search: url.searchParams.get("search") || ""
    });
    sendJson(res, 200, result);
    return true;
  }
  if(req.method === "DELETE" && url.pathname === "/api/panel/admin/orders/bulk-delete"){
    await requireAuth(req, ["admin"]);
    const payload = await readJson(req);
    const result = await deleteOrdersByStatus(payload.status);
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }
  if(req.method === "DELETE" && url.pathname.startsWith("/api/panel/admin/orders/")){
    await requireAuth(req, ["admin"]);
    const orderCode = decodeURIComponent(url.pathname.replace("/api/panel/admin/orders/", ""));
    const result = await deleteOrderByCode(orderCode);
    if(!result.deleted){
      throw httpError(`Order ${orderCode} was not found.`, 404);
    }
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }
  if(req.method === "GET" && url.pathname === "/api/panel/admin/inventory"){
    await requireAuth(req, ["admin"]);
    sendJson(res, 200, await getPanelInventory());
    return true;
  }
  if(req.method === "POST" && url.pathname === "/api/panel/admin/inventory/product-image"){
    await requireAuth(req, ["admin"]);
    const payload = await readJson(req, { limit: 7_500_000 });
    const uploaded = await uploadProductImage(payload);
    sendJson(res, 201, { ok: true, ...uploaded });
    return true;
  }
  if(req.method === "POST" && url.pathname === "/api/panel/admin/inventory/products"){
    const auth = await requireAuth(req, ["admin"]);
    const payload = await readJson(req);
    const product = await createInventoryProduct(payload, auth.profile);
    sendJson(res, 201, { ok: true, product });
    return true;
  }
  if(req.method === "PATCH" && url.pathname.startsWith("/api/panel/admin/inventory/products/by-name/")){
    const auth = await requireAuth(req, ["admin"]);
    const name = decodeURIComponent(url.pathname.replace("/api/panel/admin/inventory/products/by-name/", ""));
    const payload = await readJson(req);
    const product = await updateInventoryProductByName(name, payload, auth.profile);
    sendJson(res, 200, { ok: true, product });
    return true;
  }
  if(req.method === "DELETE" && url.pathname.startsWith("/api/panel/admin/inventory/products/by-name/")){
    await requireAuth(req, ["admin"]);
    const name = decodeURIComponent(url.pathname.replace("/api/panel/admin/inventory/products/by-name/", ""));
    await deleteInventoryProductByName(name);
    sendJson(res, 200, { ok: true });
    return true;
  }
  if(req.method === "POST" && url.pathname === "/api/panel/admin/inventory/restock"){
    const auth = await requireAuth(req, ["admin"]);
    const payload = await readJson(req);
    const product = await restockInventoryProductByName(payload, auth.profile);
    sendJson(res, 200, { ok: true, product });
    return true;
  }
  if(req.method === "GET" && url.pathname === "/api/panel/admin/categories"){
    await requireAuth(req, ["admin"]);
    sendJson(res, 200, { categories: await listAdminCategories() });
    return true;
  }
  if(req.method === "POST" && url.pathname === "/api/panel/admin/categories"){
    await requireAuth(req, ["admin"]);
    const payload = await readJson(req);
    const categories = await addAdminCategory(payload.name);
    sendJson(res, 201, { ok: true, categories });
    return true;
  }
  if(req.method === "DELETE" && url.pathname.startsWith("/api/panel/admin/categories/")){
    await requireAuth(req, ["admin"]);
    const name = decodeURIComponent(url.pathname.replace("/api/panel/admin/categories/", ""));
    const categories = await deleteAdminCategory(name);
    sendJson(res, 200, { ok: true, categories });
    return true;
  }
  if(req.method === "GET" && url.pathname === "/api/panel/admin/customers"){
    await requireAuth(req, ["admin"]);
    sendJson(res, 200, { customers: await getPanelCustomers() });
    return true;
  }
  if(req.method === "GET" && url.pathname === "/api/panel/admin/staff"){
    await requireAuth(req, ["admin"]);
    sendJson(res, 200, { staff: await listStaffAccounts() });
    return true;
  }
  if(req.method === "POST" && url.pathname === "/api/panel/admin/staff"){
    await requireAuth(req, ["admin"]);
    const payload = await readJson(req);
    const staff = await createStaffAccount(payload);
    sendJson(res, 201, { ok: true, staff });
    return true;
  }
  if(req.method === "PATCH" && url.pathname.startsWith("/api/panel/admin/staff/")){
    await requireAuth(req, ["admin"]);
    const userId = decodeURIComponent(url.pathname.replace("/api/panel/admin/staff/", ""));
    const payload = await readJson(req);
    const staff = await updateStaffAccount(userId, payload);
    sendJson(res, 200, { ok: true, staff });
    return true;
  }
  if(req.method === "POST" && url.pathname.startsWith("/api/panel/admin/staff/") && url.pathname.endsWith("/reset-password")){
    await requireAuth(req, ["admin"]);
    const userId = decodeURIComponent(url.pathname.replace("/api/panel/admin/staff/", "").replace(/\/reset-password$/, ""));
    const result = await resetStaffPassword(userId, await readJson(req));
    sendJson(res, 200, result);
    return true;
  }
  if(req.method === "POST" && url.pathname.startsWith("/api/panel/admin/staff/") && url.pathname.endsWith("/disable")){
    await requireAuth(req, ["admin"]);
    const userId = decodeURIComponent(url.pathname.replace("/api/panel/admin/staff/", "").replace(/\/disable$/, ""));
    const staff = await disableStaffAccount(userId);
    sendJson(res, 200, { ok: true, staff });
    return true;
  }
  if(req.method === "GET" && url.pathname === "/api/panel/admin/reports"){
    await requireAuth(req, ["admin"]);
    sendJson(res, 200, { reports: await getPanelReports() });
    return true;
  }
  if(req.method === "GET" && url.pathname.startsWith("/api/panel/admin/reports/")){
    await requireAuth(req, ["admin"]);
    const reportKey = decodeURIComponent(url.pathname.replace("/api/panel/admin/reports/", ""));
    const detail = await getPanelReportDetail(reportKey, {
      range: url.searchParams.get("range") || "all",
      from: url.searchParams.get("from") || "",
      to: url.searchParams.get("to") || ""
    });
    sendJson(res, 200, detail);
    return true;
  }
  if(req.method === "GET" && url.pathname === "/api/panel/admin/rewards"){
    await requireAuth(req, ["admin"]);
    sendJson(res, 200, { rewards: await getPanelRewards() });
    return true;
  }
  if(req.method === "GET" && url.pathname === "/api/panel/staff/rewards"){
    await requireAuth(req, ["staff", "admin"]);
    sendJson(res, 200, { rewards: await getPanelRewards() });
    return true;
  }
  if(req.method === "POST" && url.pathname === "/api/panel/admin/rewards/redeem"){
    const auth = await requireAuth(req, ["admin"]);
    const payload = await readJson(req);
    const result = await redeemRewardByAdmin({ ...payload, actorUserId: auth.profile.user_id });
    sendJson(res, 200, result);
    return true;
  }
  if(req.method === "POST" && url.pathname === "/api/panel/staff/rewards/redeem"){
    const auth = await requireAuth(req, ["staff", "admin"]);
    const payload = await readJson(req);
    const result = await redeemRewardByAdmin({ ...payload, actorUserId: auth.profile.user_id });
    sendJson(res, 200, result);
    return true;
  }
  if(req.method === "GET" && url.pathname === "/api/panel/admin/sales"){
    await requireAuth(req, ["admin"]);
    sendJson(res, 200, await getPanelSales());
    return true;
  }
  if(req.method === "GET" && (url.pathname === "/api/panel/admin/delivery" || url.pathname === "/api/panel/staff/delivery")){
    if(url.pathname.includes("/admin/")) await requireAuth(req, ["admin"]);
    else await requireAuth(req, ["staff", "admin"]);
    sendJson(res, 200, await getPanelDelivery());
    return true;
  }
  if(req.method === "GET" && url.pathname === "/api/panel/staff/orders"){
    await requireAuth(req, ["staff", "admin"]);
    const orders = await listAllOrdersDetailed();
    sendJson(res, 200, { orders });
    return true;
  }
  if(req.method === "GET" && url.pathname === "/api/panel/staff/inventory"){
    await requireAuth(req, ["staff", "admin"]);
    sendJson(res, 200, await getPanelInventory());
    return true;
  }
  if(req.method === "GET" && url.pathname === "/api/panel/staff/categories"){
    await requireAuth(req, ["staff", "admin"]);
    sendJson(res, 200, { categories: await listAdminCategories() });
    return true;
  }
  if(req.method === "POST" && url.pathname === "/api/panel/staff/categories"){
    await requireAuth(req, ["staff", "admin"]);
    const payload = await readJson(req);
    const categories = await addAdminCategory(payload.name);
    sendJson(res, 201, { ok: true, categories });
    return true;
  }
  if(req.method === "DELETE" && url.pathname.startsWith("/api/panel/staff/categories/")){
    await requireAuth(req, ["staff", "admin"]);
    const name = decodeURIComponent(url.pathname.replace("/api/panel/staff/categories/", ""));
    const categories = await deleteAdminCategory(name);
    sendJson(res, 200, { ok: true, categories });
    return true;
  }
  if(req.method === "POST" && url.pathname === "/api/panel/staff/inventory/product-image"){
    await requireAuth(req, ["staff", "admin"]);
    const payload = await readJson(req, { limit: 7_500_000 });
    const uploaded = await uploadProductImage(payload);
    sendJson(res, 201, { ok: true, ...uploaded });
    return true;
  }
  if(req.method === "POST" && url.pathname === "/api/panel/staff/inventory/products"){
    const auth = await requireAuth(req, ["staff", "admin"]);
    const payload = await readJson(req);
    const product = await createInventoryProduct(payload, auth.profile);
    sendJson(res, 201, { ok: true, product });
    return true;
  }
  if(req.method === "PATCH" && url.pathname.startsWith("/api/panel/staff/inventory/products/by-name/")){
    const auth = await requireAuth(req, ["staff", "admin"]);
    const name = decodeURIComponent(url.pathname.replace("/api/panel/staff/inventory/products/by-name/", ""));
    const payload = await readJson(req);
    const product = await updateInventoryProductByName(name, payload, auth.profile);
    sendJson(res, 200, { ok: true, product });
    return true;
  }
  if(req.method === "DELETE" && url.pathname.startsWith("/api/panel/staff/inventory/products/by-name/")){
    await requireAuth(req, ["staff", "admin"]);
    const name = decodeURIComponent(url.pathname.replace("/api/panel/staff/inventory/products/by-name/", ""));
    await deleteInventoryProductByName(name);
    sendJson(res, 200, { ok: true });
    return true;
  }
  if(req.method === "POST" && url.pathname === "/api/panel/staff/inventory/restock"){
    const auth = await requireAuth(req, ["staff", "admin"]);
    const payload = await readJson(req);
    const product = await restockInventoryProductByName(payload, auth.profile);
    sendJson(res, 200, { ok: true, product });
    return true;
  }

  return false;
}

async function serveStatic(res, url){
  let pathname = decodeURIComponent(url.pathname);
  if(pathname === "/") pathname = "/index.html";

  let filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if(!filePath.startsWith(PUBLIC_DIR)){
    sendText(res, 403, "Forbidden");
    return;
  }

  try{
    const info = await stat(filePath);
    if(info.isDirectory()){
      filePath = path.join(filePath, "index.html");
    }
  }catch(_e){}

  try{
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  }catch(_e){
    sendText(res, 404, "Not found");
  }
}

async function handleRequest(req, res){
  try{
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const handled = await handleApi(req, res, url);
    if(handled) return;
    await serveStatic(res, url);
  }catch(err){
    console.error(err);
    sendJson(res, Number(err.status || 500), { error: err.message || "Internal server error" });
  }
}

const server = http.createServer(handleRequest);

if(!process.env.VERCEL){
  server.listen(PORT, () => {
    console.log(`Jazjo server running at http://localhost:${PORT}`);
  });
}

export {
  assertProfileIsActive,
  calculateDeliveryFee,
  PRODUCT_IMAGE_MAX_BYTES,
  buildEmailJsVerificationPayload,
  buildPaymongoOrderLineItems,
  getNextOrderSequenceFromRows,
  getPsgcCitiesPath,
  handleRequest,
  isOrderCodeUniqueViolation,
  isPaymongoProcessingStatusError,
  makeOrderCode,
  normalizeReturnBaseUrl,
  paymongoCheckoutLooksPaid,
  parsePaymongoWebhookEvent,
  parseProductImagePayload,
  validateStaffAccountPayload,
  validateCustomerRegistration,
  validatePasswordComplexity,
  validatePhilippineContact,
  validateQuantityPerCase
};
export default handleRequest;
