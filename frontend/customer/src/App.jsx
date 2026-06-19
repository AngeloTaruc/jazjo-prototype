import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Alert } from "@heroui/react/alert";
import { Avatar } from "@heroui/react/avatar";
import { Button } from "@heroui/react/button";
import { ButtonGroup } from "@heroui/react/button-group";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import { EmptyState } from "@heroui/react/empty-state";
import { Input as HeroInput } from "@heroui/react/input";
import { ListBox } from "@heroui/react/list-box";
import { Modal } from "@heroui/react/modal";
import { Pagination } from "@heroui/react/pagination";
import { Popover } from "@heroui/react/popover";
import { ProgressBar } from "@heroui/react/progress-bar";
import { Select } from "@heroui/react/select";
import { Skeleton } from "@heroui/react/skeleton";
import { Switch } from "@heroui/react/switch";
import { Tabs } from "@heroui/react/tabs";
import { TextArea as HeroTextArea } from "@heroui/react/textarea";
import { Toast } from "@heroui/react/toast";
import { Tooltip } from "@heroui/react/tooltip";
import {
  ArrowLeft,
  BarChart3,
  Clock3,
  CreditCard,
  Gift,
  Heart,
  Home,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  Package,
  Phone,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Sun,
  Trash2,
  Truck,
  User,
  UserPlus,
} from "lucide-react";
import heroImage from "./assets/jazjo-store-hero.jpg";
import AdminPanel from "./AdminPanel.jsx";
import StaffPanel from "./StaffPanel.jsx";
import {
  apiChangePassword,
  apiCreateOrder,
  apiLogin,
  apiOrderDetails,
  apiOrders,
  apiProducts,
  apiProfile,
  apiReconcilePayment,
  apiRedeemReward,
  apiRegister,
  apiRewards,
  apiSaveProfile,
} from "./lib/api.js";
import {
  CART_KEY,
  FAVORITES_KEY,
  ORDERS_KEY,
  canAddCartQuantity,
  clearSession,
  currentCustomerEmail,
  formatQty,
  getToken,
  isRetryablePaymentReason,
  money,
  paymentStatusLabel,
  readStorage,
  saveSession,
  statusLabel,
  toggleFavoriteProduct,
  validateContact,
  validatePassword,
  writeStorage,
} from "./lib/customerLogic.js";

const CATEGORY_OPTIONS = ["Soft Drinks", "Water", "Energy Drinks", "Juice"];
const PACK_OPTIONS = [
  { label: "1 case", caseQty: 1 },
  { label: "Half case", caseQty: 0.5 },
];
const REWARD_CATALOG = [
  {
    id: "free_delivery",
    name: "Free Delivery",
    description: "Waive delivery fee on your next order.",
    points: 500,
    icon: <Truck size={22} />,
  },
  {
    id: "discount_10",
    name: "10% Discount",
    description: "Get 10% off your next order total.",
    points: 1000,
    icon: <Gift size={22} />,
  },
];
const NAV_ITEMS = [
  { label: "Home", route: "dashboard" },
  { label: "Shop", route: "shop" },
  { label: "Orders", route: "orders" },
  { label: "Rewards", route: "rewards" },
  { label: "Profile", route: "profile" },
];
const HOME_STATS = [
  { label: "Fast ordering", value: "24/7", icon: <Clock3 size={18} /> },
  { label: "Local delivery", value: "PH", icon: <Truck size={18} /> },
  { label: "Reward points", value: "Earn", icon: <Gift size={18} /> },
];
const AUTH_BENEFITS = [
  { title: "Track every order", icon: <Package size={16} /> },
  { title: "Save your delivery info", icon: <ShieldCheck size={16} /> },
  { title: "Redeem customer rewards", icon: <Gift size={16} /> },
];
const HOME_FEATURES = [
  {
    title: "Online Ordering",
    copy: "Browse beverages and place orders instantly from any device. No more phone-call back and forth.",
    icon: <ShoppingCart size={22} />,
  },
  {
    title: "Inventory Monitoring",
    copy: "Stock-aware ordering helps prevent overselling and keeps available items clear to customers.",
    icon: <BarChart3 size={22} />,
  },
  {
    title: "Delivery Updates",
    copy: "Track order status from preparation to delivery with simple, readable progress updates.",
    icon: <Truck size={22} />,
  },
];

const BRAND_LOGO = "/customer-app/logo.png";

const CardHeader = Card.Header;
const CardBody = Card.Content;

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

const staggerVariants = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  initial: { opacity: 0, y: 20, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
};

function Divider() {
  return <div className="h-px w-full bg-white/10" />;
}

function Image({ alt, className = "", src }) {
  return <img alt={alt} className={className} src={src} />;
}

function Link({ children, color, onPress }) {
  return (
    <Button
      color={color === "success" ? "success" : "default"}
      size="sm"
      variant={color === "success" ? "flat" : "light"}
      onPress={onPress}
    >
      {children}
    </Button>
  );
}

function Input({
  label,
  value,
  onValueChange,
  isRequired,
  isReadOnly,
  type = "text",
  placeholder = "",
  className = "",
  startContent,
  ...props
}) {
  return (
    <label
      className={`grid gap-2 text-sm font-semibold text-slate-300 ${className}`}
    >
      {label ? (
        <span>
          {label}
          {isRequired ? " *" : ""}
        </span>
      ) : null}
      <span className="relative block">
        {startContent ? (
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 grid -translate-y-1/2 text-slate-500">
            {startContent}
          </span>
        ) : null}
        <HeroInput
          {...props}
          type={type}
          value={value}
          readOnly={isReadOnly}
          required={isRequired}
          placeholder={placeholder}
          onChange={(event) => onValueChange?.(event.target.value)}
          className={`min-h-11 w-full rounded-xl border border-white/10 bg-white/[.06] text-slate-50 outline-none ${startContent ? "pl-11" : ""}`}
        />
      </span>
    </label>
  );
}

function Textarea({
  label,
  value,
  onValueChange,
  isRequired,
  className = "",
  ...props
}) {
  return (
    <label
      className={`grid gap-2 text-sm font-semibold text-slate-300 ${className}`}
    >
      {label ? (
        <span>
          {label}
          {isRequired ? " *" : ""}
        </span>
      ) : null}
      <HeroTextArea
        {...props}
        value={value}
        required={isRequired}
        onChange={(event) => onValueChange?.(event.target.value)}
        className="min-h-24 w-full rounded-xl border border-white/10 bg-white/[.06] text-slate-50 outline-none"
      />
    </label>
  );
}

function Progress({ value }) {
  return (
    <ProgressBar value={value} className="mt-3">
      <ProgressBar.Track className="h-2 rounded-full bg-white/10">
        <ProgressBar.Fill className="h-full rounded-full bg-success" />
      </ProgressBar.Track>
    </ProgressBar>
  );
}

