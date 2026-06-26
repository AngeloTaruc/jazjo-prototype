import { ORDERS_KEY, getToken, mergeOrdersByOrderNumber, normalizeCategory, placeholderImage, readStorage, statusLabel } from "./customerLogic.js";

const PSGC_API_BASE = "https://psgc.gitlab.io/api";
const METRO_MANILA_CODE = "130000000";
const METRO_MANILA_LOCATION = { code: METRO_MANILA_CODE, name: "Metro Manila", regionCode: METRO_MANILA_CODE };

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || "Invalid server response" };
  }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function psgcRequest(path) {
  const res = await fetch(`${PSGC_API_BASE}${path}`, { cache: "force-cache" });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || "Invalid PSGC response" };
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `PSGC request failed (${res.status})`);
  }
  return data;
}

function normalizePsgcList(data) {
  return (Array.isArray(data) ? data : data?.data || [])
    .map((entry) => ({
      code: String(entry?.code || "").trim(),
      name: String(entry?.name || "").trim(),
      provinceCode: String(entry?.provinceCode || entry?.province_code || "").trim(),
      regionCode: String(entry?.regionCode || entry?.region_code || "").trim()
    }))
    .filter((entry) => entry.code && entry.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function apiLogin(emailOrPayload, password) {
  const payload = typeof emailOrPayload === "object"
    ? emailOrPayload
    : { email: emailOrPayload, password };
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function apiRegister(payload) {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function apiCheckRegistrationEmail(email) {
  const params = new URLSearchParams({ email: String(email || "") });
  return request(`/api/auth/check-email?${params.toString()}`);
}

export async function apiRequestRegistrationCode(email) {
  return request("/api/auth/register/verification-code", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export async function apiVerifyRegistrationCode(email, verificationCode) {
  return request("/api/auth/register/verify-code", {
    method: "POST",
    body: JSON.stringify({ email, verificationCode })
  });
}

export async function apiProducts() {
  const data = await request("/api/products");
  return (data.products || []).map((p) => ({
    id: p.id,
    dbId: p.dbId,
    sku: p.sku || p.id,
    name: p.name,
    category: normalizeCategory(p.category, p.name),
    originalCategory: p.category,
    unit: p.unit,
    price: Number(p.price || 0),
    stockCases: Number(p.stockCases ?? p.stock_cases ?? 0),
    quantityPerCase: Number(p.quantityPerCase ?? p.quantity_per_case ?? 1),
    img: p.image_url || placeholderImage(p.name)
  }));
}

export async function apiStoreSettings() {
  const data = await request("/api/store-settings");
  const settings = data.storeSettings || {};
  return {
    deliveryFee: Number(settings.deliveryFee ?? settings.delivery_fee ?? 60),
    freeDeliveryMinimum: Number(settings.freeDeliveryMinimum ?? settings.free_delivery_minimum ?? 800)
  };
}

export async function apiProvinces() {
  const data = await psgcRequest("/provinces/");
  const provinces = normalizePsgcList(data);
  if (!provinces.some((entry) => entry.code === METRO_MANILA_CODE)) {
    provinces.push(METRO_MANILA_LOCATION);
  }
  return provinces.sort((a, b) => a.name.localeCompare(b.name));
}

export async function apiProvinceCities(provinceCode) {
  if (!provinceCode) return [];
  const code = String(provinceCode);
  const scope = code === METRO_MANILA_CODE ? "regions" : "provinces";
  try {
    const data = await psgcRequest(`/${scope}/${encodeURIComponent(code)}/cities-municipalities/`);
    return normalizePsgcList(data);
  } catch (err) {
    let list = [];
    try {
      list = normalizePsgcList(await psgcRequest("/cities-municipalities/"));
    } catch {
      const [cities, municipalities] = await Promise.all([
        psgcRequest("/cities/").then(normalizePsgcList),
        psgcRequest("/municipalities/").then(normalizePsgcList)
      ]);
      list = [...cities, ...municipalities];
    }
    return list.filter((entry) => code === METRO_MANILA_CODE
      ? entry.regionCode === code
      : entry.provinceCode === code);
  }
}

export async function apiProfile() {
  const data = await request("/api/profile");
  return normalizeCustomerProfile(data);
}

export function normalizeCustomerProfile(data = {}) {
  const profile = data.profile || data.user || data || {};
  const fullName = String(profile.full_name || profile.fullName || "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = String(profile.firstName || profile.first_name || parts[0] || "").trim();
  const lastName = String(
    profile.lastName || profile.last_name || (parts.length > 1 ? parts.slice(1).join(" ") : "")
  ).trim();
  const rawAddress = profile.address || {};
  const address = rawAddress && typeof rawAddress === "object"
    ? rawAddress
    : { fullAddress: String(rawAddress || "").trim() };
  return {
    firstName,
    lastName,
    fullName,
    email: String(profile.email || "").trim(),
    contact: String(profile.contact || "").trim(),
    address
  };
}

export async function apiSaveProfile(payload) {
  return request("/api/profile", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function apiChangePassword(payload) {
  return request("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function apiOrders() {
  const data = await request("/api/orders");
  return mergeOrdersByOrderNumber((data.orders || []).map(normalizeOrder));
}

export async function apiOrderDetails(orderCode) {
  try {
    const data = await request(`/api/orders/${encodeURIComponent(orderCode)}`);
    return data.order ? normalizeOrder(data.order) : null;
  } catch (err) {
    if (err.status === 404) throw err;
    const cached = readStorage(ORDERS_KEY, []).find((order) => String(order.id || order.order_code) === String(orderCode));
    if (cached) return normalizeOrder(cached);
    throw err;
  }
}

export async function apiCreateOrder(payload) {
  const data = await request("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return {
    ...data,
    order: data.order ? normalizeOrder(data.order) : null
  };
}

export async function apiReconcilePayment(orderCode) {
  return request(`/api/orders/${encodeURIComponent(orderCode)}/reconcile-payment`, { method: "POST" });
}

export async function apiRepayOrder(orderCode) {
  return request(`/api/orders/${encodeURIComponent(orderCode)}/repay`, {
    method: "POST",
    body: JSON.stringify({ returnBaseUrl: window.location.origin })
  });
}

export async function apiRewards() {
  const data = await request("/api/rewards");
  const summary = data.rewards || {};
  return { points: summary.points || 0 };
}

export async function apiRedeemReward(rewardType) {
  const data = await request("/api/rewards/redeem", {
    method: "POST",
    body: JSON.stringify({ rewardType })
  });
  const summary = data.summary || {};
  return { points: summary.points || 0 };
}

export async function apiUpdateOrderStatus(orderCode, status) {
  return request(`/api/orders/${encodeURIComponent(orderCode)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export async function apiUpdateOrderDetails(orderCode, payload) {
  const data = await request(`/api/orders/${encodeURIComponent(orderCode)}/details`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return data.order ? normalizeOrder(data.order) : null;
}

export async function apiUpdateOrderPreparation(orderCode, items) {
  const data = await request(`/api/orders/${encodeURIComponent(orderCode)}/preparation`, {
    method: "PATCH",
    body: JSON.stringify({ items })
  });
  return data.order ? normalizeOrder(data.order) : null;
}

export async function apiPrepareOrder(orderCode) {
  const data = await request(`/api/orders/${encodeURIComponent(orderCode)}/prepare`, {
    method: "POST"
  });
  return data.order ? normalizeOrder(data.order) : null;
}

export async function apiOrderInvoice(orderCode) {
  const data = await request(`/api/orders/${encodeURIComponent(orderCode)}/invoice`);
  return data.invoice || null;
}

export async function apiAdminDashboard() {
  const data = await request("/api/panel/admin/dashboard");
  const orders = mergeOrdersByOrderNumber((data.orders || []).map(normalizeOrder));
  const recentOrders = mergeOrdersByOrderNumber((data.recentOrders || []).map(normalizeOrder));
  const todayOrders = mergeOrdersByOrderNumber((data.todayOrders || []).map(normalizeOrder));
  return { ...data, orders, recentOrders, todayOrders, lowStock: data.lowStock || [], outOfStock: data.outOfStock || [] };
}

export async function apiAdminOrders({ page = 1, perPage = 10, status = "All", search = "" } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    status,
    search
  });
  const data = await request(`/api/panel/admin/orders?${params.toString()}`);
  const normalizedOrders = mergeOrdersByOrderNumber((data.orders || []).map(normalizeOrder));
  if (data.pagination) {
    return { ...data, orders: normalizedOrders };
  }
  const query = String(search || "").trim().toLowerCase();
  const filtered = normalizedOrders.filter((order) => {
    const matchesStatus = status === "All" || statusLabel(order.status) === status;
    if (!matchesStatus) return false;
    if (!query) return true;
    const haystack = [
      order.id,
      order.customerName,
      order.contact,
      order.createdAt,
      statusLabel(order.status),
      order.paymentStatus,
      ...(order.items || []).map((item) => item.name)
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });
  const safePerPage = Math.max(1, Number(perPage) || 10);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / safePerPage));
  const safePage = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const start = (safePage - 1) * safePerPage;
  return {
    ...data,
    orders: filtered.slice(start, start + safePerPage),
    pagination: { page: safePage, perPage: safePerPage, total, totalPages }
  };
}

export async function apiAdminDeleteOrder(orderCode) {
  const result = await request(`/api/panel/admin/orders/${encodeURIComponent(orderCode)}`, {
    method: "DELETE"
  });
  if (result?.deleted === false) {
    throw new Error(`Order ${orderCode} was not found on the server.`);
  }
  return result;
}

export async function apiAdminBulkDeleteOrdersByStatus(status) {
  return request("/api/panel/admin/orders/bulk-delete", {
    method: "DELETE",
    body: JSON.stringify({ status })
  });
}

export async function apiAdminInventory() {
  return request("/api/panel/admin/inventory");
}

export async function apiAdminCategories() {
  return request("/api/panel/admin/categories");
}

export async function apiAdminCreateCategory(name) {
  return request("/api/panel/admin/categories", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export async function apiAdminDeleteCategory(name) {
  return request(`/api/panel/admin/categories/${encodeURIComponent(name)}`, {
    method: "DELETE"
  });
}

export async function apiAdminCreateProduct(payload) {
  return request("/api/panel/admin/inventory/products", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function apiAdminUploadProductImage(dataUrl, fileName) {
  return request("/api/panel/admin/inventory/product-image", {
    method: "POST",
    body: JSON.stringify({ dataUrl, fileName })
  });
}

export async function apiAdminRestock(productName, addCases) {
  return request("/api/panel/admin/inventory/restock", {
    method: "POST",
    body: JSON.stringify({ productName, addCases })
  });
}

export async function apiAdminUpdateProduct(name, payload) {
  return request(`/api/panel/admin/inventory/products/by-name/${encodeURIComponent(name)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function apiAdminDeleteProduct(name) {
  return request(`/api/panel/admin/inventory/products/by-name/${encodeURIComponent(name)}`, {
    method: "DELETE"
  });
}

export async function apiAdminCustomers() {
  return request("/api/panel/admin/customers");
}

export async function apiAdminStaffAccounts() {
  return request("/api/panel/admin/staff");
}

export async function apiAdminCreateStaffAccount(payload) {
  return request("/api/panel/admin/staff", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function apiAdminUpdateStaffAccount(userId, payload) {
  return request(`/api/panel/admin/staff/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function apiAdminDisableStaffAccount(userId) {
  return request(`/api/panel/admin/staff/${encodeURIComponent(userId)}/disable`, {
    method: "POST"
  });
}

export async function apiAdminResetStaffPassword(userId, payload) {
  return request(`/api/panel/admin/staff/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function apiAdminRewards() {
  return request("/api/panel/admin/rewards");
}

export async function apiAdminRedeemReward(rewardType, customerEmail) {
  return request("/api/panel/admin/rewards/redeem", {
    method: "POST",
    body: JSON.stringify({ rewardType, customerEmail })
  });
}

export async function apiAdminSales() {
  return request("/api/panel/admin/sales");
}

export async function apiAdminReports() {
  return request("/api/panel/admin/reports");
}

export async function apiAdminReportDetail(reportKey, { range = "all", from = "", to = "" } = {}) {
  const params = new URLSearchParams({ range });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return request(`/api/panel/admin/reports/${encodeURIComponent(reportKey)}?${params.toString()}`);
}

export async function apiAdminDelivery() {
  return request("/api/panel/admin/delivery");
}

export async function apiStaffOrders() {
  const data = await request("/api/panel/staff/orders");
  return { ...data, orders: mergeOrdersByOrderNumber((data.orders || []).map(normalizeOrder)) };
}

export async function apiStaffInventory() {
  return request("/api/panel/staff/inventory");
}

export async function apiStaffCategories() {
  return request("/api/panel/staff/categories");
}

export async function apiStaffCreateCategory(name) {
  return request("/api/panel/staff/categories", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export async function apiStaffDeleteCategory(name) {
  return request(`/api/panel/staff/categories/${encodeURIComponent(name)}`, {
    method: "DELETE"
  });
}

export async function apiStaffCreateProduct(payload) {
  return request("/api/panel/staff/inventory/products", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function apiStaffUploadProductImage(dataUrl, fileName) {
  return request("/api/panel/staff/inventory/product-image", {
    method: "POST",
    body: JSON.stringify({ dataUrl, fileName })
  });
}

export async function apiStaffRestock(productName, addCases) {
  return request("/api/panel/staff/inventory/restock", {
    method: "POST",
    body: JSON.stringify({ productName, addCases })
  });
}

export async function apiStaffUpdateProduct(name, payload) {
  return request(`/api/panel/staff/inventory/products/by-name/${encodeURIComponent(name)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function apiStaffDeleteProduct(name) {
  return request(`/api/panel/staff/inventory/products/by-name/${encodeURIComponent(name)}`, {
    method: "DELETE"
  });
}

export async function apiStaffDelivery() {
  return request("/api/panel/staff/delivery");
}

export function normalizeOrder(order) {
  const normalizedItems = (order.items || order.order_items || []).map((it) => ({
    productId: it.sku || it.product_id || it.productId,
    name: it.name,
    price: Number(it.price ?? it.unit_price ?? 0),
    qty: Number(it.qty || 0),
    packLabel: it.packLabel || it.pack_label || "",
    caseQty: Number(it.caseQty ?? it.case_qty ?? 1),
    img: it.img || it.image_url || placeholderImage(it.name)
  }));
  const fallbackPreparationItems = normalizedItems.map((item) => ({
    productId: item.productId,
    name: item.name,
    qty: Number(item.qty || 0),
    prepared: false,
    preparedAt: "",
    preparedBy: "",
    validationMessage: ""
  }));
  return {
    dbId: order.dbId || order.db_id || order.id,
    id: order.id || order.order_code,
    createdAt: order.createdAt || order.created_at || "",
    customerName: order.customerName || order.customer_name || "Customer",
    contact: order.contact || "",
    address: order.address || "",
    fulfillmentType: order.fulfillmentType || order.fulfillment_type || "delivery",
    paymentMethod: order.paymentMethod || order.payment_method || "Bank QR PH",
    paymentMethodKey: order.paymentMethodKey || order.payment_method_key || "bank_qr_ph",
    paymentStatus: order.paymentStatus || order.payment_status || "",
    subtotal: Number(order.subtotal || 0),
    deliveryFee: Number(order.deliveryFee ?? order.delivery_fee ?? 0),
    discountAmount: Number(order.discountAmount ?? order.discount_amount ?? 0),
    total: Number(order.total || 0),
    status: statusLabel(order.status),
    items: normalizedItems,
    preparedAt: order.preparedAt || order.prepared_at || "",
    preparedBy: order.preparedBy || order.prepared_by || "",
    preparationCompleted: order.preparationCompleted === true || order.preparation_completed === true,
    preparation: order.preparation || { items: fallbackPreparationItems, preparedItems: 0, totalItems: fallbackPreparationItems.length, percent: 0, completed: false },
    paidAt: order.paidAt || order.paid_at || "",
    statusEvents: order.status_events || []
  };
}
