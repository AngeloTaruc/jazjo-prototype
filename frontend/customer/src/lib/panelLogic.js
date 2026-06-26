import { paymentStatusLabel, statusLabel } from "./customerLogic.js";

export function formatFulfillmentType(value) {
  return String(value || "delivery").toLowerCase() === "pickup" ? "Pickup" : "Delivery";
}

export function fulfillmentColor(value) {
  return String(value || "delivery").toLowerCase() === "pickup" ? "secondary" : "primary";
}

export function statusColor(status) {
  const label = statusLabel(status);
  if (label === "Delivered") return "success";
  if (label === "Cancelled") return "danger";
  if (label === "In Transit" || label === "Out for Delivery") return "primary";
  return "warning";
}

export function paymentStatusColor(label) {
  if (label === "Paid") return "success";
  if (label === "Failed" || label === "Cancelled") return "danger";
  if (label === "Processing" || label === "Awaiting QRPH") return "warning";
  return "default";
}

export function normalizePaymentMethodKey(value) {
  const normalized = String(value || "bank_qr_ph").trim().toLowerCase();
  if (normalized === "cod" || normalized === "cash_on_delivery") return "cod";
  if (normalized === "gcash") return "gcash";
  if (normalized === "maya" || normalized === "paymaya") return "maya";
  if (["bank qr", "bank_qr", "qrph", "bank_qr_ph"].includes(normalized)) return "bank_qr_ph";
  return normalized || "bank_qr_ph";
}

export function paymentMethodLabel(method) {
  const normalized = normalizePaymentMethodKey(method);
  if (normalized === "cod") return "COD";
  if (normalized === "gcash") return "GCash";
  if (normalized === "maya") return "Maya";
  return "Bank QR PH";
}

export function paymentMethodColor(method) {
  const normalized = normalizePaymentMethodKey(method);
  if (normalized === "cod") return "warning";
  if (normalized === "gcash") return "success";
  if (normalized === "maya") return "secondary";
  return "primary";
}

export function getPreparationSummary(order) {
  const prep = order?.preparation || {};
  const fallbackItems = Array.isArray(order?.items)
    ? order.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        qty: Number(item.qty || 0),
        prepared: false,
        preparedAt: "",
        preparedBy: "",
        validationMessage: "",
      }))
    : [];
  const items = Array.isArray(prep.items) && prep.items.length ? prep.items : fallbackItems;
  const preparedItems = Array.isArray(prep.items) && prep.items.length
    ? Number(prep.preparedItems || 0)
    : items.filter((item) => item.prepared === true).length;
  const totalItems = Array.isArray(prep.items) && prep.items.length
    ? Number(prep.totalItems || 0)
    : items.length;
  const percent = totalItems > 0
    ? Math.round((preparedItems / totalItems) * 100)
    : Number(prep.percent || 0);
  return {
    items,
    preparedItems,
    totalItems,
    percent,
    completed: prep.completed === true || order?.preparationCompleted === true || (totalItems > 0 && preparedItems === totalItems),
  };
}

export function getOrderDate(order) {
  const raw = order?.createdAtRaw || order?.createdAt || "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isOrderInRange(order, range, { from = "", to = "" } = {}) {
  const date = getOrderDate(order);
  if (!date) return false;
  const now = new Date();
  const key = String(range || "all").toLowerCase();
  if (key === "all") return true;
  if (key === "today") {
    return date.toDateString() === now.toDateString();
  }
  if (key === "week") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return date >= start && date <= now;
  }
  if (key === "month") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  if (key === "year") {
    return date.getFullYear() === now.getFullYear();
  }
  if (key === "custom") {
    const start = from ? new Date(`${from}T00:00:00`) : null;
    const end = to ? new Date(`${to}T23:59:59`) : null;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  }
  return true;
}

export function filterOrdersByRange(orders, range, options = {}) {
  return (orders || []).filter((order) => isOrderInRange(order, range, options));
}

export function computeBestSeller(orders) {
  const counts = new Map();
  for (const order of orders || []) {
    if (statusLabel(order?.status) === "Cancelled") continue;
    for (const item of order.items || []) {
      const name = String(item.name || "").trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + Number(item.qty || 0));
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { name: sorted[0]?.[0] || "N/A", quantity: sorted[0]?.[1] || 0 };
}

export function paymentStatusText(order) {
  return paymentStatusLabel(order?.paymentStatus, order?.status);
}