function routeFromHash() {
  return window.location.hash.replace(/^#\/?/, "") || "home";
}

function go(route) {
  window.location.hash = `#/${route}`;
}

function toastVariant(message) {
  const value = String(message || "").toLowerCase();
  if (
    /missing|invalid|required|empty|failed|error|only|must|not found|unable|higher|exceed/.test(
      value,
    )
  )
    return "danger";
  if (/saved|changed|created|redeemed|added|success|placed|updated/.test(value))
    return "success";
  return "info";
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function useHashRoute() {
  const [route, setRoute] = useState(routeFromHash());
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return [route, go];
}

export default function App() {
  const [route, navigate] = useHashRoute();
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState(() => readStorage(ORDERS_KEY, []));
  const [cart, setCartState] = useState(() => readStorage(CART_KEY, []));
  const [favorites, setFavoritesState] = useState(() =>
    readStorage(FAVORITES_KEY, []),
  );
  const [mode, setMode] = useState(
    () => localStorage.getItem("jazjo_theme") || "dark",
  );
  const [message, setMessage] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const isCustomerArea = !["home", "products", "login", "register"].includes(
    route,
  );
  const isDark = mode === "dark";

  const setCart = (next) => {
    setCartState(next);
    writeStorage(CART_KEY, next);
  };

  const cartCount = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  const setFavorites = (next) => {
    setFavoritesState(next);
    writeStorage(FAVORITES_KEY, next);
  };

  const refreshProducts = async () => {
    setLoadingProducts(true);
    try {
      const list = await apiProducts();
      setProducts(list);
      return list;
    } finally {
      setLoadingProducts(false);
    }
  };

  const refreshOrders = async () => {
    const list = await apiOrders();
    setOrders(list);
    writeStorage(ORDERS_KEY, list);
    return list;
  };

  useEffect(() => {
    refreshProducts().catch((err) => setMessage(err.message));
  }, []);

  useEffect(() => {
    localStorage.setItem("jazjo_theme", mode);
    document.documentElement.classList.toggle("dark", isDark);
  }, [mode, isDark]);

  useEffect(() => {
    if (!message) return;
    Toast.toast[toastVariant(message)](message, { timeout: 3200 });
    setMessage("");
  }, [message]);

  useEffect(() => {
    const paid = new URLSearchParams(window.location.search).get("paid");
    if (!paid) return;
    let cancelled = false;
    const reconcileWithRetry = async () => {
      let latest = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        latest = await apiReconcilePayment(paid);
        if (latest.reconciled || latest.alreadyPaid) return latest;
        if (!isRetryablePaymentReason(latest.reason)) return latest;
        await wait(2500);
      }
      return latest;
    };

    setMessage("Checking QRPH payment...");
    reconcileWithRetry()
      .then(async (result) => {
        if (cancelled) return;
        if (result?.reconciled || result?.alreadyPaid) {
          setCart([]);
          await refreshOrders();
          setMessage(`Payment confirmed for ${paid}.`);
          return;
        }
        await refreshOrders().catch(() => {});
        setMessage("Payment was received by PayMongo. Confirmation is still processing, please tap Check Payment in Orders.");
      })
      .catch((err) => {
        if (!cancelled) setMessage(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        const nextUrl = `${window.location.pathname}${window.location.hash || "#/orders"}`;
        window.history.replaceState({}, "", nextUrl);
        navigate("orders");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cancelled = new URLSearchParams(window.location.search).get("cancelled");
    if (!cancelled) return;
    setMessage(`Payment cancelled for order ${cancelled}.`);
    const nextUrl = `${window.location.pathname}${window.location.hash || "#/cart"}`;
    window.history.replaceState({}, "", nextUrl);
    navigate("cart");
  }, []);

  const protectedRoutes = ["dashboard", "cart", "orders", "rewards", "profile"];
  useEffect(() => {
    if (
      !getToken() &&
      (protectedRoutes.includes(route) ||
        route.startsWith("order/") ||
        route.startsWith("admin/") ||
        route.startsWith("staff/"))
    ) {
      navigate("home");
    }
  }, [route]);

  const addToCart = (product, pack = PACK_OPTIONS[0]) => {
    const existing = cart.find(
      (item) =>
        item.productId === product.id &&
        Number(item.caseQty || 1) === pack.caseQty,
    );
    const allowed = canAddCartQuantity({
      existingQty: existing?.qty || 0,
      addQty: 1,
      caseQty: pack.caseQty,
      stockCases: product.stockCases,
    });
    if (!allowed.ok) return setMessage(`${product.name}: ${allowed.message}`);
    const next = existing
      ? cart.map((item) =>
          item === existing
            ? { ...item, qty: Number(item.qty || 0) + 1 }
            : item,
        )
      : [
          ...cart,
          {
            productId: product.id,
            qty: 1,
            caseQty: pack.caseQty,
            packLabel: pack.label,
          },
        ];
    setCart(next);
    setMessage(`${product.name} (${pack.label}) added to cart.`);
  };

  const toggleFavorite = (product) => {
    const next = toggleFavoriteProduct(favorites, product.id);
    setFavorites(next);
    setMessage(
      next.includes(String(product.id))
        ? `${product.name} saved.`
        : `${product.name} removed from saved items.`,
    );
  };

  const logout = () => {
    clearSession();
    setCart([]);
    navigate("home");
  };

  const isPanelRoute = route.startsWith("admin/") || route.startsWith("staff/");
  return (
    <motion.div
      className={`min-h-screen transition-colors ${isDark ? "bg-[#080b12] text-slate-100" : "bg-slate-50 text-slate-950"}`}
      initial={false}
      animate
    >
      {isPanelRoute ? (
        route.startsWith("admin/") ? (
          <AdminPanel
            isDark={isDark}
            onToggleTheme={() => setMode(isDark ? "light" : "dark")}
          />
        ) : (
          <StaffPanel
            isDark={isDark}
            onToggleTheme={() => setMode(isDark ? "light" : "dark")}
          />
        )
      ) : (
        <>
          <AppNav
            route={route}
            isCustomerArea={isCustomerArea}
            cartCount={cartCount}
            isDark={isDark}
            onNavigate={navigate}
            onLogout={logout}
            onToggleTheme={() => setMode(isDark ? "light" : "dark")}
          />
          <Toast.Provider placement="top end" maxVisibleToasts={4} />
          <main
            className={
              route === "home" ? "py-0" : "mx-auto max-w-6xl px-4 py-6"
            }
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={route}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                {route === "home" && (
                  <HomePage isDark={isDark} onNavigate={navigate} />
                )}
                {route === "products" && (
                  <ShopPage
                    publicMode
                    products={products}
                    loading={loadingProducts}
                    favorites={favorites}
                    onAdd={addToCart}
                    onToggleFavorite={toggleFavorite}
                    onNavigate={navigate}
                  />
                )}
                {route === "login" && (
                  <LoginPage onNavigate={navigate} setMessage={setMessage} />
                )}
                {route === "register" && (
                  <RegisterPage onNavigate={navigate} setMessage={setMessage} />
                )}
                {route === "dashboard" && (
                  <Dashboard
                    products={products}
                    orders={orders}
                    favorites={favorites}
                    onNavigate={navigate}
                    onAdd={addToCart}
                    onToggleFavorite={toggleFavorite}
                  />
                )}
                {route === "shop" && (
                  <ShopPage
                    products={products}
                    loading={loadingProducts}
                    cartCount={cartCount}
                    favorites={favorites}
                    onAdd={addToCart}
                    onToggleFavorite={toggleFavorite}
                    onNavigate={navigate}
                  />
                )}
                {route === "cart" && (
                  <CartPage
                    products={products}
                    cart={cart}
                    setCart={setCart}
                    refreshOrders={refreshOrders}
                    setMessage={setMessage}
                  />
                )}
                {route === "orders" && (
                  <OrdersPage
                    orders={orders}
                    refreshOrders={refreshOrders}
                    onNavigate={navigate}
                    setMessage={setMessage}
                  />
                )}
                {route.startsWith("order/") && (
                  <OrderDetailsPage
                    id={route.replace("order/", "")}
                    onNavigate={navigate}
                  />
                )}
                {route === "rewards" && <RewardsPage setMessage={setMessage} />}
                {route === "profile" && <ProfilePage setMessage={setMessage} />}
              </motion.div>
            </AnimatePresence>
          </main>
          <CustomerFooter isDark={isDark} />
        </>
      )}
    </motion.div>
  );
}

function AppNav({
  route,
  isCustomerArea,
  cartCount,
  isDark,
  onNavigate,
  onLogout,
  onToggleTheme,
}) {
  const publicLinks = [
    { label: "Home", action: () => onNavigate("home") },
    {
      label: "About Us",
      action: () =>
        document
          .getElementById("about")
          ?.scrollIntoView({ behavior: "smooth" }),
    },
    {
      label: "Products",
      action: () =>
        document
          .getElementById("products-preview")
          ?.scrollIntoView({ behavior: "smooth" }),
    },
    {
      label: "Contact",
      action: () =>
        document
          .getElementById("contact")
          ?.scrollIntoView({ behavior: "smooth" }),
    },
  ];
  return (
    <motion.header
      className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-colors ${isDark ? "border-white/10 bg-[#080b12]/85" : "border-slate-200 bg-white/85"}`}
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 20 }}
    >
      <div className="mx-auto grid min-h-[76px] max-w-6xl grid-cols-[minmax(150px,1fr)_auto_minmax(150px,1fr)] items-center gap-3 px-4 py-3 max-md:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 items-center gap-3">
          <Tooltip content="Home" placement="bottom" showArrow>
            <button
              className="shrink-0 rounded-xl border border-white/10 bg-white px-2 py-1 shadow-lg shadow-emerald-950/20"
              onClick={() => onNavigate(isCustomerArea ? "dashboard" : "home")}
              type="button"
            >
              <img
                alt="Jazjo Beverages"
                className="h-9 w-auto object-contain"
                src={BRAND_LOGO}
              />
            </button>
          </Tooltip>
          <button
            className="min-w-0 text-left"
            onClick={() => onNavigate(isCustomerArea ? "dashboard" : "home")}
            type="button"
          >
            <p
              className={`truncate text-sm font-black ${isDark ? "text-white" : "text-slate-950"}`}
            >
              Jazjo Beverages
            </p>
            <p
              className={`truncate text-xs ${isDark ? "text-white/55" : "text-slate-500"}`}
            >
              Drinks and daily essentials
            </p>
          </button>
        </div>
        <nav
          className="flex items-center justify-center gap-2 max-md:order-3 max-md:col-span-2 max-md:justify-start max-md:overflow-x-auto"
          aria-label="Customer navigation"
        >
          {isCustomerArea
            ? NAV_ITEMS.map((item) => (
                <Link
                  color={route === item.route ? "success" : "foreground"}
                  key={item.route}
                  onPress={() => onNavigate(item.route)}
                >
                  {item.label}
                </Link>
              ))
            : publicLinks.map((item) => (
                <Button
                  key={item.label}
                  size="sm"
                  variant="light"
                  onPress={item.action}
                >
                  {item.label}
                </Button>
              ))}
        </nav>
        <div className="flex items-center justify-end gap-2">
          <Tooltip
            content={isDark ? "Switch to light mode" : "Switch to dark mode"}
            placement="bottom"
            showArrow
          >
            <span className="flex items-center">
              <Switch
                isSelected={isDark}
                onValueChange={onToggleTheme}
                size="sm"
                color="success"
                startContent={<Sun size={14} />}
                endContent={<Moon size={14} />}
                aria-label="Toggle theme"
              />
            </span>
          </Tooltip>
          {isCustomerArea ? (
            <>
              <Tooltip content="View Cart" placement="bottom" showArrow>
                <Button
                  size="sm"
                  variant="flat"
                  color="success"
                  isIconOnly
                  aria-label={`View cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
                  className="relative overflow-visible"
                  onPress={() => onNavigate("cart")}
                >
                  <ShoppingCart size={16} />
                  {cartCount > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-emerald-400 px-1 text-[10px] font-black leading-none text-slate-950 ring-2 ring-[#080b12]">
                      {cartCount}
                    </span>
                  ) : null}
                </Button>
              </Tooltip>
              <Popover placement="bottom end" showArrow>
                <Popover.Trigger>
                  <Button
                    size="sm"
                    variant="flat"
                    isIconOnly
                    aria-label="User menu"
                  >
                    <User size={16} />
                  </Button>
                </Popover.Trigger>
                <Popover.Content>
                  <div className="flex min-w-36 flex-col gap-1 p-2">
                    <Button
                      variant="light"
                      fullWidth
                      startContent={<User size={16} />}
                      onPress={() => onNavigate("profile")}
                    >
                      Profile
                    </Button>
                    <Button
                      variant="light"
                      fullWidth
                      startContent={<Package size={16} />}
                      onPress={() => onNavigate("orders")}
                    >
                      Orders
                    </Button>
                    <Button
                      variant="light"
                      fullWidth
                      startContent={<Gift size={16} />}
                      onPress={() => onNavigate("rewards")}
                    >
                      Rewards
                    </Button>
                    <Divider />
                    <Button
                      variant="light"
                      fullWidth
                      startContent={<LogOut size={16} />}
                      color="danger"
                      onPress={onLogout}
                    >
                      Log Out
                    </Button>
                  </div>
                </Popover.Content>
              </Popover>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="flat"
                onPress={() => onNavigate("register")}
              >
                Register
              </Button>
              <Button
                size="sm"
                color="success"
                onPress={() => onNavigate("login")}
              >
                Login
              </Button>
            </>
          )}
        </div>
      </div>
    </motion.header>
  );
}

function HomePage({ isDark, onNavigate }) {
  const heroOverlay = isDark
    ? "linear-gradient(90deg, rgba(3, 7, 18, .88), rgba(3, 7, 18, .64), rgba(3, 7, 18, .38))"
    : "linear-gradient(90deg, rgba(248, 250, 252, .92), rgba(248, 250, 252, .74), rgba(248, 250, 252, .28))";
  return (
    <section>
      <motion.div
        className={`relative flex min-h-[calc(100vh-76px)] items-center border-b px-4 py-20 transition-colors sm:px-8 lg:px-0 ${isDark ? "border-white/10" : "border-slate-200"}`}
        style={{
          backgroundImage: `${heroOverlay}, url(${heroImage})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
          <motion.div
            className="max-w-2xl"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Chip
              className="border border-white/15 bg-white/10 backdrop-blur-md"
              color="success"
              variant="flat"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span>Fast • Reliable • Smart Beverage Distribution</span>
            </Chip>
            <h1
              className={`mt-7 text-5xl font-black leading-[.98] sm:text-6xl lg:text-7xl ${isDark ? "text-white" : "text-slate-950"}`}
            >
              Order Your Beverages Online with Ease
            </h1>
            <p
              className={`mt-5 max-w-xl text-lg leading-8 ${isDark ? "text-slate-100" : "text-slate-700"}`}
            >
              Smart inventory, fast delivery, and digital payments built for
              sari-sari stores, households, and local buyers.
            </p>
            <motion.div
              className="mt-8 flex flex-wrap gap-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              <Button
                color="success"
                size="lg"
                onPress={() => onNavigate("products")}
              >
                <ShoppingCart size={18} />
                Shop Now
              </Button>
              <Button
                className="bg-slate-900/80 text-white"
                size="lg"
                variant="flat"
                onPress={() => onNavigate("login")}
              >
                <LockKeyhole size={18} />
                Login
              </Button>
            </motion.div>
          </motion.div>
          <motion.div
            className="hidden lg:block"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card
              className={`border shadow-2xl backdrop-blur-xl ${isDark ? "border-white/10 bg-slate-950/70 shadow-black/40" : "border-white/70 bg-white/75 shadow-slate-300/40"}`}
            >
              <CardHeader className="justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-300">
                    Customer panel
                  </p>
                  <h2
                    className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-950"}`}
                  >
                    Ready in 3 steps
                  </h2>
                </div>
                <Avatar color="success" size="lg" variant="solid">
                  <Avatar.Fallback>
                    <Package size={20} />
                  </Avatar.Fallback>
                </Avatar>
              </CardHeader>
              <CardBody className="gap-4">
                {HOME_STATS.map((item) => (
                  <Card
                    key={item.label}
                    className={`border ${isDark ? "border-white/10 bg-white/[.05]" : "border-slate-200 bg-white/80"}`}
                  >
                    <CardBody className="flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Avatar color="success" variant="flat">
                          <Avatar.Fallback>{item.icon}</Avatar.Fallback>
                        </Avatar>
                        <div>
                          <strong
                            className={isDark ? "text-white" : "text-slate-950"}
                          >
                            {item.label}
                          </strong>
                          <p
                            className={
                              isDark
                                ? "text-xs text-slate-400"
                                : "text-xs text-slate-500"
                            }
                          >
                            Simple, clean, and mobile-ready.
                          </p>
                        </div>
                      </div>
                      <Chip color="success" variant="flat">
                        {item.value}
                      </Chip>
                    </CardBody>
                  </Card>
                ))}
                <Button
                  color="success"
                  size="lg"
                  onPress={() => onNavigate("register")}
                >
                  <UserPlus size={18} />
                  Create customer account
                </Button>
              </CardBody>
            </Card>
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        id="about"
        className={`border-b px-4 py-20 transition-colors ${isDark ? "border-white/10 bg-[#070d14]" : "border-slate-200 bg-white"}`}
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              className={`text-4xl font-black ${isDark ? "text-white" : "text-slate-950"}`}
            >
              Why Choose Jazjo?
            </h2>
            <p
              className={isDark ? "mt-3 text-slate-400" : "mt-3 text-slate-600"}
            >
              Streamlining beverage distribution with clean technology and
              reliable service.
            </p>
          </div>
          <motion.div
            className="mt-10 grid gap-5 md:grid-cols-3"
            variants={staggerVariants}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-60px" }}
          >
            {HOME_FEATURES.map((feature) => (
              <motion.div
                key={feature.title}
                variants={cardVariants}
                transition={{ duration: 0.35 }}
              >
                <Card
                  className={`border shadow-xl ${isDark ? "border-white/10 bg-slate-900/80 shadow-black/20" : "border-slate-200 bg-white shadow-slate-200/80"}`}
                >
                  <CardBody className="gap-5 p-6">
                    <Avatar color="success" size="lg" variant="flat">
                      <Avatar.Fallback>{feature.icon}</Avatar.Fallback>
                    </Avatar>
                    <div>
                      <h3
                        className={`text-xl font-black ${isDark ? "text-white" : "text-slate-950"}`}
                      >
                        {feature.title}
                      </h3>
                      <p
                        className={
                          isDark
                            ? "mt-3 leading-7 text-slate-300"
                            : "mt-3 leading-7 text-slate-600"
                        }
                      >
                        {feature.copy}
                      </p>
                    </div>
                  </CardBody>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        id="products-preview"
        className={`border-b px-4 py-20 text-center transition-colors ${isDark ? "border-white/10 bg-[#080d15]" : "border-slate-200 bg-slate-50"}`}
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
      >
        <div className="mx-auto max-w-3xl">
          <h2
            className={`text-4xl font-black ${isDark ? "text-white" : "text-slate-950"}`}
          >
            Products
          </h2>
          <p className={isDark ? "mt-4 text-slate-400" : "mt-4 text-slate-600"}>
            View available beverages by category and place an order through the
            customer product page.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {CATEGORY_OPTIONS.map((category) => (
              <Chip key={category} color="success" variant="flat">
                {category}
              </Chip>
            ))}
          </div>
          <Button
            className="mt-10"
            color="success"
            size="lg"
            onPress={() => onNavigate("products")}
          >
            <Package size={18} />
            Go to Products
          </Button>
        </div>
      </motion.div>
    </section>
  );
}

function ProductCard({
  product,
  compact = false,
  onAdd,
  onToggleFavorite,
  isFavorite,
}) {
  const [packKey, setPackKey] = useState("1");
  const pack =
    PACK_OPTIONS.find((item) => String(item.caseQty) === packKey) ||
    PACK_OPTIONS[0];
  const out = Number(product.stockCases || 0) <= 0;
  const packOptionLabel = (item) =>
    `${item.label} - ${money(product.price * item.caseQty)}`;
  return (
    <motion.div
      variants={cardVariants}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <Card className="group h-full border border-white/10 bg-slate-900/80 shadow-xl shadow-black/20 transition-shadow duration-300 hover:shadow-2xl hover:shadow-emerald-500/10">
        <CardBody className="gap-4">
          <div
            className={`${compact ? "h-36" : "h-44"} rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-400/10 via-white/[.03] to-sky-400/10 p-3 transition-all duration-300 group-hover:border-emerald-500/30 group-hover:from-emerald-400/20`}
          >
            <Image
              alt={product.name}
              className="h-full w-full object-contain drop-shadow-xl transition-transform duration-300 group-hover:scale-105"
              src={product.img}
            />
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="line-clamp-2 font-black text-white">
                {product.name}
              </h3>
              <p className="text-sm text-slate-400">
                {product.category} - {product.unit}
              </p>
            </div>
            <Tooltip
              content={isFavorite ? "Remove from saved" : "Save item"}
              placement="top"
              showArrow
            >
              <Button
                size="sm"
                variant={isFavorite ? "solid" : "flat"}
                color={isFavorite ? "danger" : "default"}
                aria-label={isFavorite ? "Remove from saved" : "Save item"}
                onPress={() => onToggleFavorite?.(product)}
              >
                <Heart size={16} fill={isFavorite ? "currentColor" : "none"} />
              </Button>
            </Tooltip>
          </div>
          <div className="flex items-center justify-between gap-2">
            <strong className="text-lg">{money(product.price)}</strong>
            <Chip
              size="sm"
              color={
                out
                  ? "danger"
                  : product.stockCases <= 10
                    ? "warning"
                    : "success"
              }
              variant="flat"
            >
              {out ? "Out of Stock" : `${formatQty(product.stockCases)} cases`}
            </Chip>
          </div>
          {product.description ? (
            <p className="min-h-10 text-sm leading-6 text-slate-300 line-clamp-2">
              {product.description}
            </p>
          ) : null}
          <div className="mt-auto grid gap-3">
            <Select
              aria-label={`Pack size for ${product.name}`}
              selectedKey={packKey}
              onSelectionChange={(key) => setPackKey(String(key))}
              fullWidth
              variant="bordered"
            >
              <Select.Trigger className="min-h-11 rounded-2xl border border-white/10 bg-slate-950/80 px-3 text-left text-sm font-black text-white">
                <Select.Value>{packOptionLabel(pack)}</Select.Value>
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover
                placement="bottom start"
                className="min-w-56 rounded-2xl border border-white/10 bg-slate-950 p-1 shadow-2xl shadow-black/40"
              >
                <ListBox
                  aria-label={`Pack options for ${product.name}`}
                  selectionMode="single"
                >
                  {PACK_OPTIONS.map((item) => {
                    const key = String(item.caseQty);
                    return (
                      <ListBox.Item
                        id={key}
                        key={key}
                        textValue={packOptionLabel(item)}
                        className="rounded-xl px-3 py-2 text-sm text-slate-100 data-[selected=true]:bg-emerald-500 data-[selected=true]:text-slate-950"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span>{item.label}</span>
                          <strong>{money(product.price * item.caseQty)}</strong>
                        </div>
                      </ListBox.Item>
                    );
                  })}
                </ListBox>
              </Select.Popover>
            </Select>
            <Button
              color="success"
              size="md"
              isDisabled={out}
              onPress={() => onAdd(product, pack)}
            >
              <ShoppingCart size={16} />
              Add to Cart
            </Button>
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
}

function ShopPage({
  products,
  loading,
  cartCount = 0,
  onAdd,
  publicMode = false,
  onNavigate,
  favorites,
  onToggleFavorite,
}) {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("Soft Drinks");
  const [page, setPage] = useState(1);
  const perPage = 8;
  const categoryCounts = CATEGORY_OPTIONS.reduce((acc, item) => {
    acc[item] = products.filter((product) => product.category === item).length;
    return acc;
  }, {});
  const filtered = products.filter((product) => {
    const text = `${product.name} ${product.category}`.toLowerCase();
    return (
      product.category === category &&
      (!term || text.includes(term.toLowerCase()))
    );
  });
  const inStockCount = filtered.filter(
    (product) => Number(product.stockCases || 0) > 0,
  ).length;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  useEffect(() => {
    if (!CATEGORY_OPTIONS.includes(category)) setCategory(CATEGORY_OPTIONS[0]);
  }, [category]);
  useEffect(() => {
    setPage(1);
  }, [category, term]);
  const skeletonItems = Array.from({ length: 4 }, (_, i) => i);
  return (
    <motion.section
      className="space-y-6"
      variants={staggerVariants}
      initial="initial"
      animate="animate"
    >
      <PageHeader
        title={publicMode ? "Products" : "Shop"}
        subtitle="Browse products, choose pack size, and add to cart."
        icon={<Package />}
      />
      <Tabs
        selectedKey={category}
        onSelectionChange={(key) => setCategory(String(key))}
        color="success"
        variant="underlined"
        size="sm"
      >
        <Tabs.List className="gap-0 border-b border-white/10">
          {CATEGORY_OPTIONS.map((item) => (
            <Tabs.Tab
              id={item}
              key={item}
              className="relative px-4 py-2 data-[selected=true]:text-emerald-400"
            >
              <div className="flex items-center gap-2">
                <span>{item}</span>
                <Chip
                  size="sm"
                  variant="flat"
                  className="min-w-5 h-5 text-[11px]"
                >
                  {categoryCounts[item] || 0}
                </Chip>
              </div>
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <motion.div
        className="sticky top-[76px] z-20"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border border-white/10 bg-slate-950/90 shadow-xl shadow-black/20 backdrop-blur-xl">
          <CardBody className="gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <Input
                startContent={<Search size={18} />}
                value={term}
                onValueChange={setTerm}
                placeholder={`Search ${category.toLowerCase()}...`}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip color="success" variant="flat">
                {filtered.length} results
              </Chip>
              <Chip color="primary" variant="flat">
                {inStockCount} in stock
              </Chip>
              {!publicMode ? (
                <Tooltip content="Go to cart" placement="bottom" showArrow>
                  <Button color="success" onPress={() => onNavigate("cart")}>
                    <ShoppingCart size={16} />
                    Cart {cartCount}
                  </Button>
                </Tooltip>
              ) : null}
            </div>
          </CardBody>
        </Card>
      </motion.div>
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {skeletonItems.map((i) => (
            <Card key={i} className="border border-white/10 bg-slate-900/80">
              <CardBody className="gap-4">
                <Skeleton className="h-44 w-full rounded-2xl" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-10 w-full" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={48} />}
          title="No products found"
          description="Try another category or clear your search."
        >
          {term ? (
            <Button variant="flat" onPress={() => setTerm("")}>
              Clear search
            </Button>
          ) : null}
        </EmptyState>
      ) : null}
      {!loading && filtered.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paged.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAdd={onAdd}
                onToggleFavorite={onToggleFavorite}
                isFavorite={favorites?.includes(String(product.id))}
              />
            ))}
          </div>
          {totalPages > 1 ? (
            <div className="flex justify-center">
              <Pagination
                total={totalPages}
                page={safePage}
                onChange={setPage}
                color="success"
                size="sm"
                showControls
                showShadow
              />
            </div>
          ) : null}
        </>
      ) : null}
      {publicMode ? (
        <Card className="border border-success/20 bg-success/10">
          <CardBody className="flex-row items-center justify-between gap-3">
            <div>
              <strong>Ready to checkout?</strong>
              <p className="text-sm text-slate-300">
                Log in or create an account to place your order.
              </p>
            </div>
            <Button color="success" onPress={() => onNavigate("login")}>
              Continue
            </Button>
          </CardBody>
        </Card>
      ) : null}
    </motion.section>
  );
}

function Dashboard({
  products,
  orders,
  onNavigate,
  onAdd,
  favorites,
  onToggleFavorite,
}) {
  const featured = products
    .filter((product) => product.stockCases > 0)
    .slice(0, 4);
  return (
    <motion.section
      className="space-y-5"
      variants={staggerVariants}
      initial="initial"
      animate="animate"
    >
      <PageHeader
        title="Customer Dashboard"
        subtitle="A quick view of ordering, rewards, and delivery status."
        icon={<Home />}
      />
      <motion.div
        className="grid gap-4 sm:grid-cols-3"
        variants={staggerVariants}
      >
        <motion.div variants={cardVariants} transition={{ duration: 0.3 }}>
          <Metric label="Orders" value={orders.length} />
        </motion.div>
        <motion.div variants={cardVariants} transition={{ duration: 0.3 }}>
          <Metric label="Available Products" value={products.length} />
        </motion.div>
        <motion.div variants={cardVariants} transition={{ duration: 0.3 }}>
          <Metric label="Account" value={currentCustomerEmail()} />
        </motion.div>
      </motion.div>
      <motion.div variants={cardVariants} transition={{ duration: 0.3 }}>
        <Card>
          <CardHeader className="justify-between">
            <div>
              <h2 className="text-lg font-black">Recommended</h2>
              <p className="text-sm text-slate-400">
                Popular in-stock items for fast reordering.
              </p>
            </div>
            <Button variant="flat" onPress={() => onNavigate("shop")}>
              Shop All
            </Button>
          </CardHeader>
          <CardBody>
            <motion.div
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              variants={staggerVariants}
            >
              {featured.map((product) => (
                <ProductCard
                  compact
                  key={product.id}
                  product={product}
                  onAdd={onAdd}
                  onToggleFavorite={onToggleFavorite}
                  isFavorite={favorites?.includes(String(product.id))}
                />
              ))}
            </motion.div>
          </CardBody>
        </Card>
      </motion.div>
    </motion.section>
  );
}

function CartPage({ products, cart, setCart, refreshOrders, setMessage }) {
  const [form, setForm] = useState({
    customerName: "",
    contact: "",
    address: "",
    paymentMethod: "QRPH (GCash)",
  });
  const lines = cart
    .map((item) => {
      const product = products.find((entry) => entry.id === item.productId);
      const caseQty = Number(item.caseQty || 1);
      return product
        ? {
            ...item,
            product,
            caseQty,
            lineTotal: Number(item.qty || 0) * caseQty * product.price,
            caseTotal: Number(item.qty || 0) * caseQty,
          }
        : null;
    })
    .filter(Boolean);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const deliveryFee = subtotal >= 800 || subtotal === 0 ? 0 : 60;
  const total = subtotal + deliveryFee;

  const updateQty = (line, delta) => {
    const nextQty = Number(line.qty || 0) + delta;
    const sameLine = (item) =>
      item.productId === line.productId &&
      Number(item.caseQty || 1) === line.caseQty;
    if (nextQty <= 0) return setCart(cart.filter((item) => !sameLine(item)));
    const allowed = canAddCartQuantity({
      existingQty: line.qty,
      addQty: delta,
      caseQty: line.caseQty,
      stockCases: line.product.stockCases,
    });
    if (delta > 0 && !allowed.ok)
      return setMessage(`${line.product.name}: ${allowed.message}`);
    setCart(
      cart.map((item) => (sameLine(item) ? { ...item, qty: nextQty } : item)),
    );
  };

  const checkout = async (event) => {
    event.preventDefault();
    if (!lines.length) return setMessage("Your cart is empty.");
    const contact = validateContact(form.contact);
    if (!contact.ok) return setMessage(contact.message);
    const result = await apiCreateOrder({
      ...form,
      returnBaseUrl: window.location.origin,
      items: lines.map((line) => ({
        productId: line.product.id,
        qty: line.caseTotal,
      })),
    });
    if (result.order) {
      const existing = readStorage(ORDERS_KEY, []).filter(
        (order) => order.id !== result.order.id,
      );
      writeStorage(ORDERS_KEY, [result.order, ...existing]);
    }
    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return;
    }
    setCart([]);
    await refreshOrders().catch(() => {});
    go("orders");
  };

  if (!lines.length) {
    return (
      <motion.section
        className="space-y-5"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <PageHeader
          title="Cart"
          subtitle="Review items before checkout."
          icon={<ShoppingCart />}
        />
        <EmptyState
          icon={<ShoppingCart size={48} />}
          title="Your cart is empty"
          description="Browse products and add items to get started."
        >
          <Button color="success" onPress={() => go("shop")}>
            <Package size={16} />
            Browse Products
          </Button>
        </EmptyState>
      </motion.section>
    );
  }

  return (
    <motion.section
      className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader className="justify-between">
          <h1 className="text-xl font-black">Cart Items</h1>
          <Chip color="success" variant="flat">
            {lines.length} item(s)
          </Chip>
        </CardHeader>
        <CardBody className="gap-3">
          {lines.map((line, idx) => (
            <motion.div
              key={`${line.productId}-${line.caseQty}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className="bg-white/5">
                <CardBody className="flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Image
                      alt={line.product.name}
                      className="h-16 w-16 object-contain"
                      src={line.product.img}
                    />
                    <div>
                      <strong>{line.product.name}</strong>
                      <p className="text-sm text-slate-400">
                        {line.packLabel} - {formatQty(line.caseTotal)} case(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tooltip
                      content="Decrease quantity"
                      placement="top"
                      showArrow
                    >
                      <Button
                        size="sm"
                        variant="flat"
                        isIconOnly
                        onPress={() => updateQty(line, -1)}
                      >
                        <span className="text-lg">-</span>
                      </Button>
                    </Tooltip>
                    <Chip variant="flat" className="min-w-8 justify-center">
                      {line.qty}
                    </Chip>
                    <Tooltip
                      content="Increase quantity"
                      placement="top"
                      showArrow
                    >
                      <Button
                        size="sm"
                        variant="flat"
                        isIconOnly
                        onPress={() => updateQty(line, 1)}
                      >
                        <span className="text-lg">+</span>
                      </Button>
                    </Tooltip>
                    <strong className="ml-2 min-w-20 text-right">
                      {money(line.lineTotal)}
                    </strong>
                    <Tooltip content="Remove item" placement="top" showArrow>
                      <Button
                        size="sm"
                        variant="light"
                        isIconOnly
                        className="text-red-400"
                        onPress={() => updateQty(line, -999)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </Tooltip>
                  </div>
                </CardBody>
              </Card>
            </motion.div>
          ))}
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="text-xl font-black">Checkout</h2>
        </CardHeader>
        <CardBody>
          <form className="space-y-3" onSubmit={checkout}>
            <Summary
              subtotal={subtotal}
              deliveryFee={deliveryFee}
              total={total}
            />
            <Divider />
            <Input
              isRequired
              label="Name"
              value={form.customerName}
              onValueChange={(v) => setForm({ ...form, customerName: v })}
            />
            <Input
              isRequired
              label="Contact"
              value={form.contact}
              onValueChange={(v) => setForm({ ...form, contact: v })}
              placeholder="09xxxxxxxxx"
            />
            <Textarea
              isRequired
              label="Delivery Address"
              value={form.address}
              onValueChange={(v) => setForm({ ...form, address: v })}
            />
            <div className="grid gap-2">
              <span className="text-sm font-semibold text-slate-300">
                Payment Method
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  "QRPH (GCash)",
                  "QRPH (Maya)",
                  "QRPH (Bank QR)",
                  "Cash on Delivery (COD)",
                ].map((method) => (
                  <Button
                    key={method}
                    color={
                      form.paymentMethod === method ? "success" : "default"
                    }
                    variant={
                      form.paymentMethod === method ? "flat" : "bordered"
                    }
                    onPress={() => setForm({ ...form, paymentMethod: method })}
                  >
                    {method}
                  </Button>
                ))}
              </div>
            </div>
            <Button color="success" type="submit" className="w-full">
              Place Order
            </Button>
          </form>
        </CardBody>
      </Card>
    </motion.section>
  );
}

function OrdersPage({ orders, refreshOrders, onNavigate, setMessage }) {
  const [statusFilter, setStatusFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkingPayment, setCheckingPayment] = useState("");
  useEffect(() => {
    setLoading(true);
    refreshOrders()
      .then(() => setError(""))
      .catch((err) =>
        setError(
          err.message || "Unable to refresh orders. Showing saved orders.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  const checkPayment = async (order) => {
    if (!order?.id) return;
    setCheckingPayment(order.id);
    try {
      const result = await apiReconcilePayment(order.id);
      await refreshOrders();
      if (result.reconciled || result.alreadyPaid) {
        setMessage?.(`Payment confirmed for ${order.id}.`);
      } else if (isRetryablePaymentReason(result.reason)) {
        setMessage?.("QRPH payment is still processing. Please try again shortly.");
      } else {
        setMessage?.("PayMongo has not confirmed this QRPH payment yet.");
      }
    } catch (err) {
      setMessage?.(err.message || "Unable to check payment right now.");
    } finally {
      setCheckingPayment("");
    }
  };
  const statuses = [
    "All",
    "Pending Payment",
    "Order Placed",
    "Preparing",
    "In Transit",
    "Out for Delivery",
    "Delivered",
    "Cancelled",
  ];
  useEffect(() => {
    if (!statuses.includes(statusFilter)) setStatusFilter("All");
  }, [statusFilter]);
  const filtered =
    statusFilter === "All"
      ? orders
      : orders.filter((o) => statusLabel(o.status) === statusFilter);
  const statusCounts = statuses.reduce((acc, s) => {
    acc[s] =
      s === "All"
        ? orders.length
        : orders.filter((o) => statusLabel(o.status) === s).length;
    return acc;
  }, {});
  const activeOrders = orders.filter(
    (order) => !["Delivered", "Cancelled"].includes(statusLabel(order.status)),
  ).length;
  const deliveredOrders = statusCounts.Delivered || 0;
  const orderTotal = orders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0,
  );
  const pendingPaymentCount = orders.filter(isPendingPaymentOrder).length;
  const latestOrder = orders[0];
  if (loading) {
    return (
      <section className="space-y-5">
        <PageHeader
          title="Orders"
          subtitle="Track your orders from placement to delivery."
          icon={<Package />}
        />
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardBody>
                <Skeleton className="h-6 w-full" />
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    );
  }
  return (
    <motion.section
      className="space-y-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <PageHeader
        title="Orders"
        subtitle="Track your orders from placement to delivery."
        icon={<Package />}
      />
      {error ? (
        <Alert status="warning" variant="flat">
          <Alert.Content>
            <Alert.Title>Using saved orders</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {pendingPaymentCount ? (
        <Alert status="warning" variant="flat">
          <Alert.Content>
            <Alert.Title>QRPH payment pending</Alert.Title>
            <Alert.Description>
              {pendingPaymentCount} order(s) are waiting for PayMongo confirmation.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Active Orders" value={activeOrders} />
        <Metric label="Delivered" value={deliveredOrders} />
        <Metric label="Total Ordered" value={money(orderTotal)} />
      </div>
      {latestOrder ? (
        <Card className="overflow-hidden border border-emerald-400/20 bg-slate-950/90 shadow-xl shadow-black/20">
          <CardBody className="gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar color="success" variant="flat" size="lg">
                <Avatar.Fallback>
                  <Truck size={20} />
                </Avatar.Fallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-emerald-300">
                  Latest Order
                </p>
                <h2 className="truncate text-lg font-black text-white">
                  {latestOrder.id}
                </h2>
                <p className="line-clamp-1 text-sm text-slate-400">
                  {(latestOrder.items || [])
                    .map((item) => item.name)
                    .join(", ") || "Order items"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <OrderStatusChip status={latestOrder.status} />
              <PaymentStatusChip order={latestOrder} />
              <strong className="text-xl text-white">
                {money(latestOrder.total)}
              </strong>
              {isPendingPaymentOrder(latestOrder) ? (
                <Button
                  color="warning"
                  variant="flat"
                  isDisabled={checkingPayment === latestOrder.id}
                  onPress={() => checkPayment(latestOrder)}
                >
                  <CreditCard size={16} />
                  {checkingPayment === latestOrder.id ? "Checking..." : "Check Payment"}
                </Button>
              ) : null}
              <Button
                color="success"
                onPress={() => onNavigate(`order/${latestOrder.id}`)}
              >
                View Details
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}
      <Tabs
        selectedKey={statusFilter}
        onSelectionChange={(key) => setStatusFilter(String(key))}
        color="success"
        variant="underlined"
        size="sm"
      >
        <Tabs.List className="gap-0 overflow-x-auto border-b border-white/10">
          {statuses.map((s) => (
            <Tabs.Tab
              id={s}
              key={s}
              className="min-w-max px-4 py-2 data-[selected=true]:text-emerald-400"
            >
              <div className="flex items-center gap-2">
                <span>{s}</span>
                <Chip
                  size="sm"
                  variant="flat"
                  className="min-w-5 h-5 text-[11px]"
                >
                  {statusCounts[s]}
                </Chip>
              </div>
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <motion.div
        className="grid gap-3"
        variants={staggerVariants}
        initial="initial"
        animate="animate"
      >
        {filtered.map((order, idx) => (
          <OrderListCard
            key={order.id || idx}
            order={order}
            index={idx}
            onNavigate={onNavigate}
            onCheckPayment={checkPayment}
            isCheckingPayment={checkingPayment === order.id}
          />
        ))}
        {!loading && filtered.length === 0 ? (
          <EmptyState
            icon={<Package size={48} />}
            title="No orders found"
            description={
              statusFilter !== "All"
                ? `No orders with status "${statusFilter}".`
                : "Place your first order to get started."
            }
          >
            <Button color="success" onPress={() => onNavigate("shop")}>
              <ShoppingCart size={16} />
              Browse Products
            </Button>
          </EmptyState>
        ) : null}
      </motion.div>
    </motion.section>
  );
}

function OrderDetailsPage({ id, onNavigate }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiOrderDetails(id)
      .then(setOrder)
      .catch((err) => setError(err.message));
  }, [id]);
  if (error)
    return (
      <section className="space-y-5">
        <Button variant="flat" onPress={() => onNavigate("orders")}>
          <ArrowLeft size={16} />
          <span>Back to Orders</span>
        </Button>
        <Alert status="danger" variant="flat">
          <Alert.Content>
            <Alert.Title>Unable to load order</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      </section>
    );
  if (!order)
    return (
      <section className="space-y-5">
        <Button variant="flat" onPress={() => onNavigate("orders")}>
          <ArrowLeft size={16} />
          <span>Back to Orders</span>
        </Button>
        <Card>
          <CardBody className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </CardBody>
        </Card>
      </section>
    );
  const label = statusLabel(order.status);
  return (
    <motion.section
      className="space-y-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Button variant="flat" onPress={() => onNavigate("orders")}>
        <ArrowLeft size={16} />
        <span>Back to Orders</span>
      </Button>
      <Card className="overflow-hidden border border-white/10 bg-slate-950/90 shadow-2xl shadow-black/30">
        <CardHeader className="gap-4 bg-white/[.03] p-6 md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar color="success" variant="flat" size="lg">
              <Avatar.Fallback>
                <Package size={20} />
              </Avatar.Fallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-emerald-300">
                Order Details
              </p>
              <h1 className="truncate text-2xl font-black text-white">
                {order.id}
              </h1>
              <p className="text-sm text-slate-400">
                {order.createdAt || "Recently placed"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusChip status={label} />
            <PaymentStatusChip order={order} />
          </div>
        </CardHeader>
        <CardBody className="gap-5 p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <DetailTile
              label="Payment"
              value={`${order.paymentMethod || "QRPH"} - ${paymentStatusLabel(order.paymentStatus, order.status)}`}
              icon={<CreditCard size={18} />}
            />
            <DetailTile
              label="Contact"
              value={order.contact || "Customer contact"}
              icon={<Phone size={18} />}
            />
            <DetailTile
              label="Delivery Address"
              value={order.address || "Delivery address"}
              icon={<MapPin size={18} />}
            />
          </div>
          <Card className="border border-white/10 bg-white/[.04]">
            <CardBody className="gap-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-white">Items</h2>
                  <p className="text-sm text-slate-400">
                    {order.items.length} item(s) in this order
                  </p>
                </div>
                <strong className="text-xl text-white">
                  {money(order.total)}
                </strong>
              </div>
              <Divider />
              <div className="grid gap-3">
                {order.items.map((item) => (
                  <motion.div
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/70 p-3"
                    key={`${item.productId}-${item.name}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Image
                        alt={item.name}
                        className="h-14 w-14 shrink-0 rounded-xl bg-white/[.04] object-contain p-2"
                        src={item.img}
                      />
                      <div className="min-w-0">
                        <strong className="block truncate text-white">
                          {item.name}
                        </strong>
                        <p className="text-sm text-slate-400">
                          {formatQty(item.qty)} case(s)
                        </p>
                      </div>
                    </div>
                    <strong className="shrink-0 text-white">
                      {money(item.price * item.qty)}
                    </strong>
                  </motion.div>
                ))}
              </div>
            </CardBody>
          </Card>
          <Summary
            subtotal={order.subtotal}
            deliveryFee={order.deliveryFee}
            total={order.total}
          />
        </CardBody>
      </Card>
    </motion.section>
  );
}

function RewardsPage({ setMessage }) {
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [redeemTarget, setRedeemTarget] = useState(null);
  useEffect(() => {
    apiRewards()
      .then((data) => setPoints(data.points || 0))
      .catch((err) => setMessage(err.message))
      .finally(() => setLoading(false));
  }, []);
  const redeem = async (rewardId) => {
    try {
      const data = await apiRedeemReward(rewardId);
      setPoints(data.points || 0);
      setRedeemTarget(null);
      setMessage("Reward redeemed.");
    } catch (err) {
      setMessage(err.message);
    }
  };
  if (loading) {
    return (
      <section className="space-y-5">
        <PageHeader
          title="Rewards"
          subtitle="Redeem points for exclusive perks."
          icon={<Sparkles />}
        />
        <Skeleton className="h-4 w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardBody className="gap-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-8 w-20" />
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    );
  }
  return (
    <motion.section
      className="space-y-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <PageHeader
        title="Rewards"
        subtitle={`${points} points available for your account.`}
        icon={<Sparkles />}
      />
      <Progress value={Math.min(100, points)} />
      <div className="grid gap-4 md:grid-cols-3">
        {REWARD_CATALOG.map((reward) => (
          <motion.div key={reward.id} transition={{ duration: 0.3 }}>
            <RewardCard
              reward={reward}
              points={points}
              onRedeem={() => setRedeemTarget(reward)}
            />
          </motion.div>
        ))}
      </div>
      {redeemTarget && (
        <Modal isOpen onOpenChange={() => setRedeemTarget(null)}>
          <Modal.Backdrop>
            <Modal.Container size="sm">
              <Modal.Dialog>
                <Modal.Header>
                  <h2 className="text-lg font-black text-white">Redeem Reward</h2>
                </Modal.Header>
                <Modal.Body>
                  <div className="space-y-3">
                    <h3 className="font-bold text-emerald-400">
                      {redeemTarget.name}
                    </h3>
                    <p className="text-sm text-slate-300">
                      {redeemTarget.description}
                    </p>
                    <Chip
                      color={points >= redeemTarget.points ? "success" : "danger"}
                      variant="flat"
                    >
                      {redeemTarget.points} points
                    </Chip>
                    <p className="text-sm text-slate-400">
                      {points >= redeemTarget.points
                        ? `You have ${points} points. After redeeming, you'll have ${points - redeemTarget.points} points remaining.`
                        : `You need ${redeemTarget.points - points} more points.`}
                    </p>
                  </div>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="flat" onPress={() => setRedeemTarget(null)}>
                    Cancel
                  </Button>
                  <Button
                    color="success"
                    isDisabled={points < redeemTarget.points}
                    onPress={() => redeem(redeemTarget.id)}
                  >
                    <Gift size={16} />
                    Confirm Redeem
                  </Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      )}
    </motion.section>
  );
}

function ProfilePage({ setMessage }) {
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    contact: "",
    email: "",
    address: "",
  });
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
  });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiProfile()
      .then(setProfile)
      .catch((err) => setMessage(err.message))
      .finally(() => setLoading(false));
  }, []);
  const saveProfile = async (event) => {
    event.preventDefault();
    const contact = validateContact(profile.contact);
    if (!contact.ok) return setMessage(contact.message);
    await apiSaveProfile(profile);
    setMessage("Profile saved.");
  };
  const savePassword = async (event) => {
    event.preventDefault();
    const valid = validatePassword(passwords.newPassword);
    if (!valid.ok) return setMessage(valid.message);
    await apiChangePassword(passwords);
    setPasswords({ currentPassword: "", newPassword: "" });
    setMessage("Password changed.");
  };
  if (loading) {
    return (
      <section className="space-y-5">
        <PageHeader
          title="Profile"
          subtitle="Manage your account details."
          icon={<User />}
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardBody className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardBody>
          </Card>
        </div>
      </section>
    );
  }
  return (
    <motion.section
      className="grid gap-5 lg:grid-cols-2"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card>
        <CardHeader className="flex items-center gap-3">
          <Avatar color="success" variant="flat" size="lg">
            <Avatar.Fallback>
              <User size={20} />
            </Avatar.Fallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-black">Profile</h1>
            <p className="text-sm text-slate-400">
              Update your personal information.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveProfile}>
            <Input
              label="First Name"
              value={profile.firstName || ""}
              onValueChange={(v) => setProfile({ ...profile, firstName: v })}
            />
            <Input
              label="Last Name"
              value={profile.lastName || ""}
              onValueChange={(v) => setProfile({ ...profile, lastName: v })}
            />
            <Input
              label="Contact"
              value={profile.contact || ""}
              onValueChange={(v) => setProfile({ ...profile, contact: v })}
            />
            <Input label="Email" value={profile.email || ""} isReadOnly />
            <Textarea
              label="Address"
              className="sm:col-span-2"
              value={profile.address || ""}
              onValueChange={(v) => setProfile({ ...profile, address: v })}
            />
            <Button color="success" type="submit" className="sm:col-span-2">
              Save Profile
            </Button>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader className="flex items-center gap-3">
          <Avatar color="warning" variant="flat" size="lg">
            <Avatar.Fallback>
              <LockKeyhole size={20} />
            </Avatar.Fallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-black">Change Password</h2>
            <p className="text-sm text-slate-400">
              Update your account password.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <form className="space-y-3" onSubmit={savePassword}>
            <Input
              label="Current Password"
              type="password"
              value={passwords.currentPassword}
              onValueChange={(v) =>
                setPasswords({ ...passwords, currentPassword: v })
              }
            />
            <Input
              label="New Password"
              type="password"
              value={passwords.newPassword}
              onValueChange={(v) =>
                setPasswords({ ...passwords, newPassword: v })
              }
            />
            <Button color="success" type="submit">
              Update Password
            </Button>
          </form>
        </CardBody>
      </Card>
    </motion.section>
  );
}

