import { ORDERS_KEY, getToken, normalizeCategory, placeholderImage, readStorage, statusLabel } from "./customerLogic.js";

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
    img: p.image_url || placeholderImage(p.name)
  }));
}

export async function apiProfile() {
  return request("/api/profile");
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
  return (data.orders || []).map(normalizeOrder);
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

export async function apiAdminDashboard() {
  return request("/api/panel/admin/dashboard");
}

export async function apiAdminOrders() {
  return request("/api/panel/admin/orders");
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

export async function apiAdminDelivery() {
  return request("/api/panel/admin/delivery");
}

export async function apiStaffOrders() {
  return request("/api/panel/staff/orders");
}

export async function apiStaffInventory() {
  return request("/api/panel/staff/inventory");
}

export async function apiStaffDelivery() {
  return request("/api/panel/staff/delivery");
}

export function normalizeOrder(order) {
  return {
    id: order.id || order.order_code,
    createdAt: order.createdAt || order.created_at || "",
    customerName: order.customerName || order.customer_name || "Customer",
    contact: order.contact || "",
    address: order.address || "",
    paymentMethod: order.paymentMethod || order.payment_method || "QRPH",
    paymentStatus: order.paymentStatus || order.payment_status || "",
    subtotal: Number(order.subtotal || 0),
    deliveryFee: Number(order.deliveryFee ?? order.delivery_fee ?? 0),
    total: Number(order.total || 0),
    status: statusLabel(order.status),
    items: (order.items || order.order_items || []).map((it) => ({
      productId: it.sku || it.product_id || it.productId,
      name: it.name,
      price: Number(it.price ?? it.unit_price ?? 0),
      qty: Number(it.qty || 0),
      packLabel: it.packLabel || it.pack_label || "",
      caseQty: Number(it.caseQty ?? it.case_qty ?? 1),
      img: it.img || it.image_url || placeholderImage(it.name)
    })),
    statusEvents: order.status_events || []
  };
}
