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
  apiAdminDelivery,
  apiAdminDeleteOrder,
  apiAdminBulkDeleteOrdersByStatus,
  apiAdminCategories,
  apiAdminCreateCategory,
  apiAdminDeleteCategory,
  apiAdminCreateProduct,
  apiAdminUploadProductImage,
  apiAdminRestock,
  apiAdminUpdateProduct,
  apiAdminDeleteProduct,
  apiAdminRedeemReward,
  apiUpdateOrderStatus
} from "./lib/api.js";
import { buildCsvContent, clearSession, createDemandForecast, formatQty, getToken, money, statusLabel } from "./lib/customerLogic.js";

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

function Tr({ children }) {
  return <tr className="border-b border-white/5 transition-colors hover:bg-white/[.02]">{children}</tr>;
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
    { id: "orders", label: "Orders", icon: <Package size={18} /> },
    { id: "delivery", label: "Delivery", icon: <Truck size={18} /> },
    { id: "customers", label: "Customers", icon: <Users size={18} /> },
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
              {route === "orders" && <AdminOrdersPage setMessage={setMessage} />}
              {route === "delivery" && <AdminDeliveryPage setMessage={setMessage} />}
              {route === "customers" && <AdminCustomersPage setMessage={setMessage} />}
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
  const detailRows = {
    orders,
    customers,
    todaySales: todayOrders,
    bestSeller: orders.filter((order) => (order.items || []).some((item) => item.name === kpis.bestSeller)),
    lowStock: lowStockRows
  };
  const detailTitle = {
    orders: "Order List",
    customers: "Customer List",
    todaySales: "Sales Today",
    bestSeller: "Best Seller Orders",
    lowStock: "Low Stock Products"
  };
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Orders" value={kpis.totalOrders ?? kpis.transactions ?? orders.length} icon={<ShoppingCart size={20} />} onPress={() => setDetail("orders")} />
        <KpiCard label="Total Customers" value={kpis.totalCustomers ?? customers.length} icon={<Users size={20} />} onPress={() => setDetail("customers")} />
        <KpiCard label="Sales Today" value={money(kpis.salesToday || 0)} icon={<TrendingUp size={20} />} onPress={() => setDetail("todaySales")} />
        <KpiCard label="Best Seller" value={kpis.bestSeller || "N/A"} icon={<BarChart3 size={20} />} onPress={() => setDetail("bestSeller")} />
        <KpiCard label="Total Sales" value={money(kpis.totalSales)} icon={<CreditCard size={20} />} />
        <KpiCard label="Low Stock" value={kpis.lowStockCount || 0} icon={<Warehouse size={20} />} onPress={() => setDetail("lowStock")} />
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
                  ) : detail === "lowStock" ? (
                    <Table>
                      <THead><Th>PRODUCT</Th><Th>STOCK</Th><Th>STATUS</Th></THead>
                      <TBody>
                        {(detailRows.lowStock || []).map((product, idx) => (
                          <Tr key={product.id || product.name || idx}>
                            <Td>{product.name}</Td>
                            <Td>{formatQty(product.stockCases)} cases</Td>
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
      load();
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
                        <div className="flex items-center gap-2">
                          {next ? (
                            <Button size="sm" color="success" variant="flat" onPress={() => updateStatus(order.id, next)}>
                              {next}
                            </Button>
                          ) : null}
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
                    <p className="mt-1 font-semibold text-white">{selectedOrder?.paymentMethod || "QRPH"}</p>
                    <p className="text-sm text-slate-400">{selectedOrder?.paymentStatus || "pending"}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Date</p>
                    <p className="mt-1 text-sm font-semibold text-white">{selectedOrder?.createdAt || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Status</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Chip color={statusLabel(selectedOrder?.status) === "Delivered" ? "success" : statusLabel(selectedOrder?.status) === "Cancelled" ? "danger" : "warning"} variant="flat" size="sm">
                        {statusLabel(selectedOrder?.status)}
                      </Chip>
                      {selectedOrder?.paymentStatus === "paid" || selectedOrder?.payment_status === "paid" ? <Chip color="success" size="sm" variant="flat">Paid</Chip> : null}
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Delivery Address</p>
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

function AdminInventoryPage({ setMessage }) {
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
      const [result, ordersResult] = await Promise.all([apiAdminInventory(), apiAdminOrders({ perPage: 500 })]);
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
      const result = await apiAdminCreateCategory(addCategoryName.trim());
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
      const result = await apiAdminDeleteCategory(name);
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
        const uploaded = await apiAdminUploadProductImage(productImagePreview, productImageFile.name);
        imageUrl = uploaded?.imageUrl || "";
      }
      await apiAdminCreateProduct({
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
      await apiAdminRestock(restockProduct.name, stockToAdd);
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
      await apiAdminDeleteProduct(confirmDelete.name);
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
        const uploaded = await apiAdminUploadProductImage(editImagePreview, editImageFile.name);
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
      await apiAdminUpdateProduct(editOriginalName, body);
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
                  <THead><Th>ORDER</Th><Th>PRODUCT</Th><Th>QTY</Th><Th>CUSTOMER</Th><Th>STATUS</Th><Th>UPDATED</Th><Th>ACTION</Th></THead>
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
                      <Chip
                        color={statusLabel(selectedDelivery?.status) === "Delivered" ? "success" : statusLabel(selectedDelivery?.status) === "Cancelled" ? "danger" : "warning"}
                        variant="flat"
                      >
                        {statusLabel(selectedDelivery?.status)}
                      </Chip>
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
                    <p className="delivery-field-label text-xs font-bold uppercase">Delivery Status</p>
                    <p className="delivery-field-value mt-1 font-semibold">{statusLabel(selectedDelivery?.status) || "-"}</p>
                  </div>
                  <div className="themed-modal-card rounded-xl px-4 py-3">
                    <p className="delivery-field-label text-xs font-bold uppercase">Delivery Date</p>
                    <p className="delivery-field-value mt-1 font-semibold">{selectedDelivery?.deliveryDate || selectedDelivery?.updatedAt || "-"}</p>
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

function AdminReportsPage({ setMessage }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
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
                    <Tr key={idx}>
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
    </motion.div>
  );
}

function KpiCard({ label, value, icon, onPress }) {
  const content = (
    <CardBody className="flex-row items-center gap-4">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300">
        {icon}
      </div>
      <div className="min-w-0 text-left">
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <p className="mt-1 truncate text-xl font-black">{value}</p>
      </div>
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