function LoginPage({ onNavigate, setMessage }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [authMessage, setAuthMessage] = useState("");
  const login = async (event) => {
    event.preventDefault();
    setAuthMessage("");
    try {
      const auth = await apiLogin(form);
      saveSession(auth);
      const role = auth?.user?.role || "";
      if (role === "admin") {
        onNavigate("admin/dashboard");
        return;
      }
      if (role === "staff") {
        onNavigate("staff/dashboard");
        return;
      }
      onNavigate("dashboard");
    } catch (err) {
      setAuthMessage(err.message);
    }
  };
  return (
    <AuthCard
      badge="Welcome back"
      title="Customer Login"
      subtitle="Access your cart, orders, profile, and rewards."
      actionLabel="Create an account"
      message={authMessage}
      onAction={() => onNavigate("register")}
    >
      <form className="space-y-4" onSubmit={login}>
        <Input
          isRequired
          label="Email"
          type="email"
          value={form.email}
          onValueChange={(v) => setForm({ ...form, email: v })}
          startContent={<Mail size={18} />}
        />
        <Input
          isRequired
          label="Password"
          type="password"
          value={form.password}
          onValueChange={(v) => setForm({ ...form, password: v })}
          startContent={<LockKeyhole size={18} />}
        />
        <Button color="success" size="lg" type="submit" className="w-full">
          <LockKeyhole size={18} />
          Login
        </Button>
        <Button
          variant="flat"
          className="w-full"
          onPress={() => onNavigate("products")}
        >
          Browse products first
        </Button>
      </form>
    </AuthCard>
  );
}

