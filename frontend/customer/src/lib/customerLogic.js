export const CUSTOMER_APP_URL = "/customer-app/index.html";
export const CART_KEY = "jazjo_cart_v1";
export const ORDERS_KEY = "jazjo_orders_v1";
export const FAVORITES_KEY = "jazjo_favorites_v1";
export const REWARDS_KEY = "jazjo_rewards_v1";

export function normalizeCategory(category, name = "") {
  const raw = String(category || "")
    .trim()
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");
  const text = `${raw} ${String(name || "").toLowerCase()}`;
  if (raw === "rc products" || raw === "rc product") return "RC Products";
  if (raw === "juice tea" || raw === "juice/tea" || raw === "tea") return "Juice/Tea";
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
  if (!/^09\d{9}$/.test(value)) {
    return { ok: false, message: "Contact number must follow Philippine format: 09xxxxxxxxx." };
  }
  return { ok: true, value };
}

export function validatePassword(password) {
  const value = String(password || "");
  if (value.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    return { ok: false, message: "Password must include uppercase, lowercase, number, and special character." };
  }
  return { ok: true, value };
}

export function formatDeliveryAddress({ provinceName = "", cityName = "" } = {}) {
  return [cityName, provinceName].map((item) => String(item || "").trim()).filter(Boolean).join(", ");
}

export function validateDeliveryAddress(address = {}) {
  const provinceCode = String(address.provinceCode || "").trim();
  const provinceName = String(address.provinceName || "").trim();
  const cityCode = String(address.cityCode || "").trim();
  const cityName = String(address.cityName || "").trim();
  if (!provinceCode || !provinceName) {
    return { ok: false, message: "Please choose a province." };
  }
  if (!cityCode || !cityName) {
    return { ok: false, message: "Please choose a city or municipality." };
  }
  return {
    ok: true,
    value: {
      provinceCode,
      provinceName,
      cityCode,
      cityName,
      address: formatDeliveryAddress({ provinceName, cityName })
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

export function formatQty(value) {
  const num = Number(value || 0);
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, "");
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
