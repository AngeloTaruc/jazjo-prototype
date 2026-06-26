export const CUSTOMER_APP_URL = "/customer-app/index.html";
export const CART_KEY = "jazjo_cart_v1";
export const ORDERS_KEY = "jazjo_orders_v1";
export const FAVORITES_KEY = "jazjo_favorites_v1";
export const REWARDS_KEY = "jazjo_rewards_v1";
export const DEFAULT_DELIVERY_SETTINGS = {
  deliveryFee: 60,
  freeDeliveryMinimum: 800
};

export function normalizeDeliverySettings(settings = {}) {
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

export function calculateDeliveryFee(subtotal, settings = DEFAULT_DELIVERY_SETTINGS) {
  const safeSubtotal = Math.max(0, Number(subtotal || 0));
  if (safeSubtotal === 0) return 0;
  const normalized = normalizeDeliverySettings(settings);
  return safeSubtotal >= normalized.freeDeliveryMinimum ? 0 : normalized.deliveryFee;
}

function dateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function createDemandForecast(products = [], orders = [], { horizonDays = 5 } = {}) {
  const quantitiesByName = new Map();
  for (const order of orders || []) {
    if (statusLabel(order?.status) === "Cancelled") continue;
    const day = dateKey(order?.createdAtRaw || order?.createdAt || order?.created_at);
    for (const item of order?.items || []) {
      const name = String(item?.name || "").trim();
      if (!name) continue;
      const productDays = quantitiesByName.get(name) || new Map();
      productDays.set(day, (productDays.get(day) || 0) + Number(item?.qty || 0));
      quantitiesByName.set(name, productDays);
    }
  }

  return (products || [])
    .map((product) => {
      const name = String(product?.name || "").trim();
      const dayTotals = [...(quantitiesByName.get(name) || new Map()).entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map((entry) => Number(entry[1] || 0));
      const recent = dayTotals.slice(-7);
      const total = recent.reduce((sum, qty) => sum + qty, 0);
      const average = recent.length ? total / recent.length : 0;
      const first = recent[0] || 0;
      const last = recent[recent.length - 1] || first;
      const trend = recent.length > 1 ? (last - first) / (recent.length - 1) : 0;
      const dailyDemand = Math.max(0, average + trend);
      const forecastCases = Math.ceil(dailyDemand * Number(horizonDays || 5));
      const stockCases = Number(product?.stockCases ?? product?.stock_cases ?? 0);
      return {
        name,
        category: product?.category || "-",
        stockCases,
        forecastCases,
        recommendedRestock: Math.max(0, forecastCases - stockCases),
        model: recent.length >= 2 ? "ARIMA-style trend" : "Moving average"
      };
    })
    .filter((row) => row.name)
    .sort((a, b) => b.recommendedRestock - a.recommendedRestock || b.forecastCases - a.forecastCases);
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, "")}"`;
}

export function buildCsvContent(headers = [], rows = [], fieldLabels = {}) {
  const fields = Object.keys(fieldLabels);
  const headerLine = headers.map(csvEscape).join(",");
  const bodyLines = rows.map((row) =>
    fields.map((field) => csvEscape(row?.[field])).join(",")
  );
  return [headerLine, ...bodyLines].join("\r\n");
}

export function normalizeCategory(category, name = "") {
  const raw = String(category || "")
    .trim()
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");
  const text = `${raw} ${String(name || "").toLowerCase()}`;
  if (raw === "rc products" || raw === "rc product") return "Soft Drinks";
  if (raw === "juice tea" || raw === "juice/tea" || raw === "tea") return "Juice";
  if (raw === "softdrinks" || raw === "soft drink" || raw === "soft drinks") return "Soft Drinks";
  if (raw === "energy" || raw === "energy drink" || raw === "energy drinks") return "Energy Drinks";
  if (raw === "water") return "Water";
  if (raw === "juice") return "Juice";
  if (/water|wilkins|nature spring/.test(text)) return "Water";
  if (/cobra|sting|gatorade|energy/.test(text)) return "Energy Drinks";
  if (/juice|tea|c2|magnolia|zesto/.test(text)) return "Juice";
  if (/coke|cola|sprite|royal|rc|root beer|soda|mountaindew|mountain dew/.test(text)) return "Soft Drinks";
  return raw ? raw.replace(/\b\w/g, (m) => m.toUpperCase()) : "Other";
}