function RegisterPage({ onNavigate, setMessage }) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    contact: "",
    password: "",
    address: "",
  });
  const [authMessage, setAuthMessage] = useState("");
  const register = async (event) => {
    event.preventDefault();
    setAuthMessage("");
    if (!form.firstName.trim() || !form.lastName.trim())
      return setAuthMessage("First name and last name are required.");
    const contact = validateContact(form.contact);
    if (!contact.ok) return setAuthMessage(contact.message);
    const password = validatePassword(form.password);
    if (!password.ok) return setAuthMessage(password.message);
    try {
      await apiRegister(form);
      setMessage("Account created. Please log in.");
      onNavigate("login");
    } catch (err) {
      setAuthMessage(err.message);
    }
  };
  return (
    <AuthCard
      badge="New customer"
      title="Create Account"
      subtitle="Set up delivery details once and reorder faster next time."
      actionLabel="Already have an account?"
      message={authMessage}
      onAction={() => onNavigate("login")}
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={register}>
        <Input
          isRequired
          label="First Name"
          value={form.firstName}
          onValueChange={(v) => setForm({ ...form, firstName: v })}
          startContent={<UserPlus size={18} />}
        />
        <Input
          isRequired
          label="Last Name"
          value={form.lastName}
          onValueChange={(v) => setForm({ ...form, lastName: v })}
          startContent={<UserPlus size={18} />}
        />
        <Input
          isRequired
          label="Email"
          type="email"
          value={form.email}
          onValueChange={(v) => setForm({ ...form, email: v })}
          className="sm:col-span-2"
          startContent={<Mail size={18} />}
        />
        <Input
          isRequired
          label="Contact"
          value={form.contact}
          onValueChange={(v) => setForm({ ...form, contact: v })}
          placeholder="09xxxxxxxxx"
          startContent={<Phone size={18} />}
        />
        <Input
          isRequired
          label="Password"
          type="password"
          value={form.password}
          onValueChange={(v) => setForm({ ...form, password: v })}
          startContent={<LockKeyhole size={18} />}
        />
        <Textarea
          label="Address"
          value={form.address}
          onValueChange={(v) => setForm({ ...form, address: v })}
          className="sm:col-span-2"
        />
        <Button
          color="success"
          size="lg"
          type="submit"
          className="sm:col-span-2"
        >
          <UserPlus size={18} />
          Register
        </Button>
      </form>
    </AuthCard>
  );
}

