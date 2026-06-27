import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Input as HeroInput } from "@heroui/react/input";
import { ListBox } from "@heroui/react/list-box";
import { Modal } from "@heroui/react/modal";
import { Pagination } from "@heroui/react/pagination";
import { Select } from "@heroui/react/select";
import { Skeleton } from "@heroui/react/skeleton";
import { Tabs } from "@heroui/react/tabs";
import { Toast } from "@heroui/react/toast";
import { Tooltip } from "@heroui/react/tooltip";
import {
  BarChart3,
  Box,
  CreditCard,
  Gift,
  Home,
  LogOut,
  Moon,
  Package,
  Search,
  ShoppingCart,
  Sun,
  Truck,
  TrendingUp,
  Users,
  Plus,
  RefreshCw,
  Eye,
  Sparkles,
  Trash2,
  Warehouse,
  Printer
} from "lucide-react";
import {
  apiAdminDashboard,
  apiAdminOrders,
  apiAdminInventory,
  apiAdminCustomers,
  apiAdminRewards,
  apiAdminSales,
  apiAdminReports,
  apiAdminForecasting,
  apiAdminDelivery,
  apiAdminStaffAccounts,
  apiAdminCreateStaffAccount,
  apiAdminUpdateStaffAccount,
  apiAdminDisableStaffAccount,
  apiAdminResetStaffPassword,
  apiCheckRegistrationEmail,
  apiAdminDeleteOrder,
  apiAdminBulkDeleteOrdersByStatus,
  apiAdminCreateCategory,
  apiAdminDeleteCategory,
  apiAdminCreateProduct,
  apiAdminUploadProductImage,
  apiAdminRestock,
  apiAdminUpdateProduct,
  apiAdminDeleteProduct,
  apiAdminRedeemReward,
  apiAdminReportDetail,
  apiOrderInvoice,
  apiPrepareOrder,
  apiUpdateOrderDetails,
  apiUpdateOrderPreparation,
  apiUpdateOrderStatus
} from "./lib/api.js";
import {
  buildCsvContent,
  clearSession,
  createDemandForecast,
  formatQty,
  getToken,
  money,
  normalizeContactInput,
  statusLabel,
  validateContact,
  validateGmailAddress,
  validatePassword
} from "./lib/customerLogic.js";
import {
  computeBestSeller,
  filterOrdersByRange,
  formatFulfillmentType,
  fulfillmentColor,
  getPreparationSummary,
  paymentMethodColor,
  paymentMethodLabel,
  paymentStatusColor,
  paymentStatusText,
  statusColor,
} from "./lib/panelLogic.js";
import { buildInvoiceHtml, openPrintableHtml } from "./lib/invoicePrint.js";

const CardHeader = Card.Header;
const CardBody = Card.Content;
const BRAND_LOGO = "/customer-app/logo.png";

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 }
};

function go(route) {
  window.location.hash = `#/${route}`;
}