export function validateContact(contact) {
  const value = String(contact || "").trim();
  if (!/^\d*$/.test(value)) {
    return { ok: false, message: "Only numeric characters are allowed for contact number." };
  }
  if (value && !"09".startsWith(value) && !value.startsWith("09")) {
    return { ok: false, message: "Contact number must start with 09." };
  }
  if (value.length !== 11) {
    return { ok: false, message: "Contact number must contain exactly 11 digits." };
  }
  return { ok: true, value };
}

export function normalizeContactInput(contact) {
  return String(contact || "").replace(/\D/g, "").slice(0, 11);
}

export function validateGmailAddress(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value) return { ok: false, message: "Email is required." };
  if (!value.endsWith("@gmail.com")) {
    return { ok: false, message: "Email must end with @gmail.com." };
  }
  return { ok: true, value };
}

export function validatePassword(password) {
  const value = String(password || "");
  if (!value.trim()) return { ok: false, message: "Password is required." };
  return { ok: true, value };
}

export function buildCheckoutPrefill(data = {}) {
  const profile = data.profile || data.user || data;
  const rawAddress = profile.address || "";
  const addressText = rawAddress && typeof rawAddress === "object"
    ? String(rawAddress.fullAddress || rawAddress.full_address || rawAddress.address || "").trim()
    : String(rawAddress || "").trim();
  return {
    customerName: String(profile.full_name || profile.fullName || "").trim(),
    email: String(profile.email || "").trim(),
    contact: String(profile.contact || "").trim(),
    addressText
  };
}

export function mergeOrdersByOrderNumber(orders = []) {
  const byOrder = new Map();
  for (const order of orders || []) {
    const id = String(order?.id || order?.order_code || "").trim();
    if (!id) continue;
    const existing = byOrder.get(id);
    if (!existing) {
      byOrder.set(id, {
        ...order,
        id,
        items: [...(order.items || [])],
        total: Number(order.total || 0)
      });
      continue;
    }
    existing.items = [...(existing.items || []), ...(order.items || [])];
    existing.total = Number(existing.total || 0) + Number(order.total || 0);
    existing.status = order.status || existing.status;
    existing.paymentStatus = order.paymentStatus || existing.paymentStatus;
    existing.createdAt = existing.createdAt || order.createdAt;
    existing.customerName = existing.customerName || order.customerName;
  }
  return [...byOrder.values()];
}

export function formatDeliveryAddress({
  fullAddress = "",
  street = "",
  barangay = "",
  provinceName = "",
  cityName = ""
} = {}) {
  const cleanBarangay = String(barangay || "").trim().replace(/^barangay\s+/i, "");
  return [
    fullAddress,
    street,
    cleanBarangay ? `Barangay ${cleanBarangay}` : "",
    cityName,
    provinceName
  ].map((item) => String(item || "").trim()).filter(Boolean).join(", ");
}

export function validateDeliveryAddress(address = {}) {
  const fullAddress = String(address.fullAddress || address.full_address || "").trim();
  const street = String(address.street || "").trim();
  const barangay = String(address.barangay || address.baranggay || "").trim();
  const provinceCode = String(address.provinceCode || "").trim();
  const provinceName = String(address.provinceName || "").trim();
  const cityCode = String(address.cityCode || "").trim();
  const cityName = String(address.cityName || "").trim();
  if (!fullAddress) {
    return { ok: false, message: "Please enter the full delivery address." };
  }
  if (!street) {
    return { ok: false, message: "Please enter the street." };
  }
  if (!barangay) {
    return { ok: false, message: "Please enter the barangay." };
  }
  if (!provinceCode || !provinceName) {
    return { ok: false, message: "Please choose a province." };
  }
  if (!cityCode || !cityName) {
    return { ok: false, message: "Please choose a city or municipality." };
  }
  return {
    ok: true,
    value: {
      fullAddress,
      street,
      barangay,
      provinceCode,
      provinceName,
      cityCode,
      cityName,
      address: formatDeliveryAddress({ fullAddress, street, barangay, provinceName, cityName })
    }
  };
}