function AuthCard({
  badge,
  title,
  subtitle,
  actionLabel,
  message,
  onAction,
  children,
}) {
  return (
    <motion.section
      className="mx-auto grid max-w-5xl gap-5 py-10 lg:grid-cols-[.85fr_1.15fr]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card className="overflow-hidden border border-white/10 bg-slate-950 shadow-2xl shadow-black/30">
        <CardBody
          className="justify-between gap-8 p-8"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(16, 185, 129, .18), rgba(15, 23, 42, .90)), url('/assets/images/jazjo-store-hero.jpg')",
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        >
          <div>
            <Chip color="success" variant="flat">
              <Sparkles size={14} />
              <span>{badge}</span>
            </Chip>
            <h1 className="mt-5 text-3xl font-black leading-tight text-white">
              {title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">{subtitle}</p>
          </div>
          <div className="grid gap-3">
            {AUTH_BENEFITS.map((item) => (
              <Card
                key={item.title}
                className="border border-white/10 bg-black/35 backdrop-blur-md"
              >
                <CardBody className="flex-row items-center gap-3 py-3">
                  <span className="text-emerald-300">{item.icon}</span>
                  <span className="text-sm font-semibold text-slate-100">
                    {item.title}
                  </span>
                </CardBody>
              </Card>
            ))}
          </div>
        </CardBody>
      </Card>
      <Card className="border border-white/10 bg-slate-900/85 shadow-xl shadow-black/20">
        <CardHeader className="items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-white">{title}</h2>
            <p className="text-sm text-slate-400">{subtitle}</p>
          </div>
          <Button size="sm" variant="flat" onPress={onAction}>
            {actionLabel}
          </Button>
        </CardHeader>
        <CardBody className="gap-4 p-6 pt-2">
          {message ? (
            <Alert status="danger">
              <Alert.Content>
                <Alert.Title>Unable to continue</Alert.Title>
                <Alert.Description>{message}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
          {children}
        </CardBody>
      </Card>
    </motion.section>
  );
}

function PageHeader({ title, subtitle, icon }) {
  return (
    <Card className="border border-white/10 bg-slate-900/80 shadow-xl shadow-black/20">
      <CardBody className="flex-row items-center gap-4">
        <motion.span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
        >
          {icon}
        </motion.span>
        <div>
          <h1 className="text-2xl font-black text-white">{title}</h1>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function statusColor(status) {
  const label = statusLabel(status);
  if (label === "Delivered") return "success";
  if (label === "Cancelled") return "danger";
  if (label === "In Transit" || label === "Out for Delivery") return "primary";
  return "warning";
}

function paymentStatusColor(label) {
  if (label === "Paid") return "success";
  if (label === "Failed" || label === "Cancelled") return "danger";
  if (label === "Processing" || label === "Awaiting QRPH") return "warning";
  return "default";
}

function isPendingPaymentOrder(order) {
  return (
    statusLabel(order?.status) === "Pending Payment" &&
    paymentStatusLabel(order?.paymentStatus, order?.status) !== "Paid"
  );
}

function statusProgress(status) {
  const label = statusLabel(status);
  const map = {
    "Pending Payment": 12,
    "Order Placed": 28,
    Preparing: 48,
    "In Transit": 70,
    "Out for Delivery": 86,
    Delivered: 100,
    Cancelled: 100,
  };
  return map[label] || 28;
}

function OrderStatusChip({ status }) {
  const label = statusLabel(status);
  return (
    <Chip color={statusColor(label)} variant="flat" size="sm">
      {label}
    </Chip>
  );
}

function PaymentStatusChip({ order }) {
  const label = paymentStatusLabel(order?.paymentStatus, order?.status);
  return (
    <Chip color={paymentStatusColor(label)} variant="flat" size="sm">
      {label}
    </Chip>
  );
}

function OrderListCard({
  order,
  index,
  onNavigate,
  onCheckPayment,
  isCheckingPayment,
}) {
  const label = statusLabel(order.status);
  const itemSummary =
    (order.items || [])
      .slice(0, 3)
      .map((item) => `${item.name} x${formatQty(item.qty)}`)
      .join(", ") || "Order items";
  return (
    <motion.div variants={cardVariants} transition={{ delay: index * 0.035 }}>
      <Card className="border border-white/10 bg-slate-900/85 shadow-xl shadow-black/20 transition-shadow hover:shadow-emerald-500/10">
        <CardBody className="gap-4 p-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar color={statusColor(label)} variant="flat">
                <Avatar.Fallback>
                  <Package size={18} />
                </Avatar.Fallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="truncate text-white">{order.id}</strong>
                  <OrderStatusChip status={label} />
                  <PaymentStatusChip order={order} />
                </div>
                <p className="text-xs text-slate-400">
                  {order.createdAt || "Recently placed"}
                </p>
                <p className="mt-1 line-clamp-1 text-sm text-slate-300">
                  {itemSummary}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <strong className="min-w-24 text-white">
                {money(order.total)}
              </strong>
              {isPendingPaymentOrder(order) ? (
                <Tooltip content="Ask PayMongo for the latest payment state" placement="top" showArrow>
                  <Button
                    color="warning"
                    variant="flat"
                    size="sm"
                    isDisabled={isCheckingPayment}
                    onPress={() => onCheckPayment?.(order)}
                  >
                    <CreditCard size={14} />
                    {isCheckingPayment ? "Checking..." : "Check Payment"}
                  </Button>
                </Tooltip>
              ) : null}
              <Tooltip content="View order details" placement="top" showArrow>
                <Button
                  color="success"
                  variant="flat"
                  size="sm"
                  onPress={() => onNavigate(`order/${order.id}`)}
                >
                  View
                </Button>
              </Tooltip>
            </div>
          </div>
          <Progress value={statusProgress(label)} />
        </CardBody>
      </Card>
    </motion.div>
  );
}

function DetailTile({ label, value, icon }) {
  return (
    <Card className="border border-white/10 bg-white/[.04]">
      <CardBody className="flex-row items-start gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-100">
            {value}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

function Metric({ label, value }) {
  return (
    <motion.div whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <Card>
        <CardBody>
          <p className="text-sm text-slate-400">{label}</p>
          <strong className="mt-2 block truncate text-2xl text-white">
            {value}
          </strong>
        </CardBody>
      </Card>
    </motion.div>
  );
}

function Summary({ subtotal, deliveryFee, total }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span>Subtotal</span>
        <strong>{money(subtotal)}</strong>
      </div>
      <div className="flex justify-between">
        <span>Delivery</span>
        <strong>{money(deliveryFee)}</strong>
      </div>
      <div className="flex justify-between text-lg text-white">
        <span>Total</span>
        <strong>{money(total)}</strong>
      </div>
    </div>
  );
}

function RewardCard({ reward, points, onRedeem }) {
  const canRedeem = points >= reward.points;
  return (
    <Card className="border border-white/10 bg-slate-900/80">
      <CardBody className="gap-3">
        <div className="flex items-center gap-3">
          <Avatar
            color={canRedeem ? "success" : "default"}
            variant="flat"
            size="lg"
          >
            <Avatar.Fallback>
              <Gift size={18} />
            </Avatar.Fallback>
          </Avatar>
          <div>
            <h3 className="text-lg font-black">{reward.name}</h3>
            <p className="text-sm text-slate-400">{reward.description}</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Chip color={canRedeem ? "success" : "default"} variant="flat">
            {reward.points} points
          </Chip>
        </div>
        <Tooltip
          content={
            canRedeem
              ? "Redeem this reward"
              : `Need ${reward.points - points} more points`
          }
          placement="top"
          showArrow
        >
          <Button
            color="success"
            isDisabled={!canRedeem}
            onPress={() => onRedeem(reward.id)}
          >
            <Gift size={16} />
            Redeem
          </Button>
        </Tooltip>
      </CardBody>
    </Card>
  );
}

function CustomerFooter({ isDark }) {
  return (
    <footer
      id="contact"
      className={`border-t px-4 py-14 transition-colors ${isDark ? "border-white/10 bg-[#060a10]" : "border-slate-200 bg-white"}`}
    >
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <img
              alt="Jazjo Beverages"
              className="h-14 w-auto rounded-xl bg-white p-1 object-contain"
              src={BRAND_LOGO}
            />
            <strong
              className={`text-lg font-black ${isDark ? "text-white" : "text-slate-950"}`}
            >
              Jazjo Beverages
            </strong>
          </div>
          <p
            className={
              isDark
                ? "mt-5 max-w-sm leading-7 text-slate-400"
                : "mt-5 max-w-sm leading-7 text-slate-600"
            }
          >
            Your trusted partner in beverage distribution. Fast, reliable, and
            smart.
          </p>
        </div>
        <div>
          <h3
            className={`font-black ${isDark ? "text-white" : "text-slate-950"}`}
          >
            Contact Us
          </h3>
          <div
            className={`mt-5 grid gap-3 text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}
          >
            <span className="flex items-start gap-3">
              <MapPin size={18} className="mt-0.5 text-emerald-300" />
              12 U, Road 11, West Crame, San Juan City
            </span>
            <span className="flex items-center gap-3">
              <Phone size={18} className="text-emerald-300" />
              09090922809{" "}
            </span>
            <span className="flex items-center gap-3">
              <Mail size={18} className="text-emerald-300" />
              jazjobeverage@gmail.com
            </span>
          </div>
        </div>
        <div>
          <h3
            className={`font-black ${isDark ? "text-white" : "text-slate-950"}`}
          >
            Follow Us
          </h3>
          <div className="mt-5 flex gap-3">
            <Tooltip content="Facebook" placement="top" showArrow>
              <Button aria-label="Facebook" variant="flat" isIconOnly>
                f
              </Button>
            </Tooltip>
            <Tooltip content="Instagram" placement="top" showArrow>
              <Button aria-label="Instagram" variant="flat" isIconOnly>
                ig
              </Button>
            </Tooltip>
            <Tooltip content="TikTok" placement="top" showArrow>
              <Button aria-label="TikTok" variant="flat" isIconOnly>
                <MessageCircle size={18} />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
      <div
        className={`mx-auto mt-10 max-w-6xl border-t pt-6 text-sm ${isDark ? "border-white/10 text-slate-500" : "border-slate-200 text-slate-500"}`}
      >
        © 2026 Jazjo Beverages. All rights reserved.
      </div>
    </footer>
  );
}
