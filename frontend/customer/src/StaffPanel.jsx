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
  Save,
} from "lucide-react";
import {
  apiStaffOrders,
  apiStaffInventory,
  apiStaffDelivery,
  apiUpdateOrderStatus,
  apiUpdateOrderDetails,
  apiAdminDashboard
} from "./lib/api.js";
import { clearSession, createDemandForecast, formatQty, getToken, money, normalizeContactInput, statusLabel } from "./lib/customerLogic.js";

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

function Tr({ children }) {
  return <tr className="border-b border-white/5 transition-colors hover:bg-white/[.02]">{children}</tr>;
}

function Td({ children, className = "" }) {
  return <td className={`px-3 py-3 ${className}`}>{children}</td>;
}

function Table({ children }) {
  return <table className="w-full text-left text-sm">{children}</table>;
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
    <div className={`flex min-h-screen transition-colors ${isDark ? "bg-[#080b12] text-slate-100" : "bg-slate-50 text-slate-950"}`}>
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
      </div>
    );
  }
  const kpis = data?.kpis || {};
  const recentOrders = data?.recentOrders || [];
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Orders to Prepare" value={recentOrders.filter((o) => statusLabel(o.status) === "Preparing").length} icon={<Package size={20} />} />
        <KpiCard label="Orders to Deliver" value={recentOrders.filter((o) => statusLabel(o.status) === "In Transit" || statusLabel(o.status) === "Out for Delivery").length} icon={<Truck size={20} />} />
        <KpiCard label="Completed Orders" value={recentOrders.filter((o) => statusLabel(o.status) === "Delivered").length} icon={<ShoppingCart size={20} />} />
        <KpiCard label="Low Stock Items" value={kpis.lowStockCount || 0} icon={<Warehouse size={20} />} />
      </div>
      <Card>
        <CardHeader><h2 className="text-lg font-black">Quick Actions</h2></CardHeader>
        <CardBody className="flex flex-wrap gap-3">
          <Button color="warning" variant="flat" startContent={<Package size={16} />} onPress={() => go("staff/orders")}>Manage Orders</Button>
          <Button color="warning" variant="flat" startContent={<Truck size={16} />} onPress={() => go("staff/delivery")}>Delivery Updates</Button>
          <Button color="warning" variant="flat" startContent={<Warehouse size={16} />} onPress={() => go("staff/inventory")}>View Inventory</Button>
        </CardBody>
      </Card>
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
      load();
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
              <THead><Th>ORDER ID</Th><Th>DATE</Th><Th>CUSTOMER</Th><Th>TOTAL</Th><Th>STATUS</Th><Th>ACTION</Th></THead>
              <TBody>
                {paged.map((order, idx) => {
                  const next = nextStatus(order.status);
                  return (
                    <Tr key={order.id || idx}>
                      <Td><span className="font-semibold">{order.id}</span></Td>
                      <Td className="text-sm text-slate-400">{order.createdAt || "-"}</Td>
                      <Td>{order.customerName || "Customer"}</Td>
                      <Td className="font-semibold">{money(order.total)}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Chip color={statusLabel(order.status) === "Delivered" ? "success" : statusLabel(order.status) === "Cancelled" ? "danger" : "warning"} variant="flat" size="sm">{statusLabel(order.status)}</Chip>
                          {order.paymentStatus === "paid" || order.payment_status === "paid" ? <Chip color="success" size="sm" variant="flat">Paid</Chip> : null}
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
                  Delivery Address
                  <textarea
                    className="min-h-24 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                    value={editForm?.address || ""}
                    onChange={(event) => setEditForm((current) => ({ ...current, address: event.target.value }))}
                  />
                </label>
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
              </Modal.Body>
              <Modal.Footer>
                <Button variant="flat" onPress={() => { setEditingOrder(null); setEditForm(null); }}>Cancel</Button>
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
  const [inventory, setInventory] = useState([]);
  const [forecastRows, setForecastRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(1);
  const perPage = 10;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, ordersResult] = await Promise.all([apiStaffInventory(), apiStaffOrders()]);
      setInventory(result.inventory || []);
      setForecastRows(createDemandForecast(result.inventory || [], ordersResult.orders || [], { horizonDays: 5 }).slice(0, 5));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const filtered = useMemo(() => {
    if (filter === "All") return inventory;
    return inventory.filter((p) => {
      const status = p.status || (p.stockCases > 10 ? "In Stock" : p.stockCases > 0 ? "Low Stock" : "Out of Stock");
      return status === filter;
    });
  }, [inventory, filter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  useEffect(() => { setPage(1); }, [filter]);
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black">Inventory View</h2>
        <Button size="sm" variant="flat" startContent={<RefreshCw size={14} />} onPress={load}>Refresh</Button>
      </div>
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
                  <Chip color="warning" variant="flat" size="sm">{formatQty(row.forecastCases)} forecast</Chip>
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
      <Tabs selectedKey={filter} onSelectionChange={(key) => setFilter(String(key))} color="warning" variant="underlined" size="sm">
        <Tabs.List className="gap-0 overflow-x-auto border-b border-white/10">
          {["All", "In Stock", "Low Stock", "Out of Stock"].map((s) => (
            <Tabs.Tab id={s} key={s} className="min-w-max px-3 py-2 data-[selected=true]:text-amber-400">
              <span className="text-xs">{s}</span>
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      {loading ? (
        <Card><CardBody className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</CardBody></Card>
      ) : paged.length === 0 ? (
        <Card><CardBody><p className="text-sm text-slate-400">No products found.</p></CardBody></Card>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <THead><Th>PRODUCT</Th><Th>CATEGORY</Th><Th>PRICE</Th><Th>STOCK</Th><Th>QTY/CASE</Th><Th>STATUS</Th></THead>
              <TBody>
                {paged.map((p, idx) => {
                  const status = p.status || (p.stockCases > 10 ? "In Stock" : p.stockCases > 0 ? "Low Stock" : "Out of Stock");
                  return (
                    <Tr key={p.id || p.sku || idx}>
                      <Td><span className="font-semibold">{p.name}</span></Td>
                      <Td>{p.category || "-"}</Td>
                      <Td>{money(p.price)}</Td>
                      <Td>{formatQty(p.stockCases)} cases</Td>
                      <Td>{Number(p.quantityPerCase || 1).toLocaleString()}</Td>
                      <Td>
                        <Chip
                          color={status === "In Stock" ? "success" : status === "Low Stock" ? "warning" : "danger"}
                          variant="flat"
                          size="sm"
                        >
                          {status}
                        </Chip>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </div>
          {totalPages > 1 ? (
            <div className="flex justify-center">
              <PanelPagination total={totalPages} page={safePage} onChange={setPage} label="Inventory pagination" />
            </div>
          ) : null}
        </>
      )}
    </motion.div>
  );
}

function StaffDeliveryPage({ setMessage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
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
  const tracks = data?.productTracks || [];
  const activeOrder = data?.activeOrder;
  const totalPages = Math.max(1, Math.ceil(tracks.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paged = tracks.slice((safePage - 1) * perPage, safePage * perPage);
  const timelineSteps = ["Order Placed", "Preparing", "In Transit", "Out for Delivery", "Delivered"];
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
      {activeOrder ? (
        <Card>
          <CardHeader><h2 className="text-lg font-black">Active Delivery</h2></CardHeader>
          <CardBody>
            <p className="text-sm text-slate-400 mb-4">Order: <strong>{activeOrder.id || "Active order"}</strong></p>
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              {timelineSteps.map((step, idx) => {
                const current = statusLabel(activeOrder.status);
                const stepIdx = timelineSteps.indexOf(current);
                const done = idx <= stepIdx;
                return (
                  <div key={step} className="flex items-center gap-3 min-w-max">
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      done ? "bg-amber-500 text-white" : "bg-white/10 text-slate-500"
                    }`}>
                      {done ? "\u2713" : idx + 1}
                    </div>
                    <span className={`text-sm ${done ? "text-amber-300 font-semibold" : "text-slate-500"}`}>{step}</span>
                    {idx < timelineSteps.length - 1 ? <div className={`h-px w-12 ${done ? "bg-amber-500/50" : "bg-white/10"}`} /> : null}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ) : null}
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
                  <THead><Th>ORDER</Th><Th>PRODUCT</Th><Th>QTY</Th><Th>CUSTOMER</Th><Th>STATUS</Th><Th>UPDATED</Th></THead>
                  <TBody>
                    {paged.map((track, idx) => (
                      <Tr key={idx}>
                        <Td><span className="font-semibold">{track.orderId}</span></Td>
                        <Td>{track.productName}</Td>
                        <Td>{formatQty(track.qty)}</Td>
                        <Td>{track.customerName}</Td>
                        <Td>
                          <Chip
                            color={statusLabel(track.status) === "Delivered" ? "success" : statusLabel(track.status) === "Cancelled" ? "danger" : "warning"}
                            variant="flat"
                            size="sm"
                          >
                            {statusLabel(track.status)}
                          </Chip>
                        </Td>
                        <Td className="text-sm text-slate-400">{track.updatedAt || "-"}</Td>
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
    </motion.div>
  );
}

function KpiCard({ label, value, icon }) {
  return (
    <Card>
      <CardBody className="flex-row items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-amber-300">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
          <p className="mt-1 truncate text-xl font-black">{value}</p>
        </div>
      </CardBody>
    </Card>
  );
}