export function canAddCartQuantity({ existingQty = 0, addQty = 1, caseQty = 1, stockCases = 0 }) {
  const nextCases = (Number(existingQty || 0) + Number(addQty || 0)) * Number(caseQty || 1);
  const stock = Number(stockCases || 0);
  if (nextCases > stock) {
    return { ok: false, message: `Only ${formatQty(stock)} case(s) available.` };
  }
  return { ok: true, nextCases };
}

export function toggleFavoriteProduct(favorites = [], productId) {
  const id = String(productId || "");
  if (!id) return favorites;
  const current = favorites.map(String);
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

export function partitionProductsByFavorites(products = [], favorites = []) {
  const saved = new Set(favorites.map(String));
  return products.reduce(
    (result, product) => {
      const key = saved.has(String(product?.id)) ? "favoriteProducts" : "otherProducts";
      result[key].push(product);
      return result;
    },
    { favoriteProducts: [], otherProducts: [] },
  );
}

export function formatQty(value) {
  const num = Number(value || 0);
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, "");
}

export function formatCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function money(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 0 })}`;
}

export function statusLabel(status) {
  const map = {
    pending_payment: "Pending Payment",
    order_placed: "Order Placed",
    preparing: "Preparing",
    in_transit: "In Transit",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled"
  };
  return map[status] || status || "Order Placed";
}

export function isRetryablePaymentReason(reason) {
  return ["processing", "still_pending", "active", "pending"].includes(
    String(reason || "").toLowerCase(),
  );
}

export function paymentStatusLabel(paymentStatus, orderStatus = "") {
  const value = String(paymentStatus || "").toLowerCase();
  if (value === "paid") return "Paid";
  if (value === "processing") return "Processing";
  if (value === "failed") return "Failed";
  if (value === "cancelled" || value === "canceled") return "Cancelled";
  if (statusLabel(orderStatus) === "Pending Payment") return "Awaiting QRPH";
  return "Pending";
}

export function canAccessPanelRoute(route, role) {
  const value = String(route || "");
  const normalizedRole = String(role || "").toLowerCase();
  if (value.startsWith("admin/")) return normalizedRole === "admin";
  if (value.startsWith("staff/")) return normalizedRole === "staff" || normalizedRole === "admin";
  return true;
}

export function canRepayOrder(order) {
  const paymentStatus = String(order?.paymentStatus || order?.payment_status || "").toLowerCase();
  const paymentMethod = String(order?.paymentMethod || order?.payment_method || "").toUpperCase();
  return (
    statusLabel(order?.status) === "Pending Payment" &&
    paymentStatus !== "paid" &&
    paymentMethod.includes("QRPH")
  );
}

export function currentCustomerEmail() {
  return localStorage.getItem("jazjo_user") || "customer@jazjo.com";
}

export function getToken() {
  return localStorage.getItem("jazjo_access_token") || sessionStorage.getItem("jazjo_access_token") || "";
}

export function saveSession(auth) {
  const user = auth?.user || {};
  const session = auth?.session || {};
  if (user.email) localStorage.setItem("jazjo_user", user.email);
  if (user.role) localStorage.setItem("jazjo_role", user.role);
  if (session.access_token) sessionStorage.setItem("jazjo_access_token", session.access_token);
}

export function clearSession() {
  localStorage.removeItem("jazjo_user");
  localStorage.removeItem("jazjo_role");
  localStorage.removeItem("jazjo_access_token");
  sessionStorage.removeItem("jazjo_access_token");
}

export function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function placeholderImage(label) {
  const safe = String(label || "Product").replace(/[<&>]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640"><rect width="100%" height="100%" fill="#111827"/><circle cx="450" cy="300" r="160" fill="#31d07d" opacity=".12"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#f8fafc" font-family="Arial" font-size="42" font-weight="800">${safe}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}