function routeFromHash() {
  return window.location.hash.replace(/^#\/?/, "") || "admin/dashboard";
}

function THead({ children }) {
  return <thead><tr className="border-b border-white/10 text-xs font-bold uppercase tracking-wider text-slate-500">{children}</tr></thead>;
}

function TBody({ children }) {
  return <tbody>{children}</tbody>;
}

function Th({ children }) {
  return <th className="px-3 py-3">{children}</th>;
}

function Tr({ children, className = "", ...props }) {
  return <tr {...props} className={`border-b border-white/5 transition-colors hover:bg-white/[.02] ${className}`}>{children}</tr>;
}

function Td({ children, className = "" }) {
  return <td className={`px-3 py-3 ${className}`}>{children}</td>;
}

function Table({ children }) {
  return <table className="w-full text-left text-sm">{children}</table>;
}

function DeliveryTimeline({ status }) {
  const timelineSteps = ["Order Placed", "Preparing", "In Transit", "Out for Delivery", "Delivered"];
  const current = statusLabel(status);
  const currentIndex = Math.max(0, timelineSteps.indexOf(current));
  return (
    <div className="flex items-center gap-3 overflow-x-auto pb-2">
      {timelineSteps.map((step, idx) => {
        const done = idx <= currentIndex;
        return (
          <div key={step} className="flex min-w-max items-center gap-3">
            <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
              done ? "bg-emerald-500 text-white" : "bg-white/10 text-slate-500"
            }`}>
              {done ? "\u2713" : idx + 1}
            </div>
            <span className={`text-sm ${done ? "font-semibold text-emerald-300" : "text-slate-500"}`}>{step}</span>
            {idx < timelineSteps.length - 1 ? <div className={`h-px w-12 ${done ? "bg-emerald-500/50" : "bg-white/10"}`} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function collapseDeliveryTracks(tracks = []) {
  const byOrder = new Map();
  for (const track of tracks || []) {
    const orderId = String(track?.orderId || track?.id || "").trim();
    if (!orderId) continue;
    const existing = byOrder.get(orderId);
    const trackItems = Array.isArray(track.items) && track.items.length
      ? track.items.map((item) => ({
        productName: item.productName || item.name || track.productName || "-",
        name: item.name || item.productName || track.productName || "-",
        qty: Number(item.qty || 0)
      }))
      : [{
        productName: track.productName || "-",
        name: track.productName || "-",
        qty: Number(track.qty || 0)
      }];
    if (!existing) {
      byOrder.set(orderId, {
        ...track,
        orderId,
        items: trackItems,
        qty: trackItems.reduce((sum, item) => sum + Number(item.qty || 0), 0)
      });
      continue;
    }
    existing.items = [...(existing.items || []), ...trackItems];
    existing.qty = Number(existing.qty || 0) + trackItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    existing.productName = `${existing.items.length} items`;
    existing.updatedAt = track.updatedAt || existing.updatedAt;
    existing.status = track.status || existing.status;
  }
  return [...byOrder.values()].map((track) => ({
    ...track,
    productName: track.items?.length > 1 ? `${track.items.length} items` : (track.items?.[0]?.name || track.productName || "-")
  }));
}

function OrderStatusChip({ status }) {
  return <Chip color={statusColor(status)} variant="flat" size="sm">{statusLabel(status)}</Chip>;
}

function PaymentStatusChip({ order }) {
  const label = paymentStatusText(order);
  return <Chip color={paymentStatusColor(label)} variant="flat" size="sm">{label}</Chip>;
}

function PaymentMethodChip({ method }) {
  const label = paymentMethodLabel(method);
  return <Chip color={paymentMethodColor(method)} variant="flat" size="sm">{label}</Chip>;
}

function FulfillmentChip({ value }) {
  return <Chip color={fulfillmentColor(value)} variant="flat" size="sm">{formatFulfillmentType(value)}</Chip>;
}

function DashboardRangeSelect({ value, onChange, options, ariaLabel }) {
  const selectedLabel = options.find((option) => option.value === value)?.label || options[0]?.label || "Select";
  return (
    <Select
      aria-label={ariaLabel}
      selectedKey={value}
      onSelectionChange={(key) => onChange(String(key))}
      fullWidth
      variant="bordered"
    >
      <Select.Trigger className="min-h-8 rounded-lg border border-white/10 bg-slate-950/80 px-2 text-left text-xs font-semibold text-slate-200">
        <Select.Value>{selectedLabel}</Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover placement="bottom start" className="min-w-40 rounded-xl border border-white/10 bg-slate-950 p-1 shadow-2xl shadow-black/40">
        <ListBox aria-label={ariaLabel} selectionMode="single">
          {options.map((option) => (
            <ListBox.Item
              id={option.value}
              key={option.value}
              textValue={option.label}
              className="rounded-lg px-3 py-2 text-sm text-slate-100 data-[selected=true]:bg-emerald-500 data-[selected=true]:text-slate-950"
            >
              {option.label}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function reportDateKey(value) {
  const d = new Date(value || "");
  if (Number.isNaN(d.getTime())) return String(value || "No date");
  return d.toISOString().slice(0, 10);
}

function reportDateLabel(value) {
  const d = new Date(value || "");
  if (Number.isNaN(d.getTime())) return String(value || "No date");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function orderItemsSold(order) {
  return (order?.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function buildSalesSummaryRows(detail) {
  const byDate = new Map();
  for (const order of detail?.rows || []) {
    const rawDate = order.createdAtRaw || order.createdAt || order.created_at;
    const key = reportDateKey(rawDate);
    const row = byDate.get(key) || {
      key,
      date: reportDateLabel(rawDate),
      orders: 0,
      itemsSold: 0,
      sales: 0,
      averageOrderValue: 0
    };
    row.orders += 1;
    row.itemsSold += orderItemsSold(order);
    row.sales += Number(order.total || 0);
    row.averageOrderValue = row.orders ? row.sales / row.orders : 0;
    byDate.set(key, row);
  }
  const rows = [...byDate.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (rows.length) return rows.slice(-7);
  const totals = detail?.totals || {};
  return [{
    key: "total",
    date: "Selected Period",
    orders: Number(totals.orders || 0),
    itemsSold: Number(totals.soldProducts || 0),
    sales: Number(totals.totalSales || totals.revenue || 0),
    averageOrderValue: Number(totals.orders || 0)
      ? Number(totals.totalSales || totals.revenue || 0) / Number(totals.orders || 1)
      : 0
  }];
}

function SalesReportPreview({ detail }) {
  const rows = buildSalesSummaryRows(detail);
  const maxSales = Math.max(1, ...rows.map((row) => Number(row.sales || 0)));
  const points = rows.map((row, idx) => {
    const x = rows.length === 1 ? 50 : 40 + (idx * 540) / Math.max(1, rows.length - 1);
    const y = 135 - (Number(row.sales || 0) / maxSales) * 105;
    return { ...row, x, y };
  });
  const path = points.map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const total = rows.reduce((acc, row) => ({
    orders: acc.orders + Number(row.orders || 0),
    itemsSold: acc.itemsSold + Number(row.itemsSold || 0),
    sales: acc.sales + Number(row.sales || 0)
  }), { orders: 0, itemsSold: 0, sales: 0 });
  const averageOrderValue = total.orders ? total.sales / total.orders : 0;

  return (
    <div className="rounded-2xl bg-white p-5 text-slate-950 shadow-xl">
      <h3 className="text-sm font-black uppercase tracking-wide text-emerald-950">SALES OVERVIEW</h3>
      <div className="mt-3 overflow-x-auto">
        <svg viewBox="0 0 620 170" className="min-w-[620px] rounded-xl border border-slate-200 bg-white">
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = 135 - tick * 105;
            return (
              <g key={tick}>
                <line x1="40" x2="590" y1={y} y2={y} stroke="#e2e8f0" />
                <text x="10" y={y + 4} fontSize="10" fill="#334155">{money(maxSales * tick)}</text>
              </g>
            );
          })}
          <path d={`${path} L 590 135 L 40 135 Z`} fill="rgba(34,197,94,.12)" />
          <path d={path} fill="none" stroke="#15803d" strokeWidth="3" />
          {points.map((point) => (
            <g key={point.key}>
              <circle cx={point.x} cy={point.y} r="4" fill="#15803d" />
              <text x={point.x - 25} y="158" fontSize="10" fill="#0f172a">{point.date.replace(/, \d{4}$/, "")}</text>
            </g>
          ))}
        </svg>
      </div>
      <h3 className="mt-6 text-sm font-black uppercase tracking-wide text-emerald-950">SALES SUMMARY TABLE</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="border border-slate-200 px-3 py-2">Date</th>
              <th className="border border-slate-200 px-3 py-2">Orders</th>
              <th className="border border-slate-200 px-3 py-2">Items Sold (Cases)</th>
              <th className="border border-slate-200 px-3 py-2">Sales (PHP)</th>
              <th className="border border-slate-200 px-3 py-2">Average Order Value (PHP)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="border border-slate-200 px-3 py-2 font-semibold">{row.date}</td>
                <td className="border border-slate-200 px-3 py-2 text-center">{row.orders}</td>
                <td className="border border-slate-200 px-3 py-2 text-center">{formatQty(row.itemsSold)}</td>
                <td className="border border-slate-200 px-3 py-2 text-right font-semibold">{money(row.sales)}</td>
                <td className="border border-slate-200 px-3 py-2 text-right font-semibold">{money(row.averageOrderValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-3 rounded-lg bg-emerald-950 px-4 py-3 text-sm font-black text-white md:grid-cols-4">
        <span>Total (Selected Period)</span>
        <span>{total.orders}</span>
        <span>{formatQty(total.itemsSold)}</span>
        <span>{money(total.sales)} / {money(averageOrderValue)}</span>
      </div>
    </div>
  );
}

function InventoryReductionSummary({ detail }) {
  const rows = (detail?.inventorySummary || []).filter((row) => Number(row.reducedStock || row.stock_deducted || 0) > 0);
  const displayRows = rows.length ? rows : (detail?.inventorySummary || []);
  const totals = displayRows.reduce((acc, row) => ({
    beginningStock: acc.beginningStock + Number(row.beginningStock || 0),
    addedStock: acc.addedStock + Number(row.addedStock || 0),
    reducedStock: acc.reducedStock + Number(row.reducedStock || 0),
    endingStock: acc.endingStock + Number(row.endingStock || 0),
    totalReductionValue: acc.totalReductionValue + Number(row.totalReductionValue || 0)
  }), { beginningStock: 0, addedStock: 0, reducedStock: 0, endingStock: 0, totalReductionValue: 0 });

  return (
    <div className="rounded-2xl bg-white p-5 text-slate-950 shadow-xl">
      <h3 className="text-sm font-black uppercase tracking-wide text-slate-950">INVENTORY REDUCTION SUMMARY</h3>
      <div className="mt-3 max-h-[72vh] overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="border border-slate-200 px-3 py-2">Product</th>
              <th className="border border-slate-200 px-2 py-2">Beginning Stock (Cases)</th>
              <th className="border border-slate-200 px-2 py-2">Added Stock (Cases)</th>
              <th className="border border-slate-200 px-2 py-2">Reduced (Cases)</th>
              <th className="border border-slate-200 px-2 py-2">Ending Stock (Cases)</th>
              <th className="border border-slate-200 px-2 py-2">Unit Price (PHP)</th>
              <th className="border border-slate-200 px-2 py-2">Total Reduction Value (PHP)</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => (
              <tr key={row.productId || row.productName || idx}>
                <td className="border border-slate-200 px-3 py-2">
                  <div className="flex items-center gap-3">
                    {row.imageUrl ? <img alt="" className="h-10 w-10 rounded bg-white object-contain" src={row.imageUrl} /> : null}
                    <span className="font-black">{row.productName || "-"}</span>
                  </div>
                </td>
                <td className="border border-slate-200 px-2 py-2 text-center">{formatQty(row.beginningStock || 0)}</td>
                <td className="border border-slate-200 px-2 py-2 text-center">{formatQty(row.addedStock || 0)}</td>
                <td className="border border-slate-200 px-2 py-2 text-center font-black text-red-600">{formatQty(row.reducedStock || 0)}</td>
                <td className="border border-slate-200 px-2 py-2 text-center">{formatQty(row.endingStock || 0)}</td>
                <td className="border border-slate-200 px-2 py-2 text-right font-semibold">{money(row.unitPrice || 0)}</td>
                <td className="border border-slate-200 px-2 py-2 text-right font-black">{money(row.totalReductionValue || 0)}</td>
              </tr>
            ))}
            {!displayRows.length ? (
              <tr>
                <td className="border border-slate-200 px-3 py-8 text-center text-slate-500" colSpan={7}>No inventory reductions found for this period.</td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-black">
              <td className="border border-slate-200 px-3 py-3">TOTAL</td>
              <td className="border border-slate-200 px-2 py-3 text-center">{formatQty(totals.beginningStock)}</td>
              <td className="border border-slate-200 px-2 py-3 text-center">{formatQty(totals.addedStock)}</td>
              <td className="border border-slate-200 px-2 py-3 text-center text-red-600">{formatQty(totals.reducedStock)}</td>
              <td className="border border-slate-200 px-2 py-3 text-center">{formatQty(totals.endingStock)}</td>
              <td className="border border-slate-200 px-2 py-3"></td>
              <td className="border border-slate-200 px-2 py-3 text-right text-red-700">{money(totals.totalReductionValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-4 text-xs text-slate-600">Note: Red numbers indicate reduced stock used or sold.</p>
      <div className="ml-auto mt-8 max-w-xs border-t border-slate-400 pt-3 text-xs text-slate-700">Approved By:</div>
    </div>
  );
}

export default function AdminPanel({ isDark, onToggleTheme }) {
  const [route, setRoute] = useState(() => routeFromHash().replace("admin/", ""));
  const [message, setMessage] = useState("");

  useEffect(() => {
    const onHash = () => {
      const r = routeFromHash().replace("admin/", "");
      setRoute(r || "dashboard");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!message) return;
    Toast.toast[message.startsWith("Error") || message.includes("failed") || message.includes("missing") ? "danger" : "success"](message, { timeout: 3000 });
    setMessage("");
  }, [message]);

  if (!getToken()) {
    window.location.hash = "#/home";
    return null;
  }

  const navigate = (r) => go(`admin/${r}`);

  const sidebarItems = [
    { id: "dashboard", label: "Dashboard", icon: <Home size={18} /> },
    { id: "sales", label: "Sales", icon: <TrendingUp size={18} /> },
    { id: "inventory", label: "Inventory", icon: <Warehouse size={18} /> },
    { id: "forecasting", label: "Forecasting", icon: <BarChart3 size={18} /> },
    { id: "orders", label: "Orders", icon: <Package size={18} /> },
    { id: "delivery", label: "Delivery", icon: <Truck size={18} /> },
    { id: "customers", label: "Customers", icon: <Users size={18} /> },
    { id: "staff", label: "Staff Accounts", icon: <Users size={18} /> },
    { id: "rewards", label: "Rewards", icon: <Gift size={18} /> },
    { id: "reports", label: "Reports", icon: <BarChart3 size={18} /> }
  ];

  return (
    <div className={`panel-readable flex min-h-screen transition-colors ${isDark ? "bg-[#080b12] text-slate-100" : "bg-slate-50 text-slate-950"}`}>
      <Toast.Provider placement="top end" maxVisibleToasts={4} />
      <aside className={`fixed left-0 top-0 z-30 h-full w-56 border-r transition-colors max-md:hidden ${isDark ? "border-white/10 bg-[#0c101a]" : "border-slate-200 bg-white"}`}>
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-5">
            <img alt="Jazjo Beverages" className="h-10 w-10 rounded-xl bg-white p-1 object-contain" src={BRAND_LOGO} />
            <div>
              <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-950"}`}>Admin Panel</p>
              <p className="text-[10px] text-slate-500">Jazjo Beverages</p>
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {sidebarItems.map((item) => (
              <Button
                key={item.id}
                fullWidth
                className={`justify-start gap-3 rounded-xl px-3 py-6 text-sm font-semibold transition-all ${
                  route === item.id
                    ? "bg-emerald-500/15 text-emerald-300 shadow-sm shadow-emerald-950/30"
                    : isDark ? "text-slate-400 hover:bg-white/5 hover:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
                variant="light"
                startContent={item.icon}
                onPress={() => navigate(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </nav>
          <div className="border-t border-white/10 p-3">
            <Button
              fullWidth
              variant="light"
              className="justify-start gap-3 rounded-xl px-3 py-6 text-sm font-semibold text-red-400 hover:bg-red-500/10"
              startContent={<LogOut size={18} />}
              onPress={() => { clearSession(); go("home"); }}
            >
              Log Out
            </Button>
          </div>
        </div>
      </aside>
      <div className="flex flex-1 flex-col max-md:ml-0 md:ml-56">
        <header className={`sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur-xl transition-colors ${
          isDark ? "border-white/10 bg-[#080b12]/85" : "border-slate-200 bg-white/85"
        }`}>
          <div className="flex items-center gap-3">
            <h1 className={`text-lg font-black max-md:hidden ${isDark ? "text-white" : "text-slate-950"}`}>
              {sidebarItems.find((item) => item.id === route)?.label || "Dashboard"}
            </h1>
            <div className="flex gap-1 md:hidden">
              {sidebarItems.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={route === item.id ? "flat" : "light"}
                  color={route === item.id ? "success" : "default"}
                  isIconOnly
                  onPress={() => navigate(item.id)}
                >
                  {item.icon}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="light" isIconOnly onPress={onToggleTheme}>
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div key={route} variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2, ease: "easeOut" }}>
              {route === "dashboard" && <AdminDashboardPage setMessage={setMessage} />}
              {route === "sales" && <AdminSalesPage setMessage={setMessage} />}
              {route === "inventory" && <AdminInventoryPage setMessage={setMessage} />}
              {route === "forecasting" && <AdminForecastingPage setMessage={setMessage} />}
              {route === "orders" && <AdminOrdersPage setMessage={setMessage} />}
              {route === "delivery" && <AdminDeliveryPage setMessage={setMessage} />}
              {route === "customers" && <AdminCustomersPage setMessage={setMessage} />}
              {route === "staff" && <AdminStaffAccountsPage setMessage={setMessage} />}
              {route === "rewards" && <AdminRewardsPage setMessage={setMessage} />}
              {route === "reports" && <AdminReportsPage setMessage={setMessage} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function AdminDashboardPage({ setMessage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [orderRange, setOrderRange] = useState("all");
  const [sellerRange, setSellerRange] = useState("all");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiAdminDashboard();
      setData(result);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map((i) => <Card key={i}><CardBody className="space-y-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-28" /></CardBody></Card>)}
        </div>
        <Card><CardBody className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</CardBody></Card>
      </div>
    );
  }
  const kpis = data?.kpis || {};
  const recentOrders = data?.recentOrders || [];
  const orders = data?.orders || recentOrders;
  const customers = data?.customers || [];
  const todayOrders = data?.todayOrders || orders.filter((order) => String(order.createdAtRaw || order.createdAt || "").slice(0, 10) === new Date().toISOString().slice(0, 10));
  const lowStockRows = data?.lowStock || [];
  const outOfStockRows = data?.outOfStock || [];
  const filteredOrders = filterOrdersByRange(orders, orderRange);
  const filteredSellerOrders = filterOrdersByRange(orders, sellerRange);
  const bestSeller = computeBestSeller(filteredSellerOrders);
  const detailRows = {
    orders: filteredOrders,
    customers,
    todaySales: todayOrders,
    bestSeller: filteredSellerOrders.filter((order) => (order.items || []).some((item) => item.name === bestSeller.name)),
    lowStock: lowStockRows,
    outOfStock: outOfStockRows
  };
  const detailTitle = {
    orders: "Order List",
    customers: "Customer List",
    todaySales: "Sales Today",
    bestSeller: "Best Seller Orders",
    lowStock: "Low Stock Products",
    outOfStock: "Out of Stock Products"
  };
  const orderRangeOptions = [
    { value: "today", label: "Today" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "year", label: "Year" },
    { value: "all", label: "All Time" },
  ];
  const sellerRangeOptions = [
    { value: "today", label: "Today" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "year", label: "Year" },
    { value: "all", label: "All" },
  ];
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Orders" value={filteredOrders.length} icon={<ShoppingCart size={20} />} onPress={() => setDetail("orders")} footer={<DashboardRangeSelect ariaLabel="Total orders range" value={orderRange} onChange={setOrderRange} options={orderRangeOptions} />} />
        <KpiCard label="Total Customers" value={kpis.totalCustomers ?? customers.length} icon={<Users size={20} />} onPress={() => setDetail("customers")} />
        <KpiCard label="Sales Today" value={money(kpis.salesToday || 0)} icon={<TrendingUp size={20} />} onPress={() => setDetail("todaySales")} />
        <KpiCard label="Best Seller" value={bestSeller.name || "N/A"} icon={<BarChart3 size={20} />} onPress={() => setDetail("bestSeller")} footer={<DashboardRangeSelect ariaLabel="Best seller range" value={sellerRange} onChange={setSellerRange} options={sellerRangeOptions} />} />
        <KpiCard label="Total Sales" value={money(kpis.totalSales)} icon={<CreditCard size={20} />} />
        <KpiCard label="Low Stock" value={kpis.lowStockCount || 0} icon={<Warehouse size={20} />} onPress={() => setDetail("lowStock")} />
        <KpiCard label="Out of Stock" value={kpis.outOfStockCount || 0} icon={<Box size={20} />} onPress={() => setDetail("outOfStock")} />
      </div>
      <Card>
        <CardHeader><h2 className="text-lg font-black">Recent Orders</h2></CardHeader>
        <CardBody>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-slate-400">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead><Th>ORDER ID</Th><Th>CUSTOMER</Th><Th>TOTAL</Th><Th>STATUS</Th></THead>
                <TBody>
                  {recentOrders.map((order, idx) => (
                    <Tr key={order.id || idx}>
                      <Td><span className="font-semibold">{order.id}</span></Td>
                      <Td>{order.customerName || "Customer"}</Td>
                      <Td>{money(order.total)}</Td>
                      <Td><Chip color={order.status === "Delivered" ? "success" : order.status === "Cancelled" ? "danger" : "warning"} variant="flat" size="sm">{statusLabel(order.status)}</Chip></Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
      <Modal isOpen={!!detail} onOpenChange={() => setDetail(null)}>
        <Modal.Backdrop>
          <Modal.Container size="3xl">
            <Modal.Dialog className="themed-modal-shell">
              <Modal.Header>
                <h2 className="text-lg font-black text-white">{detailTitle[detail] || "Details"}</h2>
              </Modal.Header>
              <Modal.Body>
                <div className="max-h-[60vh] overflow-auto">
                  {detail === "customers" ? (
                    <Table>
                      <THead><Th>NAME</Th><Th>EMAIL</Th><Th>CONTACT</Th></THead>
                      <TBody>
                        {(detailRows.customers || []).map((customer, idx) => (
                          <Tr key={customer.user_id || customer.email || idx}>
                            <Td>{customer.full_name || customer.name || "Customer"}</Td>
                            <Td className="text-sm text-slate-400">{customer.email || "-"}</Td>
                            <Td>{customer.contact || "-"}</Td>
                          </Tr>
                        ))}
                      </TBody>
                    </Table>
                  ) : detail === "lowStock" || detail === "outOfStock" ? (
                    <Table>
                      <THead><Th>PRODUCT</Th><Th>CURRENT STOCK</Th><Th>CATEGORY</Th><Th>STATUS</Th></THead>
                      <TBody>
                        {(detailRows[detail] || []).map((product, idx) => (
                          <Tr key={product.id || product.name || idx}>
                            <Td>{product.name}</Td>
                            <Td>{formatQty(product.stockCases)} cases</Td>
                            <Td>{product.category || "-"}</Td>
                            <Td>{product.status || "Low Stock"}</Td>
                          </Tr>
                        ))}
                      </TBody>
                    </Table>
                  ) : (
                    <Table>
                      <THead><Th>ORDER</Th><Th>CUSTOMER</Th><Th>DATE</Th><Th>ITEMS</Th><Th>TOTAL</Th><Th>STATUS</Th></THead>
                      <TBody>
                        {(detailRows[detail] || []).map((order, idx) => (
                          <Tr key={order.id || idx}>
                            <Td><span className="font-semibold">{order.id}</span></Td>
                            <Td>{order.customerName || "Customer"}</Td>
                            <Td className="text-sm text-slate-400">{order.createdAt || "-"}</Td>
                            <Td className="text-sm text-slate-400">{(order.items || []).map((item) => `${item.name} x${formatQty(item.qty)}`).join(", ") || "-"}</Td>
                            <Td>{money(order.total)}</Td>
                            <Td>{statusLabel(order.status)}</Td>
                          </Tr>
                        ))}
                      </TBody>
                    </Table>
                  )}
                  {!(detailRows[detail] || []).length ? <p className="p-3 text-sm text-slate-400">No records found.</p> : null}
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="flat" onPress={() => setDetail(null)}>Close</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </motion.div>
  );
}

function AdminSalesPage({ setMessage }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("daily");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiAdminSales();
      setData(result);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-4">
          {[1,2,3,4,5].map((i) => <Card key={i}><CardBody className="space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-7 w-24" /></CardBody></Card>)}
        </div>
      </div>
    );
  }
  const kpis = data?.kpis || {};
  const chart = data?.chart || {};
  const dailyRows = data?.dailyRows || [];
  const maxChartSales = Math.max(...(chart.points || []).map((x) => Number(x.sales || 0)), 1);
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="grid gap-4 sm:grid-cols-5">
        <KpiCard label="Today's Sales" value={money(kpis.todaySales)} icon={<TrendingUp size={18} />} />
        <KpiCard label="Transactions" value={kpis.transactions || 0} icon={<ShoppingCart size={18} />} />
        <KpiCard label="Best Seller" value={kpis.bestSeller || "N/A"} icon={<BarChart3 size={18} />} />
        <KpiCard label="Refunds" value={kpis.refunds || 0} icon={<CreditCard size={18} />} />
        <KpiCard label="Avg Order" value={money(kpis.avgOrderValue)} icon={<Box size={18} />} />
      </div>
      {chart.points?.length > 0 ? (
        <Card>
          <CardHeader><h2 className="text-lg font-black">{chart.title || "Sales Trend"}</h2></CardHeader>
          <CardBody>
            <div className="grid min-h-56 grid-cols-7 items-end gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-4">
              {chart.points.map((p, idx) => {
                const sales = Number(p.sales || 0);
                const h = sales > 0 ? Math.max((sales / maxChartSales) * 100, 12) : 4;
                return (
                  <Tooltip key={p.key || idx} content={`${p.date || p.label}: ${money(p.sales)} - ${p.orders || 0} order(s)`} placement="top" showArrow>
                    <div className="flex h-44 min-w-0 flex-col items-center justify-end gap-2" aria-label={`${p.label} sales ${money(sales)} from ${p.orders || 0} orders`}>
                      <span className="w-full truncate text-center text-[10px] font-semibold text-emerald-200">{money(sales)}</span>
                      <span className="w-full truncate text-center text-[10px] font-semibold text-slate-400">{p.orders || 0} order(s)</span>
                      <div className="chart-bar-track flex h-32 w-full items-end overflow-hidden rounded-t-lg bg-white/[.04]">
                        <div className="w-full rounded-t-lg bg-emerald-400 shadow-lg shadow-emerald-950/30 transition-all hover:bg-emerald-300" style={{ height: `${h}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-500">{p.label}</span>
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader><h2 className="text-lg font-black">Daily Sales by Date</h2></CardHeader>
        <CardBody>
          {dailyRows.length === 0 ? (
            <p className="text-sm text-slate-400">No data available.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead><Th>DATE</Th><Th>TOTAL ORDERS</Th><Th>SALES</Th></THead>
                <TBody>
                  {dailyRows.map((row, idx) => (
                    <Tr key={idx}>
                      <Td><span className="font-semibold">{row.date || row.label}</span></Td>
                      <Td>{row.orders || 0}</Td>
                      <Td>{money(row.sales)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </motion.div>
  );
}

function AdminOrdersPage({ setMessage }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deletingOrder, setDeletingOrder] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [savingPreparation, setSavingPreparation] = useState(false);
  const [submittingPrepare, setSubmittingPrepare] = useState(false);
  const perPage = 10;
  const statuses = ["All", "Pending Payment", "Order Placed", "Preparing", "In Transit", "Out for Delivery", "Delivered", "Cancelled"];
  const [pagination, setPagination] = useState({ page: 1, perPage, total: 0, totalPages: 1 });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiAdminOrders({ page, perPage, status: filter, search });
      setOrders(result.orders || []);
      setPagination(result.pagination || { page, perPage, total: result.orders?.length || 0, totalPages: 1 });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter, page, search]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filter, search]);
  const totalPages = Math.max(1, Number(pagination.totalPages || 1));
  const safePage = Math.min(page, totalPages);
  const paged = orders;
  const canGoPrevious = safePage > 1;
  const canGoNext = safePage < totalPages;
  const pageControls = (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="flat" isDisabled={!canGoPrevious || loading} onPress={() => setPage((current) => Math.max(1, current - 1))}>
        Previous
      </Button>
      <Chip size="sm" variant="flat">Page {safePage} of {totalPages}</Chip>
      <Button size="sm" color="success" variant="flat" isDisabled={!canGoNext || loading} onPress={() => setPage((current) => Math.min(totalPages, current + 1))}>
        Next
      </Button>
    </div>
  );
  const updateStatus = async (orderCode, newStatus) => {
    try {
      await apiUpdateOrderStatus(orderCode, newStatus);
      setMessage(`Order ${orderCode} marked as ${newStatus}.`);
      await load();
      if (selectedOrder?.id === orderCode) {
        const refreshed = await apiAdminOrders({ page: 1, perPage: 10000, status: "All", search: orderCode });
        setSelectedOrder((refreshed.orders || []).find((order) => order.id === orderCode) || null);
      }
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  };
  const removeOrder = async (orderCode) => {
    if (!window.confirm(`Remove order ${orderCode}? This cannot be undone.`)) return;
    setDeletingOrder(orderCode);
    try {
      await apiAdminDeleteOrder(orderCode);
      setMessage(`Order ${orderCode} removed.`);
      load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setDeletingOrder("");
    }
  };
  const bulkDeleteByStatus = async () => {
    if (filter === "All") {
      setMessage("Choose a specific status before bulk deleting orders.");
      return;
    }
    const total = Number(pagination.total || 0);
    if (!window.confirm(`Delete all ${filter} orders${total ? ` (${total})` : ""}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      let deletedCount = 0;
      try {
        const result = await apiAdminBulkDeleteOrdersByStatus(filter);
        deletedCount = result.deleted || 0;
      } catch (err) {
        if (!/not found|404/i.test(String(err.message || ""))) throw err;
        const result = await apiAdminOrders({ page: 1, perPage: 10000, status: filter, search: "" });
        for (const order of result.orders || []) {
          await apiAdminDeleteOrder(order.id);
          deletedCount += 1;
        }
      }
      setMessage(`${deletedCount} ${filter} order(s) removed.`);
      setPage(1);
      load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setBulkDeleting(false);
    }
  };
  const nextStatus = (current) => {
    const label = statusLabel(current);
    const map = {
      "Order Placed": "Preparing",
      "Preparing": "In Transit",
      "In Transit": "Out for Delivery",
      "Out for Delivery": "Delivered"
    };
    return map[label] || null;
  };
  const openInvoice = async (orderCode) => {
    setLoadingInvoice(true);
    try {
      const data = await apiOrderInvoice(orderCode);
      setInvoice(data);
      openPrintableHtml(buildInvoiceHtml(data));
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoadingInvoice(false);
    }
  };
  const updatePreparation = async (productId, prepared) => {
    if (!selectedOrder) return;
    const currentItems = getPreparationSummary(selectedOrder).items;
    const nextItems = currentItems.map((item) => item.productId === productId ? { ...item, prepared } : item);
    setSavingPreparation(true);
    try {
      const order = await apiUpdateOrderPreparation(selectedOrder.id, nextItems.map((item) => ({ productId: item.productId, prepared: item.prepared })));
      setSelectedOrder(order);
      setMessage("Preparation progress updated.");
      await load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSavingPreparation(false);
    }
  };
  const submitPreparation = async () => {
    if (!selectedOrder) return;
    setSubmittingPrepare(true);
    try {
      const order = await apiPrepareOrder(selectedOrder.id);
      setSelectedOrder(order);
      setMessage(`Order ${selectedOrder.id} moved to Preparing.`);
      await load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSubmittingPrepare(false);
    }
  };
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">Order Management</h2>
            <p className="text-sm text-slate-400">
              {pagination.total || 0} order(s) - Page {safePage} of {totalPages}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[520px] sm:flex-row sm:items-center">
            <HeroInput
              aria-label="Search orders"
              placeholder="Search order ID, customer, item..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              startContent={<Search size={16} />}
              size="sm"
            />
            <Button size="sm" variant="flat" startContent={<RefreshCw size={14} />} onPress={load}>Refresh</Button>
            <Button
              size="sm"
              color="danger"
              variant="flat"
              startContent={<Trash2 size={14} />}
              isDisabled={filter === "All" || bulkDeleting || !pagination.total}
              isLoading={bulkDeleting}
              onPress={bulkDeleteByStatus}
            >
              Delete {filter === "All" ? "by Status" : filter}
            </Button>
          </div>
        </CardBody>
      </Card>
      <Tabs selectedKey={filter} onSelectionChange={(key) => setFilter(String(key))} color="success" variant="underlined" size="sm">
        <Tabs.List className="gap-0 overflow-x-auto border-b border-white/10">
          {statuses.map((s) => (
            <Tabs.Tab id={s} key={s} className="min-w-max px-3 py-2 data-[selected=true]:text-emerald-400">
              <span className="text-xs">{s}</span>
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      {loading ? (
        <Card><CardBody className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</CardBody></Card>
      ) : paged.length === 0 ? (
        <Card><CardBody><p className="text-sm text-slate-400">No orders found.</p></CardBody></Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">
              Showing {(safePage - 1) * perPage + 1}-{Math.min(safePage * perPage, Number(pagination.total || 0))} of {pagination.total || 0}
            </p>
            {pageControls}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <THead><Th>ORDER ID</Th><Th>DATE</Th><Th>CUSTOMER</Th><Th>FULFILLMENT</Th><Th>PAYMENT</Th><Th>TOTAL</Th><Th>STATUS</Th><Th>ACTION</Th></THead>
              <TBody>
                {paged.map((order, idx) => {
                  const next = nextStatus(order.status);
                  return (
                    <Tr key={order.id || idx}>
                      <Td><span className="font-semibold">{order.id}</span></Td>
                      <Td className="text-sm text-slate-400">{order.createdAt || "-"}</Td>
                      <Td>{order.customerName || "Customer"}</Td>
                      <Td><FulfillmentChip value={order.fulfillmentType} /></Td>
                      <Td><PaymentMethodChip method={order.paymentMethod} /></Td>
                      <Td className="font-semibold">{money(order.total)}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <OrderStatusChip status={order.status} />
                          <PaymentStatusChip order={order} />
                        </div>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-2">
                          {next ? (
                            <Button size="sm" color="success" variant="flat" onPress={() => updateStatus(order.id, next)}>
                              {next}
                            </Button>
                          ) : null}
                          <Button size="sm" variant="flat" onPress={() => openInvoice(order.id)} isLoading={loadingInvoice && invoice?.orderNumber !== order.id}>
                            Sales Invoice
                          </Button>
                          <Tooltip content="View order details" placement="top" showArrow>
                            <Button size="sm" variant="light" isIconOnly onPress={() => setSelectedOrder(order)}>
                              <Eye size={14} />
                            </Button>
                          </Tooltip>
                          <Tooltip content="Remove order" placement="top" showArrow>
                            <Button
                              size="sm"
                              color="danger"
                              variant="light"
                              isIconOnly
                              isDisabled={deletingOrder === order.id}
                              onPress={() => removeOrder(order.id)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </Tooltip>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </div>
          <div className="flex justify-center">
            {pageControls}
          </div>
        </>
      )}
      <Modal isOpen={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <Modal.Backdrop>
          <Modal.Container size="2xl">
            <Modal.Dialog>
              <Modal.Header>
                <div>
                  <p className="text-xs font-bold uppercase text-emerald-300">Order Details</p>
                  <h2 className="text-lg font-black text-white">{selectedOrder?.id}</h2>
                </div>
              </Modal.Header>
              <Modal.Body className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Customer</p>
                    <p className="mt-1 font-semibold text-white">{selectedOrder?.customerName || "Customer"}</p>
                    <p className="text-sm text-slate-400">{selectedOrder?.contact || "No contact"}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Payment</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <PaymentMethodChip method={selectedOrder?.paymentMethod} />
                      <PaymentStatusChip order={selectedOrder} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Date</p>
                    <p className="mt-1 text-sm font-semibold text-white">{selectedOrder?.createdAt || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Fulfillment</p>
                    <div className="mt-2"><FulfillmentChip value={selectedOrder?.fulfillmentType} /></div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Status</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <OrderStatusChip status={selectedOrder?.status} />
                      <PaymentStatusChip order={selectedOrder} />
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">
                    {String(selectedOrder?.fulfillmentType || "").toLowerCase() === "pickup" ? "Pickup Location" : "Delivery Address"}
                  </p>
                  <p className="mt-1 text-sm text-slate-200">{selectedOrder?.address || "No address"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Items</p>
                    <strong className="text-white">{money(selectedOrder?.total || 0)}</strong>
                  </div>
                  <div className="grid gap-2">
                    {(selectedOrder?.items || []).map((item, idx) => (
                      <div key={`${item.productId || item.name}-${idx}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/50 p-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                          <p className="text-xs text-slate-500">{formatQty(item.qty)} case(s)</p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-white">{money(Number(item.price || 0) * Number(item.qty || 0))}</p>
                      </div>
                    ))}
                    {!(selectedOrder?.items || []).length ? (
                      <p className="text-sm text-slate-400">No order items found.</p>
                    ) : null}
                  </div>
                </div>
                {statusLabel(selectedOrder?.status) === "Order Placed" || statusLabel(selectedOrder?.status) === "Preparing" ? (
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[.05] p-4">
                    {getPreparationSummary(selectedOrder).items.length === 0 ? (
                      <p className="mb-4 text-sm text-slate-300">Preparation items are loading from the order details.</p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase text-emerald-300">Order Preparation</p>
                        <p className="mt-1 text-sm text-slate-300">
                          {getPreparationSummary(selectedOrder).preparedItems} / {getPreparationSummary(selectedOrder).totalItems} Items Prepared
                        </p>
                      </div>
                      <Chip color="success" variant="flat" size="sm">{getPreparationSummary(selectedOrder).percent}%</Chip>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${getPreparationSummary(selectedOrder).percent}%` }} />
                    </div>
                    <div className="mt-4 grid gap-3">
                      {getPreparationSummary(selectedOrder).items.map((item) => (
                        <label key={item.productId || item.name} className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 text-sm">
                          <div className="flex items-start gap-3">
                            <input type="checkbox" checked={item.prepared === true} disabled={savingPreparation || submittingPrepare} onChange={(event) => updatePreparation(item.productId, event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-400" />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-white">{item.name}</p>
                              <p className="text-xs text-slate-400">Ordered: {formatQty(item.qty)} Cases</p>
                              {item.validationMessage ? <p className="mt-1 text-xs font-semibold text-red-400">{item.validationMessage}</p> : null}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-400">
                        {selectedOrder?.preparedBy ? `Prepared by ${selectedOrder.preparedBy}` : "Prepared by will be recorded when the order is fully prepared."}
                      </div>
                      <Button color="success" onPress={submitPreparation} isDisabled={!getPreparationSummary(selectedOrder).completed} isLoading={submittingPrepare}>
                        Prepare Order
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="flat" onPress={() => setSelectedOrder(null)}>Close</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </motion.div>
  );
}

function AdminInventoryPage({
  setMessage,
  inventoryApi = apiAdminInventory,
  ordersApi = apiAdminOrders,
  createCategoryApi = apiAdminCreateCategory,
  deleteCategoryApi = apiAdminDeleteCategory,
  createProductApi = apiAdminCreateProduct,
  uploadProductImageApi = apiAdminUploadProductImage,
  restockApi = apiAdminRestock,
  updateProductApi = apiAdminUpdateProduct,
  deleteProductApi = apiAdminDeleteProduct,
}) {
  const [inventory, setInventory] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [categories, setCategories] = useState([]);
  const [forecastRows, setForecastRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [addCategoryName, setAddCategoryName] = useState("");
  const [deletingCategory, setDeletingCategory] = useState("");
  const [showRestock, setShowRestock] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", category: "", unit: "case", price: "", stockCases: "", quantityPerCase: "1" });
  const [productImagePreview, setProductImagePreview] = useState("");
  const [productImageFile, setProductImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [restockProduct, setRestockProduct] = useState({ name: "", addCases: "" });
  const [showEditProduct, setShowEditProduct] = useState(null);
  const [editOriginalName, setEditOriginalName] = useState("");
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const perPage = 10;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, ordersResult] = await Promise.all([inventoryApi(), ordersApi({ perPage: 500 })]);
      setInventory(result.inventory || []);
      setLowStock(result.lowStock || []);
      setCategories(result.categories || []);
      setForecastRows(createDemandForecast(result.inventory || [], ordersResult.orders || [], { horizonDays: 5 }).slice(0, 5));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const filtered = useMemo(() => {
    if (!search) return inventory;
    return inventory.filter((p) => p.name?.toLowerCase().includes(search.toLowerCase()));
  }, [inventory, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  useEffect(() => { setPage(1); }, [search]);
  const addCategory = async () => {
    if (!addCategoryName.trim()) return;
    try {
      const result = await createCategoryApi(addCategoryName.trim());
      setCategories(result.categories || []);
      setAddCategoryName("");
      setMessage(`Category "${addCategoryName.trim()}" added.`);
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  };
  const removeCategory = async (name) => {
    if (!window.confirm(`Remove category "${name}"? Products in this category will become uncategorized.`)) return;
    setDeletingCategory(name);
    try {
      const result = await deleteCategoryApi(name);
      setCategories(result.categories || []);
      setMessage(`Category "${name}" removed.`);
      load();
    } catch (err) {
      if (/404|not found/i.test(err.message || "")) {
        setMessage("Error: category remove route not found. Restart the Node server to load the latest backend code.");
        return;
      }
      setMessage(`Error: ${err.message}`);
    } finally {
      setDeletingCategory("");
    }
  };
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProductImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setProductImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };
  const addProduct = async () => {
    if (!newProduct.name.trim() || !newProduct.category) return setMessage("Product name and category are required.");
    const quantityPerCase = Number(newProduct.quantityPerCase || 1);
    if (!Number.isInteger(quantityPerCase) || quantityPerCase <= 0) return setMessage("Quantity per Case must be a positive integer.");
    setUploading(true);
    try {
        let imageUrl = "";
      if (productImageFile && productImagePreview) {
        const uploaded = await uploadProductImageApi(productImagePreview, productImageFile.name);
        imageUrl = uploaded?.imageUrl || "";
      }
      await createProductApi({
        name: newProduct.name.trim(),
        category: newProduct.category,
        unit: newProduct.unit || "case",
        price: Number(newProduct.price) || 0,
        stockCases: Number(newProduct.stockCases) || 0,
        quantityPerCase,
        imageUrl: imageUrl || undefined
      });
      setNewProduct({ name: "", category: "", unit: "case", price: "", stockCases: "", quantityPerCase: "1" });
      setProductImagePreview("");
      setProductImageFile(null);
      setMessage(`Product "${newProduct.name}" created.`);
      load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };
  const doRestock = async () => {
    const stockToAdd = Number(restockProduct.addCases);
    if (!restockProduct.name || !restockProduct.addCases) return setMessage("Select a product and enter the stock quantity.");
    if (!Number.isFinite(stockToAdd) || stockToAdd <= 0) return setMessage("Stock quantity must be greater than 0.");
    try {
      await restockApi(restockProduct.name, stockToAdd);
      setShowRestock(false);
      setRestockProduct({ name: "", addCases: "" });
      setMessage(`Restocked ${restockProduct.name}.`);
      load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  };
  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteProductApi(confirmDelete.name);
      setConfirmDelete(null);
      setMessage(`Product "${confirmDelete.name}" deleted.`);
      load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  };
  const handleEditImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setEditImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };
  const saveEdit = async () => {
    if (!showEditProduct) return;
    try {
      let imageUrl = showEditProduct.image_url?.trim() || null;
      if (editImageFile && editImagePreview) {
        const uploaded = await uploadProductImageApi(editImagePreview, editImageFile.name);
        imageUrl = uploaded?.imageUrl || imageUrl;
      }
      const body = {};
      if (showEditProduct.name !== editOriginalName) body.name = showEditProduct.name;
      body.category = showEditProduct.category;
      body.unit = showEditProduct.unit || "case";
      body.price = Number(showEditProduct.price) || 0;
      body.stockCases = Number(showEditProduct.stockCases) || 0;
      body.quantityPerCase = Number(showEditProduct.quantityPerCase) || 1;
      if (!Number.isInteger(body.quantityPerCase) || body.quantityPerCase <= 0) {
        setMessage("Quantity per Case must be a positive integer.");
        return;
      }
      body.imageUrl = imageUrl;
      body.isActive = showEditProduct.isActive;
      await updateProductApi(editOriginalName, body);
      setShowEditProduct(null);
      setEditOriginalName("");
      setEditImageFile(null);
      setEditImagePreview("");
      setMessage(`Product "${showEditProduct.name}" updated.`);
      load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  };
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody className="gap-3">
            <h3 className="text-sm font-bold">Add Category</h3>
            <div className="flex gap-2">
              <HeroInput placeholder="Category name" value={addCategoryName} onChange={(e) => setAddCategoryName(e.target.value)} size="sm" />
              <Button size="sm" color="success" isIconOnly onPress={addCategory}><Plus size={14} /></Button>
            </div>
            {categories.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex min-h-6 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-slate-100"
                  >
                    <span>{cat}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${cat}`}
                      className="grid h-4 w-4 place-items-center rounded-full text-slate-400 transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
                      disabled={deletingCategory === cat}
                      onClick={() => removeCategory(cat)}
                    >
                      <Trash2 size={10} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardBody className="gap-3">
            <h3 className="text-sm font-bold">Restock</h3>
            <Button color="warning" variant="flat" onPress={() => setShowRestock(true)} startContent={<Plus size={14} />}>Add Stock</Button>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-bold">Add Product</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <HeroInput
              label="Product name"
              placeholder="e.g. C2 Apple"
              value={newProduct.name}
              onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
              className="sm:col-span-2"
            />
            <label className="grid gap-1.5 text-sm font-semibold text-slate-300">
              <span>Category</span>
              <select
                className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[.06] px-3 text-sm text-slate-50 outline-none"
                value={newProduct.category}
                onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
              >
                <option value="" className="bg-slate-900 text-slate-400">Select category</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat} className="bg-slate-900 text-slate-50">{cat}</option>
                ))}
              </select>
            </label>
            <HeroInput label="Unit" value={newProduct.unit} onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })} />
            <label className="grid gap-1.5 text-sm font-semibold text-slate-300">
              <span>Price (per case)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[.06] px-3 text-sm text-slate-50 outline-none"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-300">
              <span>Initial stock (cases)</span>
              <input
                type="number"
                min="0"
                step="1"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[.06] px-3 text-sm text-slate-50 outline-none"
                value={newProduct.stockCases}
                onChange={(e) => setNewProduct({ ...newProduct, stockCases: e.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-300">
              <span>Quantity per Case</span>
              <input
                type="number"
                min="1"
                step="1"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[.06] px-3 text-sm text-slate-50 outline-none"
                value={newProduct.quantityPerCase}
                onChange={(e) => setNewProduct({ ...newProduct, quantityPerCase: e.target.value })}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1">
              <p className="mb-1.5 text-sm font-semibold text-slate-300">Product image</p>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[.06] px-4 py-3 text-sm text-slate-400 hover:border-white/20">
                <span>{productImageFile ? productImageFile.name : "Choose file"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              </label>
            </div>
            {productImagePreview ? (
              <img src={productImagePreview} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-white/10 bg-transparent object-contain" />
            ) : null}
            <Button color="success" onPress={addProduct} isLoading={uploading}>
              {uploading ? "Uploading..." : "Add Product"}
            </Button>
          </div>
        </CardBody>
      </Card>
      <div className="flex items-center gap-3">
        <HeroInput placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} startContent={<Search size={16} />} size="sm" className="max-w-xs" />
        <Chip variant="flat" size="sm">{filtered.length} products</Chip>
        <Button size="sm" variant="light" isIconOnly onPress={load}><RefreshCw size={14} /></Button>
      </div>
      {loading ? (
        <Card><CardBody className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</CardBody></Card>
      ) : paged.length === 0 ? (
        <Card><CardBody><p className="text-sm text-slate-400">No products found.</p></CardBody></Card>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <THead><Th>IMAGE</Th><Th>PRODUCT</Th><Th>CATEGORY</Th><Th>PRICE</Th><Th>STOCK</Th><Th>QTY/CASE</Th><Th>STATUS</Th><Th>ACTION</Th></THead>
              <TBody>
                {paged.map((p, idx) => (
                  <Tr key={p.id || p.sku || idx}>
                    <Td>
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="h-10 w-10 rounded-lg bg-transparent object-contain" />
                      ) : (
                        <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/5 text-[10px] text-slate-500">{p.name?.charAt(0) || "?"}</div>
                      )}
                    </Td>
                    <Td><span className="font-semibold">{p.name}</span></Td>
                    <Td>{p.category || "-"}</Td>
                    <Td>{money(p.price)}</Td>
                    <Td>{formatQty(p.stockCases)} cases</Td>
                    <Td>{Number(p.quantityPerCase || 1).toLocaleString()}</Td>
                    <Td>
                      <Chip
                        color={p.status === "In Stock" ? "success" : p.status === "Low Stock" ? "warning" : "danger"}
                        variant="flat"
                        size="sm"
                      >
                        {p.status || (p.stockCases > 10 ? "In Stock" : p.stockCases > 0 ? "Low Stock" : "Out of Stock")}
                      </Chip>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button size="sm" variant="light" isIconOnly onPress={() => { setShowEditProduct({ ...p, isActive: p.is_active ?? true }); setEditOriginalName(p.name); }}>
                          <Eye size={14} />
                        </Button>
                        <Button size="sm" variant="light" isIconOnly color="danger" onPress={() => setConfirmDelete(p)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Page {safePage} of {totalPages} &bull; {filtered.length} row(s)</span>
            <div className="flex gap-1">
              <Button size="sm" variant="light" isDisabled={safePage <= 1} onPress={() => setPage(safePage - 1)}>Prev</Button>
              <Button size="sm" variant="light" isDisabled={safePage >= totalPages} onPress={() => setPage(safePage + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><h2 className="text-lg font-black">ARIMA Forecast Summary</h2></CardHeader>
          <CardBody className="space-y-3">
            <p className="text-xs text-slate-500">Next 5 days demand forecast from order history and recent demand trend.</p>
            {forecastRows.length ? (
              <div className="grid gap-2">
                {forecastRows.map((row) => (
                  <div key={row.name} className="grid gap-2 rounded-xl border border-white/10 bg-white/[.03] p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.model}</p>
                    </div>
                    <Chip color="success" variant="flat" size="sm">{formatQty(row.forecastCases)} forecast</Chip>
                    <Chip color={row.recommendedRestock > 0 ? "warning" : "default"} variant="flat" size="sm">
                      Restock {formatQty(row.recommendedRestock)}
                    </Chip>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No order history yet for forecasting.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><h2 className="text-lg font-black text-amber-300">Low Stock Alerts</h2></CardHeader>
          <CardBody>
            {lowStock.length === 0 ? (
              <p className="text-sm text-slate-400">All products are well-stocked.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead><Th>PRODUCT</Th><Th>STOCK</Th><Th>STATUS</Th></THead>
                  <TBody>
                    {lowStock.map((p, idx) => (
                      <Tr key={p.id || p.sku || idx}>
                        <Td><span className="font-semibold">{p.name}</span></Td>
                        <Td>{formatQty(p.stockCases)} cases</Td>
                        <Td>
                          <Chip
                            color={p.status === "Out of Stock" ? "danger" : "warning"}
                            variant="flat"
                            size="sm"
                          >
                            {p.status}
                          </Chip>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal isOpen={showRestock} onOpenChange={setShowRestock}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.Header><h2 className="text-lg font-black text-white">Restock Product</h2></Modal.Header>
              <Modal.Body className="space-y-4">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-300">
                  <span>Product *</span>
                  <select
                    className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[.06] px-3 text-sm text-slate-50 outline-none"
                    value={restockProduct.name}
                    onChange={(e) => setRestockProduct({ ...restockProduct, name: e.target.value })}
                  >
                    <option value="" className="bg-slate-900 text-slate-400">Select product</option>
                    {inventory.map((p) => (
                      <option key={p.name} value={p.name} className="bg-slate-900 text-slate-50">{p.name} ({formatQty(p.stockCases)} cases)</option>
                    ))}
                  </select>
                </label>
                {restockProduct.name ? (
                  <div className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm">
                    <span className="text-slate-400">Current stock: </span>
                    <span className="font-semibold text-white">{formatQty(inventory.find((p) => p.name === restockProduct.name)?.stockCases || 0)} cases</span>
                    {Number(restockProduct.addCases) > 0 ? (
                      <span className="ml-2 text-emerald-400">
                        &rarr; {formatQty((inventory.find((p) => p.name === restockProduct.name)?.stockCases || 0) + Number(restockProduct.addCases))} cases after
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <HeroInput
                  label="Stock quantity *"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Enter number of cases"
                  value={restockProduct.addCases}
                  onChange={(e) => setRestockProduct({ ...restockProduct, addCases: e.target.value })}
                />
              </Modal.Body>
              <Modal.Footer>
                <Button variant="flat" onPress={() => setShowRestock(false)}>Cancel</Button>
                <Button color="warning" onPress={doRestock}>Restock Now</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <Modal isOpen={!!showEditProduct} onOpenChange={() => { setShowEditProduct(null); setEditOriginalName(""); setEditImageFile(null); setEditImagePreview(""); }}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.Header><h2 className="text-lg font-black text-white">Edit Product</h2></Modal.Header>
              <Modal.Body className="space-y-4">
                <div className="flex items-center gap-4">
                  {editImagePreview ? (
                    <img src={editImagePreview} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-white/10 bg-transparent object-contain" />
                  ) : showEditProduct?.image_url ? (
                    <img src={showEditProduct.image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-white/10 bg-transparent object-contain" onError={(e) => { e.target.style.display = "none" }} />
                  ) : (
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white/5 text-lg font-bold text-slate-500">{showEditProduct?.name?.charAt(0) || "?"}</div>
                  )}
                  <div>
                    <p className="text-xs text-slate-500">SKU: {showEditProduct?.sku || "-"}</p>
                    <p className="text-xs text-slate-500">Current stock: <span className="font-semibold text-white">{formatQty(showEditProduct?.stockCases || 0)} cases</span></p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <HeroInput label="Name" value={showEditProduct?.name || ""} onChange={(e) => setShowEditProduct({ ...showEditProduct, name: e.target.value })} className="sm:col-span-2" />
                  <label className="grid gap-1.5 text-sm font-semibold text-slate-300">
                    <span>Category</span>
                    <select
                      className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[.06] px-3 text-sm text-slate-50 outline-none"
                      value={showEditProduct?.category || ""}
                      onChange={(e) => setShowEditProduct({ ...showEditProduct, category: e.target.value })}
                    >
                      <option value="" className="bg-slate-900 text-slate-400">Select category</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat} className="bg-slate-900 text-slate-50">{cat}</option>
                      ))}
                    </select>
                  </label>
                  <HeroInput label="Unit" value={showEditProduct?.unit || "case"} onChange={(e) => setShowEditProduct({ ...showEditProduct, unit: e.target.value })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <HeroInput label="Price" type="number" value={showEditProduct?.price ?? ""} onChange={(e) => setShowEditProduct({ ...showEditProduct, price: Number(e.target.value) })} startContent={<span className="text-xs text-slate-500">PHP</span>} />
                  <HeroInput label="Stock (cases)" type="number" value={showEditProduct?.stockCases ?? ""} onChange={(e) => setShowEditProduct({ ...showEditProduct, stockCases: Number(e.target.value) })} />
                  <HeroInput label="Quantity per Case" type="number" min="1" value={showEditProduct?.quantityPerCase ?? 1} onChange={(e) => setShowEditProduct({ ...showEditProduct, quantityPerCase: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-300">Product image</p>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[.06] px-4 py-2.5 text-sm text-slate-400 hover:border-white/20">
                      <span>{editImageFile ? editImageFile.name : "Choose file"}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleEditImageSelect} />
                    </label>
                    {!editImageFile && showEditProduct?.image_url ? (
                      <Button size="sm" variant="flat" color="danger" onPress={() => setShowEditProduct({ ...showEditProduct, image_url: "" })}>
                        Remove image
                      </Button>
                    ) : null}
                  </div>
                  {!editImageFile && showEditProduct?.image_url ? (
                    <HeroInput label="Or enter image URL" value={showEditProduct.image_url || ""} onChange={(e) => setShowEditProduct({ ...showEditProduct, image_url: e.target.value })} placeholder="https://..." />
                  ) : null}
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="flat" onPress={() => { setShowEditProduct(null); setEditOriginalName(""); setEditImageFile(null); setEditImagePreview(""); }}>Cancel</Button>
                <Button color="success" onPress={saveEdit}>Save Changes</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <Modal isOpen={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <Modal.Backdrop>
          <Modal.Container size="xs">
            <Modal.Dialog>
              <Modal.Header><h2 className="text-lg font-black text-white">Delete Product</h2></Modal.Header>
              <Modal.Body>
                <p className="text-sm text-slate-400">
                  Are you sure you want to delete <strong className="text-slate-200">{confirmDelete?.name}</strong>?
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="flat" onPress={() => setConfirmDelete(null)}>Cancel</Button>
                <Button color="danger" onPress={doDelete}>Delete</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </motion.div>
  );
}

function AdminDeliveryPage({ setMessage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const perPage = 10;
  const load = useCallback(async () => {
    try {
      const result = await apiAdminDelivery();
      setData(result);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);
  const tracks = collapseDeliveryTracks(data?.productTracks || []);
  const totalPages = Math.max(1, Math.ceil(tracks.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paged = tracks.slice((safePage - 1) * perPage, safePage * perPage);
  const selectedOrderMatches = selectedDelivery
    ? tracks.filter((track) => String(track.orderId) === String(selectedDelivery.orderId))
    : [];
  const selectedOrderItems = selectedOrderMatches.length
    ? selectedOrderMatches.flatMap((track) => track.items?.length ? track.items : [track])
    : selectedDelivery ? [selectedDelivery] : [];
  const canGoPrevious = safePage > 1;
  const canGoNext = safePage < totalPages;
  const pageControls = (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="flat" isDisabled={!canGoPrevious || loading} onPress={() => setPage((current) => Math.max(1, current - 1))}>
        Previous
      </Button>
      <Chip size="sm" variant="flat">Page {safePage} of {totalPages}</Chip>
      <Button size="sm" color="success" variant="flat" isDisabled={!canGoNext || loading} onPress={() => setPage((current) => Math.min(totalPages, current + 1))}>
        Next
      </Button>
    </div>
  );
  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Card>
        <CardHeader className="justify-between">
          <h2 className="text-lg font-black">Product Delivery Tracking</h2>
          <div className="flex items-center gap-2">
            <Chip variant="flat" size="sm" startContent={<RefreshCw size={12} />}>Auto-refresh</Chip>
            <Button size="sm" variant="light" isIconOnly onPress={load}><RefreshCw size={14} /></Button>
          </div>
        </CardHeader>
        <CardBody>
          {tracks.length === 0 ? (
            <p className="text-sm text-slate-400">No active deliveries.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <THead><Th>ORDER</Th><Th>PRODUCT</Th><Th>QTY</Th><Th>CUSTOMER</Th><Th>FULFILLMENT</Th><Th>PAYMENT</Th><Th>STATUS</Th><Th>UPDATED</Th><Th>ACTION</Th></THead>
                  <TBody>
                    {paged.map((track, idx) => (
                      <Tr key={idx}>
                        <Td><span className="font-semibold">{track.orderId}</span></Td>
                          <Td>
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold">{track.productName}</span>
                              {track.items?.length > 1 ? (
                                <span className="text-xs text-slate-400">
                                  {track.items.map((item) => item.name || item.productName).filter(Boolean).join(", ")}
                                </span>
                              ) : null}
                            </div>
                          </Td>
                        <Td>{formatQty(track.qty)}</Td>
                        <Td>{track.customerName}</Td>
                        <Td><FulfillmentChip value={track.fulfillmentType} /></Td>
                        <Td><PaymentMethodChip method={track.paymentMethod} /></Td>
                        <Td>
                          <OrderStatusChip status={track.status} />
                        </Td>
                        <Td className="text-sm text-slate-400">{track.updatedAt || "-"}</Td>
                        <Td>
                          <Button size="sm" variant="flat" onPress={() => setSelectedDelivery(track)}>
                            Details
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
              {totalPages > 1 ? <div className="mt-4 flex justify-center">{pageControls}</div> : null}
            </>
          )}
        </CardBody>
      </Card>
      <Modal isOpen={!!selectedDelivery} onOpenChange={() => setSelectedDelivery(null)}>
        <Modal.Backdrop>
          <Modal.Container size="lg">
            <Modal.Dialog>
              <Modal.Header>
                <div>
                  <p className="themed-modal-accent text-xs font-bold uppercase">Delivery Details</p>
                  <h2 className="themed-modal-title text-lg font-black">Order {selectedDelivery?.orderId}</h2>
                </div>
              </Modal.Header>
              <Modal.Body className="space-y-4">
                <Card className="themed-modal-card">
                  <CardBody className="gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="themed-modal-label text-xs font-bold uppercase">Order Progress</p>
                        <p className="themed-modal-value text-sm">Order: <strong>{selectedDelivery?.orderId || "-"}</strong></p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <FulfillmentChip value={selectedDelivery?.fulfillmentType} />
                        <PaymentMethodChip method={selectedDelivery?.paymentMethod} />
                        <OrderStatusChip status={selectedDelivery?.status} />
                      </div>
                    </div>
                    <DeliveryTimeline status={selectedDelivery?.status} />
                  </CardBody>
                </Card>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="themed-modal-card rounded-xl px-4 py-3">
                    <p className="delivery-field-label text-xs font-bold uppercase">Recipient Name</p>
                    <p className="delivery-field-value mt-1 font-semibold">{selectedDelivery?.recipientName || selectedDelivery?.customerName || "-"}</p>
                  </div>
                  <div className="themed-modal-card rounded-xl px-4 py-3">
                    <p className="delivery-field-label text-xs font-bold uppercase">Contact Number</p>
                    <p className="delivery-field-value mt-1 font-semibold">{selectedDelivery?.contact || selectedDelivery?.recipientContact || "-"}</p>
                  </div>
                  <div className="themed-modal-card rounded-xl px-4 py-3">
                    <p className="delivery-field-label text-xs font-bold uppercase">Payment Method</p>
                    <div className="mt-2"><PaymentMethodChip method={selectedDelivery?.paymentMethod} /></div>
                  </div>
                  <div className="themed-modal-card rounded-xl px-4 py-3">
                    <p className="delivery-field-label text-xs font-bold uppercase">Fulfillment Type</p>
                    <div className="mt-2"><FulfillmentChip value={selectedDelivery?.fulfillmentType} /></div>
                  </div>
                </div>
                <div className="themed-modal-card rounded-xl px-4 py-3">
                  <p className="delivery-field-label text-xs font-bold uppercase">Delivery Address</p>
                  <p className="delivery-field-value mt-1 font-semibold">{selectedDelivery?.deliveryAddress || selectedDelivery?.address || "-"}</p>
                </div>
                <Card className="themed-modal-card">
                  <CardBody className="gap-3">
                    <p className="themed-modal-label text-xs font-bold uppercase">Items</p>
                    <div className="grid gap-2">
                      {selectedOrderItems.map((item, idx) => (
                        <div key={`${item?.orderId || "order"}-${item?.productName || idx}`} className="themed-modal-item flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                          <span className="themed-modal-title font-semibold">{item?.productName || "-"}</span>
                          <Chip size="sm" variant="flat">x{formatQty(item?.qty || 0)}</Chip>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="flat" onPress={() => setSelectedDelivery(null)}>Close</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </motion.div>
  );
}

function AdminCustomersPage({ setMessage }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const perPage = 10;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiAdminCustomers();
      setCustomers(result.customers || []);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const totalPages = Math.max(1, Math.ceil(customers.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paged = customers.slice((safePage - 1) * perPage, safePage * perPage);
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Card>
        <CardHeader><h2 className="text-lg font-black">Customers</h2></CardHeader>
        <CardBody>
          {loading ? (
            <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : paged.length === 0 ? (
            <p className="text-sm text-slate-400">No customers found.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <THead><Th>NAME</Th><Th>EMAIL</Th><Th>TOTAL ORDERS</Th><Th>LAST ORDER</Th></THead>
                  <TBody>
                    {paged.map((c, idx) => (
                      <Tr key={c.email || idx}>
                        <Td><span className="font-semibold">{c.name}</span></Td>
                        <Td className="text-sm text-slate-400">{c.email}</Td>
                        <Td>{c.totalOrders || 0}</Td>
                        <Td className="text-sm text-slate-400">{c.lastOrder || "-"}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
              {totalPages > 1 ? (
                <div className="mt-4 flex justify-center">
                  <Pagination total={totalPages} page={safePage} onChange={setPage} color="success" size="sm" showControls showShadow />
                </div>
              ) : null}
            </>
          )}
        </CardBody>
      </Card>
    </motion.div>
  );
}

export { AdminInventoryPage };

const EMPTY_STAFF_FORM = {
  fullName: "",
  email: "",
  contact: "",
  password: "",
  confirmPassword: ""
};

function validateStaffForm(form, { requirePassword = true, emailExists = false } = {}) {
  const errors = {};
  if (!String(form.fullName || "").trim()) errors.fullName = "Staff name is required.";
  const email = validateGmailAddress(form.email);
  if (!email.ok) errors.email = email.message;
  else if (emailExists) errors.email = "Email is already registered.";
  const contact = validateContact(form.contact);
  if (!contact.ok) errors.contact = contact.message;
  if (requirePassword) {
    const password = validatePassword(form.password);
    if (!password.ok) errors.password = password.message;
    if (form.password !== form.confirmPassword) errors.confirmPassword = "Passwords do not match.";
  }
  return errors;
}

function StaffAccountInput({
  label,
  value,
  onValueChange,
  isInvalid,
  errorMessage,
  isDisabled = false,
  type = "text",
  className = "",
  ...props
}) {
  const invalid = Boolean(isInvalid);
  return (
    <label className={`grid gap-2 text-sm font-semibold text-[var(--text-secondary)] ${className}`}>
      <span>{label}</span>
      <input
        {...props}
        type={type}
        value={value ?? ""}
        disabled={isDisabled}
        aria-invalid={invalid || undefined}
        onChange={(event) => onValueChange?.(event.target.value)}
        className={`min-h-11 w-full rounded-xl border bg-[var(--bg-input)] px-3 text-[var(--text-primary)] outline-none transition disabled:cursor-not-allowed disabled:opacity-60 placeholder:text-[var(--text-muted)] ${
          invalid
            ? "border-red-500 shadow-[0_0_0_1px_rgba(248,113,113,.75)] focus:border-red-500 focus:shadow-[0_0_0_2px_rgba(248,113,113,.55)]"
            : "border-[var(--border)]"
        }`}
      />
      {invalid && errorMessage ? (
        <span className="text-xs font-semibold text-red-400">{errorMessage}</span>
      ) : null}
    </label>
  );
}

function AdminStaffAccountsPage({ setMessage }) {
  // function StaffAccountInput is the themed field wrapper used throughout this page.
  // It keeps the staff form aligned with text-[var(--text-secondary)] and bg-[var(--bg-input)] theme tokens.
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_STAFF_FORM);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [emailStatus, setEmailStatus] = useState("idle");
  const [editing, setEditing] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({ password: "", confirmPassword: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiAdminStaffAccounts();
      setStaff(result.staff || []);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const email = String(form.email || "").trim().toLowerCase();
    const valid = validateGmailAddress(email).ok;
    if (!email || !valid || editing) {
      setEmailStatus("idle");
      return;
    }
    setEmailStatus("checking");
    const timer = window.setTimeout(async () => {
      try {
        const result = await apiCheckRegistrationEmail(email);
        setEmailStatus(result.exists ? "exists" : "available");
      } catch {
        setEmailStatus("idle");
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [form.email, editing]);

  useEffect(() => {
    const next = validateStaffForm(form, {
      requirePassword: !editing,
      emailExists: emailStatus === "exists"
    });
    setErrors(next);
  }, [form, emailStatus, editing]);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const touchField = (key) => {
    setTouched((current) => ({ ...current, [key]: true }));
  };
  const visibleErrors = Object.fromEntries(
    Object.entries(errors).filter(([key]) => submitted || touched[key])
  );

  const startEdit = (account) => {
    setEditing(account);
    setForm({
      fullName: account.fullName || "",
      email: account.email || "",
      contact: account.contact || "",
      password: "",
      confirmPassword: ""
    });
    setEmailStatus("idle");
    setTouched({});
    setSubmitted(false);
  };

  const resetEditor = () => {
    setEditing(null);
    setForm(EMPTY_STAFF_FORM);
    setErrors({});
    setTouched({});
    setSubmitted(false);
    setEmailStatus("idle");
  };

  const saveStaff = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    const nextErrors = validateStaffForm(form, {
      requirePassword: !editing,
      emailExists: emailStatus === "exists"
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      if (editing) {
        await apiAdminUpdateStaffAccount(editing.userId, {
          fullName: form.fullName,
          contact: form.contact
        });
        setMessage("Staff account updated.");
      } else {
        await apiAdminCreateStaffAccount(form);
        setMessage("Staff account created.");
      }
      resetEditor();
      await load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const disableStaff = async (account) => {
    if (!window.confirm(`Disable staff account ${account.email}?`)) return;
    try {
      await apiAdminDisableStaffAccount(account.userId);
      setMessage("Staff account disabled.");
      await load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    if (resetForm.password !== resetForm.confirmPassword) {
      setMessage("Error: Passwords do not match.");
      return;
    }
    const password = validatePassword(resetForm.password);
    if (!password.ok) {
      setMessage(`Error: ${password.message}`);
      return;
    }
    try {
      await apiAdminResetStaffPassword(resetTarget.userId, resetForm);
      setMessage("Staff password reset.");
      setResetTarget(null);
      setResetForm({ password: "", confirmPassword: "" });
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  };

  return (
    <motion.div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-lg font-black">Staff Accounts</h2>
            <p className="text-sm text-slate-400">Create and manage staff access.</p>
          </div>
        </CardHeader>
        <CardBody>
          <form className="grid gap-3" onSubmit={saveStaff}>
            <StaffAccountInput
              label="Name"
              value={form.fullName}
              isInvalid={Boolean(visibleErrors.fullName)}
              errorMessage={visibleErrors.fullName}
              onBlur={() => touchField("fullName")}
              onValueChange={(value) => updateForm("fullName", value)}
            />
            <StaffAccountInput
              label="Email"
              type="email"
              value={form.email}
              isDisabled={Boolean(editing)}
              isInvalid={Boolean(visibleErrors.email)}
              errorMessage={visibleErrors.email || (emailStatus === "checking" ? "Checking email..." : "")}
              onBlur={() => touchField("email")}
              onValueChange={(value) => updateForm("email", value)}
            />
            {emailStatus === "available" && !editing ? (
              <p className="text-xs font-semibold text-emerald-300">Email is available.</p>
            ) : null}
            <StaffAccountInput
              label="Contact"
              value={form.contact}
              inputMode="numeric"
              maxLength={11}
              isInvalid={Boolean(visibleErrors.contact)}
              errorMessage={visibleErrors.contact}
              onBlur={() => touchField("contact")}
              onValueChange={(value) => updateForm("contact", normalizeContactInput(value))}
            />
            {!editing ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <StaffAccountInput
                  label="Password"
                  type="password"
                  value={form.password}
                  isInvalid={Boolean(visibleErrors.password)}
                  errorMessage={visibleErrors.password}
                  onBlur={() => touchField("password")}
                  onValueChange={(value) => updateForm("password", value)}
                />
                <StaffAccountInput
                  label="Confirm Password"
                  type="password"
                  value={form.confirmPassword}
                  isInvalid={Boolean(visibleErrors.confirmPassword)}
                  errorMessage={visibleErrors.confirmPassword}
                  onBlur={() => touchField("confirmPassword")}
                  onValueChange={(value) => updateForm("confirmPassword", value)}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button color="success" type="submit" isLoading={saving} isDisabled={saving || emailStatus === "checking"}>
                <Plus size={16} />
                {editing ? "Save Staff" : "Create Staff"}
              </Button>
              {editing ? (
                <Button variant="flat" onPress={resetEditor}>Cancel Edit</Button>
              ) : null}
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="justify-between">
          <h2 className="text-lg font-black">Staff List</h2>
          <Button size="sm" variant="flat" isIconOnly onPress={load}>
            <RefreshCw size={14} />
          </Button>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : staff.length === 0 ? (
            <p className="text-sm text-slate-400">No staff accounts found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead><Th>NAME</Th><Th>EMAIL</Th><Th>CONTACT</Th><Th>STATUS</Th><Th>ACTION</Th></THead>
                <TBody>
                  {staff.map((account) => (
                    <Tr key={account.userId || account.email}>
                      <Td><span className="font-semibold">{account.fullName || "Staff"}</span></Td>
                      <Td className="text-sm text-slate-400">{account.email}</Td>
                      <Td>{account.contact || "-"}</Td>
                      <Td>
                        <Chip color={account.isActive ? "success" : "danger"} variant="flat" size="sm">
                          {account.isActive ? "Active" : "Disabled"}
                        </Chip>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="flat" onPress={() => startEdit(account)}>
                            <Eye size={14} />
                            Edit
                          </Button>
                          <Button size="sm" variant="flat" onPress={() => setResetTarget(account)}>
                            Reset Password
                          </Button>
                          <Button size="sm" color="danger" variant="light" isDisabled={!account.isActive} onPress={() => disableStaff(account)}>
                            Disable Staff
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={!!resetTarget} onOpenChange={() => setResetTarget(null)}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.Header>
                <h2 className="text-lg font-black text-white">Reset Password</h2>
              </Modal.Header>
              <Modal.Body className="grid gap-3">
                <p className="text-sm text-slate-400">{resetTarget?.email}</p>
                <StaffAccountInput
                  label="Password"
                  type="password"
                  value={resetForm.password}
                  onValueChange={(value) => setResetForm((current) => ({ ...current, password: value }))}
                />
                <StaffAccountInput
                  label="Confirm Password"
                  type="password"
                  value={resetForm.confirmPassword}
                  onValueChange={(value) => setResetForm((current) => ({ ...current, confirmPassword: value }))}
                />
              </Modal.Body>
              <Modal.Footer>
                <Button variant="flat" onPress={() => setResetTarget(null)}>Cancel</Button>
                <Button color="success" onPress={resetPassword}>Reset Password</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </motion.div>
  );
}

function AdminRewardsPage({ setMessage }) {
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [redeemTarget, setRedeemTarget] = useState(null);
  const [customerEmail, setCustomerEmail] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiAdminRewards();
      setRewards(result.rewards || []);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const doRedeem = async () => {
    if (!customerEmail.trim()) return setMessage("Customer email is required.");
    try {
      await apiAdminRedeemReward(redeemTarget, customerEmail.trim());
      setMessage(`Reward "${redeemTarget}" redeemed for ${customerEmail}.`);
      setRedeemTarget(null);
      setCustomerEmail("");
      load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  };
  const topCustomer = rewards.reduce((best, r) => (r.points > (best?.points || 0) ? r : best), null);
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {topCustomer ? (
        <Card className="border border-emerald-400/20 bg-emerald-500/10">
          <CardBody className="flex items-center gap-4">
            <Sparkles size={24} className="text-emerald-400" />
            <div>
              <p className="text-sm font-bold text-emerald-300">Top Customer</p>
              <p className="font-black text-white">{topCustomer.customer || topCustomer.email}</p>
              <p className="text-sm text-slate-400">{topCustomer.points} points available</p>
            </div>
          </CardBody>
        </Card>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody className="gap-3">
            <h3 className="text-lg font-black">Free Delivery</h3>
            <p className="text-sm text-slate-400">500 points</p>
            <Button color="success" variant="flat" onPress={() => setRedeemTarget("free_delivery")}>Redeem for Customer</Button>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="gap-3">
            <h3 className="text-lg font-black">10% Discount</h3>
            <p className="text-sm text-slate-400">1000 points</p>
            <Button color="success" variant="flat" onPress={() => setRedeemTarget("discount_10")}>Redeem for Customer</Button>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader><h2 className="text-lg font-black">Customer Rewards</h2></CardHeader>
        <CardBody>
          {loading ? (
            <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : rewards.length === 0 ? (
            <p className="text-sm text-slate-400">No reward data.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead><Th>CUSTOMER</Th><Th>EMAIL</Th><Th>POINTS</Th><Th>EARNED</Th><Th>REDEEMED</Th></THead>
                <TBody>
                  {rewards.map((r, idx) => (
                    <Tr key={r.userId || idx}>
                      <Td><span className="font-semibold">{r.customer || "Customer"}</span></Td>
                      <Td className="text-sm text-slate-400">{r.email}</Td>
                      <Td><Chip color={r.points > 0 ? "success" : "default"} variant="flat" size="sm">{r.points || 0}</Chip></Td>
                      <Td>{r.earnedPoints || 0}</Td>
                      <Td>{r.redeemedPoints || 0}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
      <Modal isOpen={!!redeemTarget} onOpenChange={() => setRedeemTarget(null)} size="sm">
        <Modal.Dialog>
          <Modal.Header><h2 className="text-lg font-black text-white">Redeem {redeemTarget === "free_delivery" ? "Free Delivery" : "10% Discount"}</h2></Modal.Header>
          <Modal.Body className="space-y-3">
            <p className="text-sm text-slate-400">Enter the customer email to redeem this reward.</p>
            <HeroInput label="Customer Email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="flat" onPress={() => setRedeemTarget(null)}>Cancel</Button>
            <Button color="success" onPress={doRedeem}>Redeem</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal>
    </motion.div>
  );
}

function AdminForecastingPage({ setMessage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchaseSuggestionOpen, setPurchaseSuggestionOpen] = useState(false);
  const [selectedRecommendationRule, setSelectedRecommendationRule] = useState(null);
  const [selectedRecommendationActions, setSelectedRecommendationActions] = useState([]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiAdminForecasting());
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, [setMessage]);
  useEffect(() => { load(); }, [load]);

  const kpis = data?.kpis || {};
  const actualRows = data?.salesSeries || [];
  const forecastRows = data?.forecastMonths || [];
  const chartRows = [
    ...actualRows.map((row) => ({ ...row, type: "actual", value: Number(row.sales || 0), label: row.month })),
    ...forecastRows.map((row) => ({ ...row, type: "forecast", value: Number(row.forecastedSales || 0), label: row.month }))
  ];
  const maxChartValue = Math.max(1, ...chartRows.map((row) => Number(row.value || 0)));
  const chartWidth = 760;
  const chartHeight = 260;
  const chartPadX = 42;
  const chartPadTop = 24;
  const chartPadBottom = 60;
  const plotWidth = chartWidth - chartPadX * 2;
  const plotHeight = chartHeight - chartPadTop - chartPadBottom;
  const toChartX = (index) => chartRows.length <= 1
    ? chartPadX + plotWidth / 2
    : chartPadX + (index / (chartRows.length - 1)) * plotWidth;
  const toChartY = (value) => chartPadTop + plotHeight - (Number(value || 0) / maxChartValue) * plotHeight;
  const chartPointRows = chartRows.map((row, index) => ({
    ...row,
    x: toChartX(index),
    y: toChartY(row.value)
  }));
  const actualPoints = chartPointRows
    .filter((row) => row.type === "actual")
    .map((row) => `${row.x},${row.y}`)
    .join(" ");
  const forecastPoints = chartPointRows
    .filter((row, index) => row.type === "forecast" || (row.type === "actual" && chartPointRows[index + 1]?.type === "forecast"))
    .map((row) => `${row.x},${row.y}`)
    .join(" ");
  const modelSummary = data?.modelSummary || {};
  const recommendation = useMemo(() => {
    if (!selectedRecommendationRule) return data?.recommendationPreview;
    return {
      source: {
        name: selectedRecommendationRule.ifCustomerBuys,
        image: selectedRecommendationRule.sourceImage,
        price: selectedRecommendationRule.sourcePrice
      },
      recommendations: [{
        name: selectedRecommendationRule.thenAlsoBuys,
        image: selectedRecommendationRule.targetImage,
        price: selectedRecommendationRule.targetPrice,
        confidence: selectedRecommendationRule.confidence
      }]
    };
  }, [data, selectedRecommendationRule]);
  const addRecommendationAction = (item) => {
    const sourceName = recommendation?.source?.name || "Selected product";
    const action = {
      id: `${sourceName}-${item.name}`,
      sourceName,
      targetName: item.name,
      confidence: item.confidence
    };
    setSelectedRecommendationActions((current) => {
      if (current.some((entry) => entry.id === action.id)) return current;
      return [...current, action];
    });
    setMessage(`${item.name} added as a recommendation for ${sourceName}.`);
  };

  if (loading) {
    return (
      <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2].map((col) => (
            <Card key={col}>
              <CardBody className="gap-4">
                <Skeleton className="h-8 w-56" />
                <div className="grid gap-3 md:grid-cols-3">
                  {[1, 2, 3].map((item) => <Skeleton key={item} className="h-24 w-full" />)}
                </div>
                <Skeleton className="h-72 w-full" />
              </CardBody>
            </Card>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">ARIMA Sales Forecasting</h2>
              <p className="text-sm text-slate-400">Predict future beverage demand using an ARIMA-style trend model.</p>
            </div>
            <Chip variant="flat" color="default">Latest sales history</Chip>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardBody className="gap-2">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-500/15 text-emerald-300"><TrendingUp size={22} /></div>
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">Total Sales (Actual)</p>
                    <p className="text-lg font-black">{money(kpis.totalSalesActual || 0)}</p>
                  </div>
                </div>
                <p className="text-xs font-semibold text-emerald-300">{Number(kpis.salesGrowth || 0) >= 0 ? "+" : ""}{kpis.salesGrowth || 0}% vs previous period</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="gap-2">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-blue-500/15 text-blue-300"><BarChart3 size={22} /></div>
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">Forecast (Next 30 Days)</p>
                    <p className="text-lg font-black">{money(kpis.forecastNext30Days || 0)}</p>
                  </div>
                </div>
                <p className="text-xs font-semibold text-emerald-300">{Number(kpis.forecastGrowth || 0) >= 0 ? "+" : ""}{kpis.forecastGrowth || 0}% projected</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="gap-2">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-amber-500/15 text-amber-300"><Sparkles size={22} /></div>
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">Forecast Accuracy (MAPE)</p>
                    <p className="text-lg font-black">{kpis.forecastAccuracyMape || 0}%</p>
                  </div>
                </div>
                <p className="text-xs font-semibold text-emerald-300">Good Accuracy</p>
              </CardBody>
            </Card>
          </div>
          <Card>
            <CardHeader><h3 className="font-black">Sales Forecast (ARIMA Model)</h3></CardHeader>
            <CardBody>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-400">
                  <span className="inline-flex items-center gap-2"><span className="h-2 w-6 rounded-full bg-emerald-400" /> Actual Sales</span>
                  <span className="inline-flex items-center gap-2"><span className="h-2 w-6 rounded-full bg-blue-400" /> Forecasted Sales</span>
                </div>
                <div className="overflow-x-auto">
                  <svg
                    className="min-w-[760px]"
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    role="img"
                    aria-label="Line graph showing actual and forecasted sales"
                  >
                    {[0.25, 0.5, 0.75, 1].map((tick) => {
                      const y = chartPadTop + plotHeight - tick * plotHeight;
                      return (
                        <g key={tick}>
                          <line x1={chartPadX} x2={chartWidth - chartPadX} y1={y} y2={y} stroke="rgba(148,163,184,.16)" strokeDasharray="4 7" />
                          <text x={chartPadX - 10} y={y + 4} textAnchor="end" className="fill-slate-500 text-[10px] font-bold">{money(maxChartValue * tick)}</text>
                        </g>
                      );
                    })}
                    <line x1={chartPadX} x2={chartWidth - chartPadX} y1={chartPadTop + plotHeight} y2={chartPadTop + plotHeight} stroke="rgba(148,163,184,.28)" />
                    {actualPoints ? (
                      <polyline points={actualPoints} fill="none" stroke="#34d399" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                    ) : null}
                    {forecastPoints ? (
                      <polyline points={forecastPoints} fill="none" stroke="#60a5fa" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                    ) : null}
                    {chartPointRows.map((row, index) => (
                      <g key={`${row.type}-${row.label}-${index}`}>
                        <line x1={row.x} x2={row.x} y1={chartPadTop + plotHeight} y2={chartPadTop + plotHeight + 5} stroke="rgba(148,163,184,.35)" />
                        <circle cx={row.x} cy={row.y} r="6" fill={row.type === "actual" ? "#34d399" : "#60a5fa"} stroke="#020617" strokeWidth="3" />
                        <text x={row.x} y={Math.max(13, row.y - 12)} textAnchor="middle" className="fill-slate-200 text-[11px] font-black">{money(row.value)}</text>
                        <text x={row.x} y={chartPadTop + plotHeight + 24} textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold">{row.label}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader><h3 className="font-black">Forecast Table (Next 3 Months)</h3></CardHeader>
            <CardBody>
              <div className="overflow-x-auto">
                <Table>
                  <THead><Th>MONTH</Th><Th>FORECASTED SALES</Th><Th>LOWER CONFIDENCE</Th><Th>UPPER CONFIDENCE</Th><Th>EXPECTED GROWTH</Th></THead>
                  <TBody>
                    {forecastRows.map((row) => (
                      <Tr key={row.key || row.month}>
                        <Td className="font-semibold">{row.month}</Td>
                        <Td>{money(row.forecastedSales)}</Td>
                        <Td>{money(row.lowerConfidence)}</Td>
                        <Td>{money(row.upperConfidence)}</Td>
                        <Td><Chip color={Number(row.expectedGrowth || 0) >= 0 ? "success" : "warning"} variant="flat" size="sm">{row.expectedGrowth}%</Chip></Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
            </CardBody>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><h3 className="font-black">Model Summary</h3></CardHeader>
              <CardBody>
                <Table>
                  <TBody>
                    <Tr><Td>Model Used</Td><Td className="font-semibold">{modelSummary.modelUsed || "ARIMA (1,1,1)"}</Td></Tr>
                    <Tr><Td>MAPE</Td><Td className="font-semibold">{modelSummary.mape || 0}%</Td></Tr>
                    <Tr><Td>RMSE</Td><Td className="font-semibold">{money(modelSummary.rmse || 0)}</Td></Tr>
                    <Tr><Td>Data Used</Td><Td className="font-semibold">{modelSummary.dataUsed || "-"}</Td></Tr>
                    <Tr><Td>Confidence Level</Td><Td className="font-semibold">{modelSummary.confidenceLevel || "95%"}</Td></Tr>
                  </TBody>
                </Table>
              </CardBody>
            </Card>
            <Card>
              <CardHeader><h3 className="font-black">Inventory Recommendation</h3></CardHeader>
              <CardBody className="gap-3">
                <p className="text-sm text-slate-400">Based on the forecast, you may need additional stock for the next 30 days.</p>
                <Table>
                  <TBody>
                    <Tr><Td>Current Stock Value</Td><Td className="font-semibold">{money(data?.inventoryRecommendation?.currentStockValue || 0)}</Td></Tr>
                    <Tr><Td>Forecasted Demand</Td><Td className="font-semibold">{money(data?.inventoryRecommendation?.forecastedDemand || 0)}</Td></Tr>
                    <Tr><Td>Recommended Stock Value</Td><Td className="font-black text-emerald-300">{money(data?.inventoryRecommendation?.recommendedStockValue || 0)}</Td></Tr>
                  </TBody>
                </Table>
                <Button color="success" className="font-bold" onPress={() => setPurchaseSuggestionOpen(true)}>Generate Purchase Suggestion</Button>
              </CardBody>
            </Card>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-black">Market Basket Analysis</h2>
            <p className="text-sm text-slate-400">Discover products commonly bought together.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Card><CardBody><p className="text-xs font-bold uppercase text-slate-500">Total Transactions</p><p className="text-xl font-black">{formatQty(kpis.totalTransactions || 0)}</p></CardBody></Card>
            <Card><CardBody><p className="text-xs font-bold uppercase text-slate-500">Unique Products</p><p className="text-xl font-black">{formatQty(kpis.uniqueProducts || 0)}</p></CardBody></Card>
            <Card><CardBody><p className="text-xs font-bold uppercase text-slate-500">Association Rules</p><p className="text-xl font-black">{formatQty(kpis.associationRules || 0)}</p></CardBody></Card>
            <Card><CardBody><p className="text-xs font-bold uppercase text-slate-500">Analysis Type</p><p className="text-sm font-black">{kpis.analysisType || "Apriori Algorithm"}</p><p className="text-xs text-slate-500">Min. Support: 2%</p></CardBody></Card>
          </div>
          <Card>
            <CardHeader><h3 className="font-black">Top Product Associations</h3></CardHeader>
            <CardBody>
              <div className="overflow-x-auto">
                <Table>
                  <THead><Th>#</Th><Th>IF CUSTOMER BUYS</Th><Th>THEN ALSO BUYS</Th><Th>SUPPORT</Th><Th>CONFIDENCE</Th><Th>LIFT</Th><Th>ACTION</Th></THead>
                  <TBody>
                    {(data?.associationRules || []).slice(0, 5).map((rule, idx) => (
                      <Tr key={`${rule.ifCustomerBuys}-${rule.thenAlsoBuys}`}>
                        <Td>{idx + 1}</Td>
                        <Td><div className="flex items-center gap-2">{rule.sourceImage ? <img alt="" className="h-9 w-9 rounded bg-white object-contain" src={rule.sourceImage} /> : null}<span className="font-semibold">{rule.ifCustomerBuys}</span></div></Td>
                        <Td><div className="flex items-center gap-2">{rule.targetImage ? <img alt="" className="h-9 w-9 rounded bg-white object-contain" src={rule.targetImage} /> : null}<span className="font-semibold">{rule.thenAlsoBuys}</span></div></Td>
                        <Td>{rule.support}%</Td>
                        <Td>{rule.confidence}%</Td>
                        <Td>{rule.lift}</Td>
                        <Td><Button size="sm" variant="flat" color="success" onPress={() => setSelectedRecommendationRule(rule)}>Use for Recommendation</Button></Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader><h3 className="font-black">Recommendation Preview</h3></CardHeader>
            <CardBody>
              {recommendation?.source ? (
                <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
                  <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4 text-center">
                    <p className="text-xs font-bold text-slate-500">Customer adds to cart:</p>
                    {recommendation.source.image ? <img alt="" className="mx-auto mt-3 h-28 w-28 rounded-xl bg-white object-contain p-2" src={recommendation.source.image} /> : null}
                    <p className="mt-3 font-black">{recommendation.source.name}</p>
                    <p className="text-xs text-slate-400">{money(recommendation.source.price)} / case</p>
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-black text-emerald-300">You may also like:</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      {(recommendation.recommendations || []).map((item) => (
                        <div key={item.name} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          {item.image ? <img alt="" className="mx-auto h-24 w-full rounded-xl bg-white object-contain p-2" src={item.image} /> : null}
                          <p className="mt-3 font-black">{item.name}</p>
                          <p className="text-xs text-slate-400">{money(item.price)} / case</p>
                          <p className="text-xs text-slate-500">({item.confidence}% buy together)</p>
                          <Button size="sm" color="success" className="mt-3" onPress={() => addRecommendationAction(item)}>+ Add</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">No product combinations yet. More multi-item orders will improve recommendations.</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader><h3 className="font-black">Top Product Combinations Summary</h3></CardHeader>
            <CardBody>
              <div className="flex h-56 items-end gap-3 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                {(data?.combinationSummary || []).map((row) => (
                  <div key={row.combination} className="flex min-w-24 flex-col items-center gap-2">
                    <div className="w-10 rounded-t-xl bg-emerald-400" style={{ height: `${Math.max(10, Number(row.support || 0) * 6)}px` }} />
                    <p className="text-xs font-bold text-emerald-300">{row.support}%</p>
                    <p className="w-24 truncate text-center text-[11px] text-slate-500">{row.combination}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">Use these insights to create bundles, promotions, and product recommendations to increase sales.</p>
            </CardBody>
          </Card>
          {selectedRecommendationActions.length ? (
            <Card>
              <CardHeader><h3 className="font-black">Selected Recommendation Actions</h3></CardHeader>
              <CardBody className="gap-3">
                {selectedRecommendationActions.map((action) => (
                  <div key={action.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2">
                    <span className="text-sm"><span className="font-bold">{action.sourceName}</span> recommends <span className="font-bold text-emerald-300">{action.targetName}</span></span>
                    <Chip color="success" variant="flat" size="sm">{action.confidence}% confidence</Chip>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </section>
      </div>
      <Modal isOpen={purchaseSuggestionOpen} onOpenChange={() => setPurchaseSuggestionOpen(false)}>
        <Modal.Backdrop>
          <Modal.Container size="3xl">
            <Modal.Dialog>
              <Modal.Header>
                <div>
                  <p className="text-xs font-bold uppercase text-emerald-300">Forecasting</p>
                  <h2 className="text-lg font-black text-white">Purchase Suggestion</h2>
                </div>
              </Modal.Header>
              <Modal.Body>
                {(data?.purchaseSuggestions || []).length ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <THead><Th>PRODUCT</Th><Th>CURRENT STOCK</Th><Th>FORECAST CASES</Th><Th>SUGGESTED ORDER</Th><Th>ESTIMATED COST</Th><Th>ACTION</Th></THead>
                      <TBody>
                        {(data?.purchaseSuggestions || []).map((item) => {
                          const needsOrder = Number(item.suggestedOrderCases || 0) > 0;
                          return (
                            <Tr key={item.productName}>
                              <Td>
                                <div className="flex items-center gap-2">
                                  {item.imageUrl ? <img alt="" className="h-9 w-9 rounded bg-white object-contain" src={item.imageUrl} /> : null}
                                  <span className="font-semibold">{item.productName}</span>
                                </div>
                              </Td>
                              <Td>{formatQty(item.currentStock)} cases</Td>
                              <Td>{formatQty(item.forecastCases)} cases</Td>
                              <Td><Chip color={needsOrder ? "warning" : "success"} variant="flat" size="sm">{formatQty(item.suggestedOrderCases)} cases</Chip></Td>
                              <Td>{money(item.estimatedCost || 0)}</Td>
                              <Td><Chip color={needsOrder ? "warning" : "success"} variant="flat" size="sm">{item.stockAction || (needsOrder ? "Order Stock" : "Maintain Stock")}</Chip></Td>
                            </Tr>
                          );
                        })}
                      </TBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No purchase guidance is available yet. Add more completed orders to improve the forecast.</p>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="flat" onPress={() => setPurchaseSuggestionOpen(false)}>Close</Button>
                <Button color="success" onPress={() => { setPurchaseSuggestionOpen(false); setMessage("Purchase suggestion reviewed."); }}>Mark Reviewed</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </motion.div>
  );
}

function AdminReportsPage({ setMessage }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [range, setRange] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiAdminReports();
      setReports(result.reports || []);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!selectedReport) return;
    setDetailLoading(true);
    apiAdminReportDetail(selectedReport.key, {
      range,
      from: range === "custom" ? customFrom : "",
      to: range === "custom" ? customTo : "",
    }).then(setDetail).catch((err) => setMessage(err.message)).finally(() => setDetailLoading(false));
  }, [selectedReport, range, customFrom, customTo]);
  const reportFields = { reportType: "Report Type", coverage: "Coverage", status: "Status" };
  const exportExcel = () => {
    const csv = buildCsvContent(Object.values(reportFields), reports, reportFields);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jazjo-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Excel export downloaded.");
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
  const buildPrintableReportHtml = () => {
    const rows = reports.map((report) => `
      <tr>
        <td>${escapeHtml(report.reportType)}</td>
        <td>${escapeHtml(report.coverage)}</td>
        <td>${escapeHtml(report.status)}</td>
      </tr>
    `).join("");
    return `
      <html>
        <head>
          <title>Jazjo Reports</title>
          <style>
            @page { size: A4; margin: 14mm; }
            body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
            header { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 18px; }
            h1 { margin: 0; font-size: 24px; }
            p { color: #475569; margin: 6px 0 0; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f1f5f9; font-weight: 800; }
            tfoot td { background: #f8fafc; font-weight: 800; }
          </style>
        </head>
        <body>
          <header>
            <h1>Jazjo Reports</h1>
            <p>Generated ${escapeHtml(new Date().toLocaleString())}</p>
          </header>
          <table>
            <thead><tr><th>Report Type</th><th>Coverage</th><th>Status</th></tr></thead>
            <tbody>${rows || "<tr><td colspan=\"3\">No reports available.</td></tr>"}</tbody>
            <tfoot><tr><td colspan="2">Total report sections</td><td>${reports.length}</td></tr></tfoot>
          </table>
        </body>
      </html>
    `;
  };
  const openPrintableReport = () => {
    const iframe = document.createElement("iframe");
    iframe.title = "Printable Jazjo Reports";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.srcdoc = buildPrintableReportHtml();
    iframe.onload = () => {
      const printWindow = iframe.contentWindow;
      if (!printWindow) {
        iframe.remove();
        setMessage("Error: Unable to prepare print view.");
        return;
      }
      printWindow.focus();
      printWindow.print();
      setTimeout(() => iframe.remove(), 1000);
    };
    document.body.appendChild(iframe);
  };
  const detailRows = detail?.rows || [];
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-wrap gap-3">
        <Button variant="flat" startContent={<BarChart3 size={14} />} onPress={openPrintableReport}>PDF Export</Button>
        <Button variant="flat" startContent={<BarChart3 size={14} />} onPress={exportExcel}>Excel Export</Button>
        <Button variant="flat" startContent={<Printer size={14} />} onPress={openPrintableReport}>Print</Button>
      </div>
      <Card>
        <CardHeader><h2 className="text-lg font-black">Reports</h2></CardHeader>
        <CardBody>
          {loading ? (
            <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : reports.length === 0 ? (
            <p className="text-sm text-slate-400">No reports available.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead><Th>REPORT TYPE</Th><Th>COVERAGE</Th><Th>STATUS</Th></THead>
                <TBody>
                  {reports.map((r, idx) => (
                    <Tr key={idx} className="cursor-pointer" onClick={() => setSelectedReport(r)}>
                      <Td><span className="font-semibold">{r.reportType}</span></Td>
                      <Td className="text-sm text-slate-400">{r.coverage || "-"}</Td>
                      <Td><Chip color={r.status === "ready" ? "success" : r.status === "pending" ? "warning" : "default"} variant="flat" size="sm">{r.status || "Unknown"}</Chip></Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
      <Modal isOpen={!!selectedReport} onOpenChange={() => { setSelectedReport(null); setDetail(null); }}>
        <Modal.Backdrop>
          <Modal.Container size="4xl" className="w-[min(96vw,1120px)]">
            <Modal.Dialog>
              <Modal.Header>
                <div>
                  <p className="text-xs font-bold uppercase text-emerald-300">Report Detail</p>
                  <h2 className="text-lg font-black text-white">{selectedReport?.reportType}</h2>
                </div>
              </Modal.Header>
              <Modal.Body className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <select className="rounded-xl border border-white/10 bg-white/[.05] px-3 py-2 text-sm text-white" value={range} onChange={(event) => setRange(event.target.value)}>
                    <option value="today">Today</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                    <option value="all">All</option>
                    <option value="custom">Custom Date</option>
                  </select>
                  {range === "custom" ? (
                    <>
                      <input type="date" className="rounded-xl border border-white/10 bg-white/[.05] px-3 py-2 text-sm text-white" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
                      <input type="date" className="rounded-xl border border-white/10 bg-white/[.05] px-3 py-2 text-sm text-white" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
                    </>
                  ) : null}
                </div>
                {detailLoading ? (
                  <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                ) : detail ? (
                  <>
                    {selectedReport?.key === "sales" ? (
                      <SalesReportPreview detail={detail} />
                    ) : selectedReport?.key === "inventory" ? (
                      <InventoryReductionSummary detail={detail} />
                    ) : (
                      <>
                        {detail.totals ? (
                          <div className="grid gap-3 md:grid-cols-4">
                            {Object.entries(detail.totals).map(([key, value]) => (
                              <div key={key} className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                                <p className="text-xs font-bold uppercase text-slate-500">{key.replace(/([A-Z])/g, " $1")}</p>
                                <p className="mt-1 font-semibold text-white">{typeof value === "number" && (key.toLowerCase().includes("sales") || key.toLowerCase().includes("revenue")) ? money(value) : String(value)}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {detail.paymentBreakdown ? (
                          <Card><CardBody className="gap-3"><h3 className="text-sm font-bold">Payment Breakdown</h3>{detail.paymentBreakdown.map((row, idx) => <div key={idx} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2"><span>{row.paymentMethod || row.label}</span><span className="font-semibold text-white">{row.revenue !== undefined ? `${row.orders} / ${money(row.revenue)}` : row.orders}</span></div>)}</CardBody></Card>
                        ) : null}
                        {detail.fulfillmentBreakdown ? (
                          <Card><CardBody className="gap-3"><h3 className="text-sm font-bold">Fulfillment Breakdown</h3>{detail.fulfillmentBreakdown.map((row, idx) => <div key={idx} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2"><span>{row.fulfillmentType}</span><span className="font-semibold text-white">{row.revenue !== undefined ? `${row.orders} / ${money(row.revenue)}` : row.orders}</span></div>)}</CardBody></Card>
                        ) : null}
                        {detail.statusBreakdown ? (
                          <Card><CardBody className="gap-3"><h3 className="text-sm font-bold">Status Breakdown</h3>{Object.entries(detail.statusBreakdown).map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2"><span>{label}</span><span className="font-semibold text-white">{value}</span></div>)}</CardBody></Card>
                        ) : null}
                        {detail.averageDeliveryTime ? <p className="text-sm text-slate-400">Average Delivery Time: <span className="font-semibold text-white">{detail.averageDeliveryTime}</span> | Completion Rate: <span className="font-semibold text-white">{detail.completionRate}%</span></p> : null}
                        <div className="overflow-x-auto">
                          <Table>
                            <THead>
                              {selectedReport?.key === "top-selling" ? <><Th>RANK</Th><Th>PRODUCT</Th><Th>QTY SOLD</Th><Th>REVENUE</Th><Th>CURRENT STOCK</Th><Th>TREND</Th></> : <><Th>REFERENCE</Th><Th>DETAIL</Th><Th>STATUS</Th></>}
                            </THead>
                            <TBody>
                              {detailRows.map((row, idx) => (
                                <Tr key={idx}>
                                  {selectedReport?.key === "top-selling" ? <><Td>{row.ranking}</Td><Td>{row.product}</Td><Td>{row.quantitySold}</Td><Td>{money(row.revenue)}</Td><Td>{row.currentStock}</Td><Td>{row.trend}</Td></> : <><Td>{row.id || row.orderNumber || row.orderId || row.reportType || `Row ${idx + 1}`}</Td><Td className="text-sm text-slate-400">{row.customerName || row.coverage || row.customer || row.paymentMethod || row.fulfillmentType || "-"}</Td><Td>{row.status ? statusLabel(row.status) : row.reportType || "-"}</Td></>}
                                </Tr>
                              ))}
                            </TBody>
                          </Table>
                        </div>
                      </>
                    )}
                  </>
                ) : null}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="flat" onPress={() => { setSelectedReport(null); setDetail(null); }}>Close</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </motion.div>
  );
}

function KpiCard({ label, value, icon, onPress, footer = null }) {
  const content = (
    <CardBody className="gap-3">
      <div className="flex items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300">
          {icon}
        </div>
        <div className="min-w-0 text-left">
          <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
          <p className="mt-1 truncate text-xl font-black">{value}</p>
        </div>
      </div>
      {footer ? <div onClick={(event) => event.stopPropagation()}>{footer}</div> : null}
    </CardBody>
  );
  return (
    <Card className={onPress ? "transition hover:border-emerald-400/40 hover:bg-emerald-400/[.04]" : ""}>
      {onPress ? (
        <button type="button" className="w-full text-left" onClick={onPress}>
          {content}
        </button>
      ) : content}
    </Card>
  );
}

