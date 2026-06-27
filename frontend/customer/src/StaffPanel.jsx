import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { Input as HeroInput } from "@heroui/react/input";
import { Modal } from "@heroui/react/modal";
import { Pagination } from "@heroui/react/pagination";
import { Skeleton } from "@heroui/react/skeleton";
import { Tabs } from "@heroui/react/tabs";
import { Toast } from "@heroui/react/toast";
import {
  Home,
  LogOut,
  Moon,
  Package,
  ShoppingCart,
  Sun,
  Truck,
  Warehouse,
  RefreshCw,
  Eye,
  Printer,
  Save,
} from "lucide-react";
import {
  apiStaffOrders,
  apiStaffInventory,
  apiStaffDelivery,
  apiStaffCreateCategory,
  apiStaffCreateProduct,
  apiStaffDeleteCategory,
  apiStaffDeleteProduct,
  apiStaffRestock,
  apiStaffUpdateProduct,
  apiStaffUploadProductImage,
  apiUpdateOrderStatus,
  apiUpdateOrderDetails,
  apiOrderInvoice,
  apiPrepareOrder,
  apiUpdateOrderPreparation
} from "./lib/api.js";
import { clearSession, formatQty, getToken, money, normalizeContactInput, statusLabel } from "./lib/customerLogic.js";
import { AdminInventoryPage } from "./AdminPanel.jsx";
import { buildInvoiceHtml, openPrintableHtml } from "./lib/invoicePrint.js";
import {
  formatFulfillmentType,
  fulfillmentColor,
  getPreparationSummary,
  paymentMethodColor,
  paymentMethodLabel,
  paymentStatusColor,
  paymentStatusText,
  statusColor,
} from "./lib/panelLogic.js";

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
  return window.location.hash.replace(/^#\/?/, "") || "staff/dashboard";
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
              done ? "bg-amber-500 text-white" : "bg-white/10 text-slate-500"
            }`}>
              {done ? "\u2713" : idx + 1}
            </div>
            <span className={`text-sm ${done ? "font-semibold text-amber-300" : "text-slate-500"}`}>{step}</span>
            {idx < timelineSteps.length - 1 ? <div className={`h-px w-12 ${done ? "bg-amber-500/50" : "bg-white/10"}`} /> : null}
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
  return <Chip color={paymentMethodColor(method)} variant="flat" size="sm">{paymentMethodLabel(method)}</Chip>;
}

function FulfillmentChip({ value }) {
  return <Chip color={fulfillmentColor(value)} variant="flat" size="sm">{formatFulfillmentType(value)}</Chip>;
}

function PanelPagination({ total, page, onChange, label }) {
  if (total <= 1) return null;
  return (
    <Pagination
      aria-label={label}
      size="sm"
      className="flex flex-wrap items-center justify-center gap-3"
    >
      <Pagination.Summary className="text-xs font-semibold text-slate-400">
        Page {page} of {total}
      </Pagination.Summary>
      <Pagination.Content>
        <Pagination.Item>
          <Pagination.Previous
            aria-label="Previous page"
            isDisabled={page <= 1}
            onPress={() => onChange(Math.max(1, page - 1))}
          >
            <Pagination.PreviousIcon />
          </Pagination.Previous>
        </Pagination.Item>
        {Array.from({ length: total }, (_, index) => index + 1).map((pageNumber) => (
          <Pagination.Item key={pageNumber}>
            <Pagination.Link
              aria-label={`Page ${pageNumber}`}
              isActive={pageNumber === page}
              onPress={() => onChange(pageNumber)}
            >
              {pageNumber}
            </Pagination.Link>
          </Pagination.Item>
        ))}
        <Pagination.Item>
          <Pagination.Next
            aria-label="Next page"
            isDisabled={page >= total}
            onPress={() => onChange(Math.min(total, page + 1))}
          >
            <Pagination.NextIcon />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}

export default function StaffPanel({ isDark, onToggleTheme }) {
  const [route, setRoute] = useState(() => routeFromHash().replace("staff/", ""));
  const [message, setMessage] = useState("");

  useEffect(() => {
    const onHash = () => {
      const r = routeFromHash().replace("staff/", "");
      setRoute(r || "dashboard");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!message) return;
    Toast.toast[message.startsWith("Error") || message.includes("failed") ? "danger" : "success"](message, { timeout: 3000 });
    setMessage("");
  }, [message]);

  if (!getToken()) {
    window.location.hash = "#/home";
    return null;
  }

  const navigate = (r) => go(`staff/${r}`);

  const sidebarItems = [
    { id: "dashboard", label: "Dashboard", icon: <Home size={18} /> },
    { id: "orders", label: "Orders", icon: <Package size={18} /> },
    { id: "inventory", label: "Inventory", icon: <Warehouse size={18} /> },
    { id: "delivery", label: "Delivery", icon: <Truck size={18} /> }
  ];

  return (
    <div className={`panel-readable flex min-h-screen transition-colors ${isDark ? "bg-[#080b12] text-slate-100" : "bg-slate-50 text-slate-950"}`}>
      <Toast.Provider placement="top end" maxVisibleToasts={4} />
      <aside className={`fixed left-0 top-0 z-30 h-full w-48 border-r transition-colors max-md:hidden ${isDark ? "border-white/10 bg-[#0c101a]" : "border-slate-200 bg-white"}`}>
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-5">
            <img alt="Jazjo Beverages" className="h-10 w-10 rounded-xl bg-white p-1 object-contain" src={BRAND_LOGO} />
            <div>
              <p className={`text-sm font-black ${isDark ? "text-white" : "text-slate-950"}`}>Staff Panel</p>
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
                    ? "bg-amber-500/15 text-amber-300 shadow-sm shadow-amber-950/30"
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
      <div className="flex flex-1 flex-col max-md:ml-0 md:ml-48">
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
                  color={route === item.id ? "warning" : "default"}
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
              {route === "dashboard" && <StaffDashboardPage setMessage={setMessage} />}
              {route === "orders" && <StaffOrdersPage setMessage={setMessage} />}
              {route === "inventory" && <StaffInventoryPage setMessage={setMessage} />}
              {route === "delivery" && <StaffDeliveryPage setMessage={setMessage} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function StaffDashboardPage({ setMessage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersResult, inventoryResult] = await Promise.all([apiStaffOrders(), apiStaffInventory()]);
      const orders = ordersResult.orders || [];
      const lowStock = inventoryResult.lowStock || (inventoryResult.inventory || []).filter((item) => {
        const stockCases = Number(item.stockCases || 0);
        return stockCases <= 10;
      });
      setData({
        orders: orders,
        recentOrders: orders.slice(0, 8),
        lowStock: lowStock,
        kpis: {
          lowStockCount: lowStock.length
        }
      });
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
      </div>
    );
  }
  const kpis = data?.kpis || {};
  const recentOrders = data?.recentOrders || [];
  const allOrders = data?.orders || recentOrders;
  const lowStock = data?.lowStock || [];
  const prepareOrders = allOrders.filter((o) => statusLabel(o.status) === "Preparing");
  const deliverOrders = allOrders.filter((o) => ["In Transit", "Out for Delivery"].includes(statusLabel(o.status)));
  const completedOrders = allOrders.filter((o) => statusLabel(o.status) === "Delivered");
  const detailConfig = {
    prepare: { title: "Orders to Prepare", items: prepareOrders, type: "orders" },
    deliver: { title: "Orders to Deliver", items: deliverOrders, type: "orders" },
    completed: { title: "Completed Orders", items: completedOrders, type: "orders" },
    lowStock: { title: "Low Stock Items", items: lowStock, type: "inventory" }
  };
  const activeDetail = detailConfig[detail] || null;
  const detailItems = activeDetail?.items || [];
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Orders to Prepare" value={prepareOrders.length} icon={<Package size={20} />} onPress={() => setDetail("prepare")} />
        <KpiCard label="Orders to Deliver" value={deliverOrders.length} icon={<Truck size={20} />} onPress={() => setDetail("deliver")} />
        <KpiCard label="Completed Orders" value={completedOrders.length} icon={<ShoppingCart size={20} />} onPress={() => setDetail("completed")} />
        <KpiCard label="Low Stock Items" value={kpis.lowStockCount || lowStock.length || 0} icon={<Warehouse size={20} />} onPress={() => setDetail("lowStock")} />
      </div>
      <Card>
        <CardHeader><h2 className="text-lg font-black">Quick Actions</h2></CardHeader>
        <CardBody className="flex flex-wrap gap-3">
          <Button color="warning" variant="flat" startContent={<Package size={16} />} onPress={() => go("staff/orders")}>Manage Orders</Button>
          <Button color="warning" variant="flat" startContent={<Truck size={16} />} onPress={() => go("staff/delivery")}>Delivery Updates</Button>
          <Button color="warning" variant="flat" startContent={<Warehouse size={16} />} onPress={() => go("staff/inventory")}>View Inventory</Button>
        </CardBody>
      </Card>
      <Modal isOpen={!!detail} onOpenChange={() => setDetail(null)}>
        <Modal.Backdrop>
          <Modal.Container size="2xl">
            <Modal.Dialog className="themed-modal-shell">
              <Modal.Header>
                <div>
                  <p className="text-xs font-bold uppercase text-amber-300">Staff Dashboard Details</p>
                  <h2 className="text-lg font-black text-white">{activeDetail?.title || "Details"}</h2>
                </div>
              </Modal.Header>
              <Modal.Body>
                {detailItems.length === 0 ? (
                  <p className="text-sm text-slate-400">No records found.</p>
                ) : (
                  <div className="grid gap-2">
                    {detailItems.map((item, idx) => (
                      <div key={item.id || item.sku || item.name || idx} className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                        {activeDetail?.type === "inventory" ? (
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{item.name || "Product"}</p>
                              <p className="text-xs text-slate-500">{item.category || "-"} - {formatQty(item.stockCases)} case(s)</p>
                            </div>
                            <Chip color={Number(item.stockCases || 0) <= 0 ? "danger" : "warning"} variant="flat" size="sm">
                              {item.status || (Number(item.stockCases || 0) <= 0 ? "Out of Stock" : "Low Stock")}
                            </Chip>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{item.id || "Order"}</p>
                              <p className="text-xs text-slate-500">{item.customerName || "Customer"} - {item.createdAt || "No date"}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Chip color="warning" variant="flat" size="sm">{statusLabel(item.status)}</Chip>
                              <span className="text-sm font-semibold text-white">{money(item.total || 0)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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

function StaffOrdersPage({ setMessage }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingPreparation, setSavingPreparation] = useState(false);
  const [submittingPrepare, setSubmittingPrepare] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState("");
  const perPage = 10;
  const statuses = ["All", "Pending Payment", "Order Placed", "Preparing", "In Transit", "Out for Delivery", "Delivered", "Cancelled"];
  const editableStatuses = statuses.filter((status) => status !== "All");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiStaffOrders();
      setOrders(result.orders || []);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const filtered = useMemo(() => {
    if (filter === "All") return orders;
    return orders.filter((o) => statusLabel(o.status) === filter);
  }, [orders, filter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  useEffect(() => { setPage(1); }, [filter]);
  const updateStatus = async (orderCode, newStatus) => {
    try {
      await apiUpdateOrderStatus(orderCode, newStatus);
      setMessage(`Order ${orderCode} marked as ${newStatus}.`);
      await load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
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
  const openEditOrder = (order) => {
    setEditingOrder(order);
    setEditForm({
      customerName: order.customerName || "",
      contact: order.contact || "",
      address: order.address || "",
      status: statusLabel(order.status),
      items: (order.items || []).map((item) => ({
        productId: item.productId,
        name: item.name,
        price: Number(item.price || 0),
        qty: Number(item.qty || 0)
      }))
    });
  };
  const updateEditItemQty = (idx, value) => {
    setEditForm((current) => ({
      ...current,
      items: (current.items || []).map((item, itemIdx) =>
        itemIdx === idx ? { ...item, qty: Math.max(0, Number(value || 0)) } : item
      )
    }));
  };
  const saveOrderEdit = async () => {
    if (!editingOrder || !editForm) return;
    setSavingEdit(true);
    try {
      await apiUpdateOrderDetails(editingOrder.id, editForm);
      setMessage(`Order ${editingOrder.id} updated.`);
      setEditingOrder(null);
      setEditForm(null);
      await load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSavingEdit(false);
    }
  };
  const openSalesInvoice = async (order) => {
    if (!order?.id) return;
    setLoadingInvoice(order.id);
    try {
      const invoice = await apiOrderInvoice(order.id);
      openPrintableHtml(buildInvoiceHtml(invoice));
    } catch (err) {
      setMessage(`Error: ${err.message || "Unable to prepare sales invoice."}`);
    } finally {
      setLoadingInvoice("");
    }
  };
  const updatePreparation = async (productId, prepared) => {
    if (!editingOrder) return;
    const items = getPreparationSummary(editingOrder).items.map((item) => item.productId === productId ? { ...item, prepared } : item);
    setSavingPreparation(true);
    try {
      const order = await apiUpdateOrderPreparation(editingOrder.id, items.map((item) => ({ productId: item.productId, prepared: item.prepared })));
      setEditingOrder(order);
      setMessage("Preparation progress updated.");
      await load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSavingPreparation(false);
    }
  };
  const submitPreparation = async () => {
    if (!editingOrder) return;
    setSubmittingPrepare(true);
    try {
      const order = await apiPrepareOrder(editingOrder.id);
      setEditingOrder(order);
      setMessage(`Order ${editingOrder.id} moved to Preparing.`);
      await load();
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSubmittingPrepare(false);
    }
  };
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black">Order Management</h2>
        <Button size="sm" variant="flat" startContent={<RefreshCw size={14} />} onPress={load}>Refresh</Button>
      </div>
      <Tabs selectedKey={filter} onSelectionChange={(key) => setFilter(String(key))} color="warning" variant="underlined" size="sm">
        <Tabs.List className="gap-0 overflow-x-auto border-b border-white/10">
          {statuses.map((s) => (
            <Tabs.Tab id={s} key={s} className="min-w-max px-3 py-2 data-[selected=true]:text-amber-400">
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
                        <div className="flex flex-wrap gap-2">
                          {next ? (
                            <Button size="sm" color="warning" variant="flat" onPress={() => updateStatus(order.id, next)}>
                              {next}
                            </Button>
                          ) : null}
                          <Button size="sm" variant="flat" onPress={() => openEditOrder(order)}>
                            <Eye size={14} />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="flat"
                            isDisabled={loadingInvoice === order.id}
                            onPress={() => openSalesInvoice(order)}
                          >
                            <Printer size={14} />
                            {loadingInvoice === order.id ? "Preparing..." : "Sales Invoice"}
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </div>
          {totalPages > 1 ? (
            <div className="flex justify-center">
              <PanelPagination total={totalPages} page={safePage} onChange={setPage} label="Orders pagination" />
            </div>
          ) : null}
        </>
      )}
      <Modal isOpen={!!editingOrder} onOpenChange={() => { setEditingOrder(null); setEditForm(null); }}>
        <Modal.Backdrop>
          <Modal.Container size="2xl">
            <Modal.Dialog>
              <Modal.Header>
                <div>
                  <p className="text-xs font-bold uppercase text-amber-300">Edit Order</p>
                  <h2 className="text-lg font-black text-white">{editingOrder?.id}</h2>
                </div>
              </Modal.Header>
              <Modal.Body className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <HeroInput
                    label="Customer Name"
                    value={editForm?.customerName || ""}
                    onValueChange={(value) => setEditForm((current) => ({ ...current, customerName: value }))}
                  />
                  <HeroInput
                    label="Contact"
                    value={editForm?.contact || ""}
                    inputMode="numeric"
                    onValueChange={(value) => setEditForm((current) => ({ ...current, contact: normalizeContactInput(value) }))}
                  />
                </div>
                <label className="grid gap-2 text-sm font-semibold text-slate-200">
                  Status
                  <select
                    className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                    value={editForm?.status || "Order Placed"}
                    onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    {editableStatuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-200">
                  {String(editingOrder?.fulfillmentType || editForm?.fulfillmentType || "").toLowerCase() === "pickup" ? "Pickup Location" : "Delivery Address"}
                  <textarea
                    className="min-h-24 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                    value={editForm?.address || ""}
                    onChange={(event) => setEditForm((current) => ({ ...current, address: event.target.value }))}
                  />
                </label>
                <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Fulfillment</p>
                  <div className="mt-2"><FulfillmentChip value={editingOrder?.fulfillmentType || editForm?.fulfillmentType} /></div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Payment</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <PaymentMethodChip method={editingOrder?.paymentMethod} />
                    <PaymentStatusChip order={editingOrder} />
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                  <p className="mb-3 text-xs font-bold uppercase text-slate-500">Items</p>
                  <div className="grid gap-2">
                    {(editForm?.items || []).map((item, idx) => (
                      <div key={`${item.productId || item.name}-${idx}`} className="grid gap-2 rounded-lg border border-white/10 bg-slate-950/60 p-2 sm:grid-cols-[1fr_110px_120px] sm:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                          <p className="text-xs text-slate-500">{money(item.price)} per case</p>
                        </div>
                        <HeroInput
                          label="Qty"
                          type="number"
                          min="0"
                          value={String(item.qty)}
                          onValueChange={(value) => updateEditItemQty(idx, value)}
                        />
                        <p className="text-sm font-semibold text-white">{money(Number(item.price || 0) * Number(item.qty || 0))}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {(statusLabel(editingOrder?.status) === "Order Placed" || statusLabel(editingOrder?.status) === "Preparing") ? (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-500/[.06] p-4">
                    {getPreparationSummary(editingOrder).items.length === 0 ? (
                      <p className="mb-4 text-sm text-slate-300">Preparation items are loading from the order details.</p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase text-amber-300">Preparation Progress</p>
                        <p className="text-sm text-slate-300">{getPreparationSummary(editingOrder).preparedItems} / {getPreparationSummary(editingOrder).totalItems} Items Prepared</p>
                      </div>
                      <Chip color="warning" variant="flat" size="sm">{getPreparationSummary(editingOrder).percent}%</Chip>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-amber-400" style={{ width: `${getPreparationSummary(editingOrder).percent}%` }} /></div>
                    <div className="mt-4 grid gap-3">
                      {getPreparationSummary(editingOrder).items.map((item) => (
                        <label key={item.productId || item.name} className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm">
                          <div className="flex items-start gap-3">
                            <input type="checkbox" checked={item.prepared === true} disabled={savingPreparation || submittingPrepare} onChange={(event) => updatePreparation(item.productId, event.target.checked)} className="mt-1 h-4 w-4 accent-amber-400" />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-white">{item.name}</p>
                              <p className="text-xs text-slate-400">Ordered: {formatQty(item.qty)} Cases</p>
                              {item.validationMessage ? <p className="mt-1 text-xs font-semibold text-red-400">{item.validationMessage}</p> : null}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button color="warning" onPress={submitPreparation} isDisabled={!getPreparationSummary(editingOrder).completed} isLoading={submittingPrepare}>Prepare Order</Button>
                    </div>
                  </div>
                ) : null}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="flat" onPress={() => { setEditingOrder(null); setEditForm(null); }}>Cancel</Button>
                <Button
                  variant="flat"
                  isDisabled={!editingOrder || loadingInvoice === editingOrder?.id}
                  onPress={() => openSalesInvoice(editingOrder)}
                >
                  <Printer size={16} />
                  {loadingInvoice === editingOrder?.id ? "Preparing..." : "Sales Invoice"}
                </Button>
                <Button color="warning" isLoading={savingEdit} onPress={saveOrderEdit}>
                  <Save size={16} />
                  Save Changes
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </motion.div>
  );
}

function StaffInventoryPage({ setMessage }) {
  // Reuses the admin inventory manager, including the ARIMA Forecast Summary and createDemandForecast workflow.
  return (
    <AdminInventoryPage
      setMessage={setMessage}
      inventoryApi={apiStaffInventory}
      ordersApi={apiStaffOrders}
      createCategoryApi={apiStaffCreateCategory}
      deleteCategoryApi={apiStaffDeleteCategory}
      createProductApi={apiStaffCreateProduct}
      uploadProductImageApi={apiStaffUploadProductImage}
      restockApi={apiStaffRestock}
      updateProductApi={apiStaffUpdateProduct}
      deleteProductApi={apiStaffDeleteProduct}
    />
  );
}

function StaffDeliveryPage({ setMessage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const perPage = 10;
  const load = useCallback(async () => {
    try {
      const result = await apiStaffDelivery();
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
              {totalPages > 1 ? (
                <div className="mt-4 flex justify-center">
                    <PanelPagination total={totalPages} page={safePage} onChange={setPage} label="Delivery pagination" />
                </div>
              ) : null}
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
                  <p className="text-xs font-bold uppercase text-amber-300">Delivery Details</p>
                  <h2 className="text-lg font-black text-white">Order {selectedDelivery?.orderId}</h2>
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

function KpiCard({ label, value, icon, onPress }) {
  const content = (
    <CardBody className="flex-row items-center gap-4">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-amber-300">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <p className="mt-1 truncate text-xl font-black">{value}</p>
      </div>
    </CardBody>
  );
  return (
    <Card className={onPress ? "cursor-pointer transition-colors hover:border-amber-400/60" : ""}>
      {onPress ? (
        <button type="button" className="w-full text-left" onClick={onPress}>
          {content}
        </button>
      ) : content}
    </Card>
  );
}
