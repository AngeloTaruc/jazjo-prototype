(() => {
  const path = location.pathname;
  const isAdmin = path.includes("/admin/");
  const isStaff = path.includes("/staff/");
  if (!isAdmin && !isStaff) return;

  const money = (n) => `PHP ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 0 })}`;
  const fmtDate = (v) => {
    if (!v) return "-";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };
  const fmtDateTime = (v) => {
    if (!v) return "-";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
  const toNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  async function apiRequest(pathname, options = {}) {
    const token = localStorage.getItem("jazjo_access_token") || sessionStorage.getItem("jazjo_access_token") || "";
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const res = await fetch(pathname, {
      method: options.method || "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text || "Invalid server response" }; }
    if (!res.ok) throw new Error(data?.error || "Request failed");
    return data;
  }
  const api = (pathname) => apiRequest(pathname);
  const apiPatch = (pathname, body) => apiRequest(pathname, { method: "PATCH", body });
  const apiPost = (pathname, body) => apiRequest(pathname, { method: "POST", body });
  let deliveryRefreshTimer = null;

  function statusText(status) {
    const map = {
      pending_payment: "Order Placed",
      order_placed: "Order Placed",
      preparing: "Preparing",
      in_transit: "In Transit",
      out_for_delivery: "Out for Delivery",
      delivered: "Delivered",
      cancelled: "Cancelled"
    };
    return map[String(status || "").trim()] || String(status || "Order Placed");
  }
  function paymentBadgeClass(paymentStatus) {
    const s = String(paymentStatus || "").toLowerCase();
    if (s === "paid") return "green";
    if (s === "failed" || s === "cancelled") return "red";
    return "yellow";
  }
  function paymentBadgeLabel(paymentStatus) {
    const s = String(paymentStatus || "").toLowerCase();
    if (!s) return "Unknown";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function panelTagClass(status) {
    const s = statusText(status);
    if (s === "Order Placed") return "p";
    if (s === "Preparing") return "prep";
    return "transit";
  }

  function setButtonGroupActive(buttons, activeBtn) {
    buttons.forEach((btn) => {
      const isActive = btn === activeBtn;
      btn.style.background = isActive ? "rgba(22,163,74,.12)" : "#fff";
      btn.style.borderColor = isActive ? "rgba(22,163,74,.35)" : "rgba(229,231,235,.9)";
      btn.style.color = isActive ? "#0b7a33" : "#0f172a";
    });
  }

  function getNextOrderStatus(status) {
    const s = String(status || "");
    if (s === "Pending Payment") return "Order Placed";
    if (s === "Order Placed") return "Preparing";
    if (s === "Preparing") return "In Transit";
    if (s === "In Transit") return "Out for Delivery";
    if (s === "Out for Delivery") return "Delivered";
    return "";
  }

  function getOrderActionText(status) {
    const s = String(status || "");
    if (s === "Delivered" || s === "Cancelled") return "View Details";
    if (s === "Pending Payment") return "Mark Order Placed";
    if (s === "Order Placed") return "Mark Preparing";
    if (s === "Preparing") return "Mark In Transit";
    if (s === "In Transit") return "Mark Out for Delivery";
    return "Mark Delivered";
  }

  function csvEscape(value) {
    const raw = String(value ?? "");
    if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, "\"\"")}"`;
    return raw;
  }
  function downloadCsv(filename, rows) {
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  const tablePageState = new Map();
  function renderPaginatedTable({ tbody, rows, renderRow, emptyRow, pageKey, pageSize = 10, onRendered }) {
    if (!tbody) return;
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    let page = Number(tablePageState.get(pageKey) || 1);
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    tablePageState.set(pageKey, page);

    const start = (page - 1) * pageSize;
    const visible = rows.slice(start, start + pageSize);
    tbody.innerHTML = visible.length ? visible.map(renderRow).join("") : emptyRow;
    if (typeof onRendered === "function") onRendered(visible);

    const table = tbody.closest("table");
    if (!table) return;
    const host = table.parentElement || table;
    let pager = host.querySelector(`.tablePager[data-page-key="${pageKey}"]`);
    if (!pager) {
      pager = document.createElement("div");
      pager.className = "tablePager";
      pager.dataset.pageKey = pageKey;
      pager.style.cssText = "margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;";
      table.insertAdjacentElement("afterend", pager);
    }
    if (total <= pageSize) {
      pager.style.display = "none";
      return;
    }
    pager.style.display = "flex";
    pager.innerHTML = `
      <div style="font-size:12px;font-weight:800;color:#64748b;">Page ${page} of ${totalPages} • ${total} row(s)</div>
      <div style="display:flex;gap:8px;">
        <button class="btn2" type="button" data-prev ${page <= 1 ? "disabled" : ""}>Prev</button>
        <button class="btn2" type="button" data-next ${page >= totalPages ? "disabled" : ""}>Next</button>
      </div>
    `;
    const rerender = () => renderPaginatedTable({ tbody, rows, renderRow, emptyRow, pageKey, pageSize, onRendered });
    const prevBtn = pager.querySelector("[data-prev]");
    const nextBtn = pager.querySelector("[data-next]");
    if (prevBtn) {
      prevBtn.onclick = () => {
        tablePageState.set(pageKey, Math.max(1, page - 1));
        rerender();
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        tablePageState.set(pageKey, Math.min(totalPages, page + 1));
        rerender();
      };
    }
  }

  async function renderAdminDashboard() {
    const data = await api("/api/panel/admin/dashboard");
    const tbody = document.querySelector("tbody");
    if (!tbody) return;
    const rows = (data.recentOrders || []);
    renderPaginatedTable({
      tbody,
      rows,
      pageKey: "admin-dashboard-recent-orders",
      pageSize: 8,
      renderRow: (o) => `
      <tr>
        <td>${esc(o.id)}</td>
        <td>${esc(o.customerName)}</td>
        <td>${money(o.total)}</td>
        <td>${esc(o.status)}</td>
      </tr>
    `,
      emptyRow: `<tr><td colspan="4">No orders yet</td></tr>`
    });
  }

  async function renderAdminOrders() {
    const data = await api("/api/panel/admin/orders");
    const orders = data.orders || [];
    const tbody = document.querySelector("tbody");
    if (!tbody) return;

    let activeFilter = "all";
    const filterButtons = [...document.querySelectorAll(".actions .btn2")];
    const filterMap = {
      pending: ["Pending Payment", "Order Placed"],
      preparing: ["Preparing"],
      in_transit: ["In Transit", "Out for Delivery"],
      delivered: ["Delivered"]
    };

    const draw = () => {
      const filtered = activeFilter === "all"
        ? orders
        : orders.filter((o) => (filterMap[activeFilter] || []).includes(String(o.status || "")));

      renderPaginatedTable({
        tbody,
        rows: filtered,
        pageKey: `admin-orders-${activeFilter}`,
        pageSize: 10,
        renderRow: (o) => {
        const nextStatus = getNextOrderStatus(o.status);
        const actionText = getOrderActionText(o.status);
        return `
          <tr>
            <td>${esc(o.id)}</td>
            <td>${fmtDate(o.createdAt)}</td>
            <td>${esc(o.customerName)}</td>
            <td>${money(o.total)}</td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                <span>${esc(o.status)}</span>
                <span class="badge ${paymentBadgeClass(o.paymentStatus)}">${paymentBadgeLabel(o.paymentStatus)}</span>
              </div>
            </td>
            <td>
              <button
                class="btn2"
                type="button"
                data-order-action="${esc(o.id)}"
                data-next-status="${esc(nextStatus)}"
                data-order-view="${esc(o.id)}"
              >${actionText}</button>
            </td>
          </tr>
        `;
        },
        emptyRow: `<tr><td colspan="6">No orders found</td></tr>`,
        onRendered: () => bindOrderActionButtons(draw, orders)
      });
    };

    if (filterButtons.length) {
      filterButtons.forEach((btn) => {
        const label = btn.textContent.trim().toLowerCase();
        const key = label === "pending"
          ? "pending"
          : label === "preparing"
          ? "preparing"
          : label.includes("transit")
          ? "in_transit"
          : "delivered";
        btn.addEventListener("click", () => {
          activeFilter = key;
          setButtonGroupActive(filterButtons, btn);
          draw();
        });
      });
      setButtonGroupActive(filterButtons, filterButtons[0]);
    }

    draw();
  }

  async function renderAdminInventory() {
    const data = await api("/api/panel/admin/inventory");
    const allInventory = data.inventory || [];
    const categories = Array.isArray(data.categories) ? data.categories : [];
    const searchInput = document.querySelector(".toprow .search");
    const categoryNameInput = document.querySelector("#categoryNameInput");
    const addCategoryBtn = document.querySelector("#addCategoryBtn");
    const categoryChips = document.querySelector("#categoryChips");
    const categoryMessage = document.querySelector("#categoryMessage");
    const newProductName = document.querySelector("#newProductName");
    const newProductCategory = document.querySelector("#newProductCategory");
    const newProductUnit = document.querySelector("#newProductUnit");
    const newProductPrice = document.querySelector("#newProductPrice");
    const newProductStock = document.querySelector("#newProductStock");
    const addProductBtn = document.querySelector("#addProductBtn");
    const productMessage = document.querySelector("#productMessage");
    const restockProductName = document.querySelector("#restockProductName");
    const restockCases = document.querySelector("#restockCases");
    const restockBtn = document.querySelector("#restockBtn");
    const restockMessage = document.querySelector("#restockMessage");

    const tbodies = document.querySelectorAll("tbody");
    const inventoryBody = tbodies[0];
    const lowStockBody = tbodies[1];
    if (!inventoryBody) return;

    const showMessage = (el, text, ok = true) => {
      if (!el) return;
      el.style.display = text ? "" : "none";
      el.textContent = text || "";
      el.className = `message ${ok ? "ok" : "err"}`;
    };

    const drawCategoryFlow = () => {
      if (categoryChips) {
        categoryChips.innerHTML = categories.length
          ? categories.map((c) => `<span class="chip">${esc(c)}</span>`).join("")
          : `<span class="chip">No categories yet</span>`;
      }
      if (newProductCategory) {
        newProductCategory.innerHTML = categories.length
          ? categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")
          : `<option value="">No category</option>`;
      }
    };

    const drawRestockFlow = () => {
      if (!restockProductName) return;
      restockProductName.innerHTML = allInventory.length
        ? allInventory.map((p) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("")
        : `<option value="">No product</option>`;
    };

    const draw = () => {
      const term = (searchInput?.value || "").trim().toLowerCase();
      const inventory = allInventory.filter((p) =>
        !term || String(p.name || "").toLowerCase().includes(term)
      );
      renderPaginatedTable({
        tbody: inventoryBody,
        rows: inventory,
        pageKey: "admin-inventory-main",
        pageSize: 10,
        renderRow: (p) => `
        <tr>
          <td>${esc(p.name)}</td>
          <td>${Number(p.stockCases || 0)}</td>
          <td>${esc(p.status)}</td>
          <td><button class="btn2" type="button" data-edit-name="${esc(p.name)}">Edit</button></td>
        </tr>
      `,
        emptyRow: `<tr><td colspan="4">No products found</td></tr>`,
        onRendered: () => bindInventoryEditButtons(allInventory, renderAdminInventory)
      });
    };

    draw();
    drawCategoryFlow();
    drawRestockFlow();
    if (lowStockBody) {
      renderPaginatedTable({
        tbody: lowStockBody,
        rows: (data.lowStock || []),
        pageKey: "admin-inventory-low-stock",
        pageSize: 10,
        renderRow: (p) => `
        <tr><td>${esc(p.name)}</td><td>${Number(p.stockCases || 0)} cases</td></tr>
      `,
        emptyRow: `<tr><td colspan="2">No low stock alerts</td></tr>`
      });
    }
    if (searchInput) searchInput.oninput = draw;
    if (addCategoryBtn) addCategoryBtn.onclick = async () => {
      const name = (categoryNameInput?.value || "").trim();
      if (!name) {
        showMessage(categoryMessage, "Enter a category name.", false);
        return;
      }
      try {
        const res = await apiPost("/api/panel/admin/categories", { name });
        const next = Array.isArray(res.categories) ? res.categories : [];
        categories.splice(0, categories.length, ...next);
        drawCategoryFlow();
        if (categoryNameInput) categoryNameInput.value = "";
        showMessage(categoryMessage, "Category added.");
      } catch (err) {
        showMessage(categoryMessage, `Failed: ${err.message}`, false);
      }
    };

    if (addProductBtn) addProductBtn.onclick = async () => {
      const name = (newProductName?.value || "").trim();
      const category = (newProductCategory?.value || "").trim();
      const unit = (newProductUnit?.value || "").trim();
      const price = toNum(newProductPrice?.value, 0);
      const stockCases = toNum(newProductStock?.value, 0);
      if (!name || !category || !unit) {
        showMessage(productMessage, "Name, category, and unit are required.", false);
        return;
      }
      try {
        await apiPost("/api/panel/admin/inventory/products", {
          name,
          category,
          unit,
          price,
          stockCases
        });
        showMessage(productMessage, "Product added.");
        if (newProductName) newProductName.value = "";
        if (newProductPrice) newProductPrice.value = "1";
        if (newProductStock) newProductStock.value = "0";
        await renderAdminInventory();
      } catch (err) {
        showMessage(productMessage, `Failed: ${err.message}`, false);
      }
    };

    if (restockBtn) restockBtn.onclick = async () => {
      const productName = (restockProductName?.value || "").trim();
      const addCases = toNum(restockCases?.value, 0);
      if (!productName || addCases <= 0) {
        showMessage(restockMessage, "Select product and valid stock amount.", false);
        return;
      }
      try {
        await apiPost("/api/panel/admin/inventory/restock", {
          productName,
          addCases
        });
        showMessage(restockMessage, "Restock successful.");
        if (restockCases) restockCases.value = "1";
        await renderAdminInventory();
      } catch (err) {
        showMessage(restockMessage, `Failed: ${err.message}`, false);
      }
    };
  }

  function bindInventoryEditButtons(allInventory, refreshFn) {
    document.querySelectorAll("[data-edit-name]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const productName = btn.getAttribute("data-edit-name");
        const item = allInventory.find((p) => String(p.name) === String(productName));
        if (!item) return;
        const name = prompt("Edit name:", item.name);
        if (name === null) return;
        const category = prompt("Edit category:", item.category);
        if (category === null) return;
        const unit = prompt("Edit unit:", item.unit);
        if (unit === null) return;
        const priceRaw = prompt("Edit price:", String(item.price ?? 0));
        if (priceRaw === null) return;
        const stockRaw = prompt("Edit stock cases:", String(item.stockCases ?? 0));
        if (stockRaw === null) return;

        try {
          await apiPatch(`/api/panel/admin/inventory/products/by-name/${encodeURIComponent(productName)}`, {
            name: name.trim(),
            category: category.trim(),
            unit: unit.trim(),
            price: toNum(priceRaw, 0),
            stockCases: toNum(stockRaw, 0)
          });
          alert("Product updated.");
          await refreshFn();
        } catch (err) {
          alert(`Failed to update product: ${err.message}`);
        }
      });
    });
  }

  async function renderAdminCustomers() {
    const data = await api("/api/panel/admin/customers");
    const tbody = document.querySelector("tbody");
    if (!tbody) return;
    renderPaginatedTable({
      tbody,
      rows: (data.customers || []),
      pageKey: "admin-customers",
      pageSize: 10,
      renderRow: (c) => `
      <tr>
        <td>${esc(c.name)}</td>
        <td>${esc(c.email)}</td>
        <td>${Number(c.totalOrders || 0)}</td>
        <td>${esc(c.lastOrder || "-")}</td>
      </tr>
    `,
      emptyRow: `<tr><td colspan="4">No customers found</td></tr>`
    });
  }

  async function renderAdminReports() {
    const data = await api("/api/panel/admin/reports");
    const reports = data.reports || [];
    const tbody = document.querySelector("tbody");
    if (tbody) {
      renderPaginatedTable({
        tbody,
        rows: reports,
        pageKey: "admin-reports",
        pageSize: 10,
        renderRow: (r) => `
        <tr><td>${esc(r.reportType)}</td><td>${esc(r.coverage)}</td><td>${esc(r.status)}</td></tr>
      `,
        emptyRow: `<tr><td colspan="3">No reports available</td></tr>`
      });
    }

    const buttons = [...document.querySelectorAll(".row .btn2")];
    const pdfBtn = buttons.find((b) => b.textContent.toLowerCase().includes("pdf"));
    const excelBtn = buttons.find((b) => b.textContent.toLowerCase().includes("excel"));
    const printBtn = buttons.find((b) => b.textContent.toLowerCase() === "print");

    if (excelBtn) {
      excelBtn.addEventListener("click", () => {
        const rows = [["Report Type", "Coverage", "Status"], ...reports.map((r) => [r.reportType, r.coverage, r.status])];
        downloadCsv(`jazjo-reports-${new Date().toISOString().slice(0, 10)}.csv`, rows);
      });
    }
    if (printBtn) {
      printBtn.addEventListener("click", () => window.print());
    }
    if (pdfBtn) {
      pdfBtn.addEventListener("click", () => {
        const popup = window.open("", "_blank", "width=900,height=700");
        if (!popup) return;
        popup.document.write(`
          <html><head><title>Jazjo Reports</title>
          <style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style>
          </head><body>
          <h2>Jazjo Reports</h2>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <table><thead><tr><th>Report Type</th><th>Coverage</th><th>Status</th></tr></thead><tbody>
          ${reports.map((r) => `<tr><td>${esc(r.reportType)}</td><td>${esc(r.coverage)}</td><td>${esc(r.status)}</td></tr>`).join("")}
          </tbody></table>
          </body></html>
        `);
        popup.document.close();
        popup.focus();
        popup.print();
      });
    }
  }

  async function renderAdminRewards() {
    const data = await api("/api/panel/admin/rewards");
    const rewards = data.rewards || [];
    const top = rewards[0];
    const greenCard = document.querySelector(".greenCard");
    if (greenCard && top) {
      const balance = greenCard.querySelector("div[style*='font-size:54px']");
      const sub = greenCard.querySelector("div[style*='Current balance']");
      if (balance) balance.textContent = Number(top.points || 0).toLocaleString();
      if (sub) sub.textContent = `${top.customer || top.email} current points`;
    }

    const redeemButtons = [...document.querySelectorAll(".redeem")];
    const rewardTypes = ["free_delivery", "discount_10"];
    redeemButtons.forEach((btn, idx) => {
      btn.addEventListener("click", async () => {
        const email = prompt("Customer email to redeem for (leave blank = top customer):", "") || "";
        try {
          const result = await apiPost("/api/panel/admin/rewards/redeem", {
            rewardType: rewardTypes[idx] || "free_delivery",
            customerEmail: email.trim()
          });
          alert(`Redeemed successfully for ${result.customer}. Remaining points: ${result.remainingPoints}`);
          await renderAdminRewards();
        } catch (err) {
          alert(`Redeem failed: ${err.message}`);
        }
      });
    });
  }

  function aggregateSalesPoints(points, mode) {
    if (mode === "daily") return points;
    const grouped = new Map();
    points.forEach((p) => {
      const d = new Date(p.key);
      if (Number.isNaN(d.getTime())) return;
      const key = mode === "weekly"
        ? `${d.getFullYear()}-W${Math.ceil((d.getDate() + (new Date(d.getFullYear(), d.getMonth(), 1).getDay() || 7) - 1) / 7)}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = mode === "weekly"
        ? `W${String(key.split("W")[1])}`
        : d.toLocaleDateString("en-US", { month: "short" });
      const rec = grouped.get(key) || { key, label, sales: 0, transactions: 0 };
      rec.sales += Number(p.sales || 0);
      rec.transactions += Number(p.transactions || 0);
      grouped.set(key, rec);
    });
    return [...grouped.values()].slice(-7);
  }

  function renderBars(container, points, valueKey, formatter) {
    const peak = Math.max(...points.map((p) => Number(p[valueKey] || 0)), 0);
    container.innerHTML = points.length ? points.map((point) => {
      const value = Number(point[valueKey] || 0);
      const height = peak > 0 ? Math.max(12, Math.round((value / peak) * 100)) : 12;
      return `
        <div class="bar" style="height:${height}%">
          <span>${formatter(value)}</span>
          <small>${esc(point.label || "-")}</small>
        </div>
      `;
    }).join("") : `<div class="small">No chart data yet.</div>`;
  }

  async function renderAdminSales() {
    const data = await api("/api/panel/admin/sales");
    const points = data.chart?.points || [];
    const tabs = [...document.querySelectorAll(".pilltabs .tab")];
    const salesBars = document.querySelector("#salesBars");
    const chartTitle = document.querySelector("#salesChartTitle");
    const chartSub = document.querySelector("#salesChartSub");
    const tbody = document.querySelector("tbody");
    const kpis = document.querySelectorAll(".kpi2 .value");
    const todaySalesNote = document.querySelector("#todaySalesNote");
    const transactionsNote = document.querySelector("#transactionsNote");
    const bestSellerNote = document.querySelector("#bestSellerNote");

    if (kpis[0]) kpis[0].textContent = money(data.kpis?.todaySales || 0);
    if (kpis[1]) kpis[1].textContent = String(data.kpis?.transactions || 0);
    if (kpis[2]) kpis[2].textContent = data.kpis?.bestSeller || "-";
    if (kpis[3]) kpis[3].textContent = money(data.kpis?.refunds || 0);
    if (todaySalesNote) todaySalesNote.textContent = "Live from active and completed orders";
    if (transactionsNote) transactionsNote.textContent = `Avg. ${money(data.kpis?.avgOrderValue || 0)}/order`;
    if (bestSellerNote) bestSellerNote.textContent = (data.kpis?.bestSeller && data.kpis.bestSeller !== "-")
      ? `${esc(data.kpis.bestSeller)} is leading current sales`
      : "Waiting for sales data";

    const ordersData = await api("/api/panel/admin/orders");
    const allOrders = ordersData.orders || [];
    const productTotals = new Map();
    allOrders.forEach((o) => (o.items || []).forEach((it) => {
      productTotals.set(it.name, (productTotals.get(it.name) || 0) + Number(it.qty || 0));
    }));
    const bestSellerRows = [...productTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([name, qty], idx) => ({ label: `${idx + 1}`, sales: qty, transactions: qty, period: name }));

    const modes = {
      daily: { title: "Daily Sales Trend", sub: "Last 7 calendar days", points: aggregateSalesPoints(points, "daily"), valueKey: "sales" },
      weekly: { title: "Weekly Sales Trend", sub: "Grouped weekly", points: aggregateSalesPoints(points, "weekly"), valueKey: "sales" },
      monthly: { title: "Monthly Sales Trend", sub: "Grouped monthly", points: aggregateSalesPoints(points, "monthly"), valueKey: "sales" },
      best_sellers: { title: "Best Sellers", sub: "Top ordered products", points: bestSellerRows, valueKey: "sales" },
      transactions: { title: "Transactions Trend", sub: "Order counts over time", points: aggregateSalesPoints(points, "daily"), valueKey: "transactions" }
    };

    const applyMode = (modeKey) => {
      const mode = modes[modeKey] || modes.daily;
      if (chartTitle) chartTitle.textContent = mode.title;
      if (chartSub) chartSub.textContent = mode.sub;
      if (salesBars) {
        const formatter = mode.valueKey === "sales" ? money : (v) => String(v);
        renderBars(salesBars, mode.points, mode.valueKey, formatter);
      }
      if (tbody) {
        if (modeKey === "best_sellers") {
          renderPaginatedTable({
            tbody,
            rows: mode.points,
            pageKey: `admin-sales-${modeKey}`,
            pageSize: 10,
            renderRow: (r) => `
            <tr><td>${esc(r.period)}</td><td>${money(0)}</td><td>${Number(r.sales || 0)}</td><td>${esc(r.period)}</td></tr>
          `,
            emptyRow: `<tr><td colspan="4">No sales data</td></tr>`
          });
        } else {
          renderPaginatedTable({
            tbody,
            rows: (data.rows || []),
            pageKey: `admin-sales-${modeKey}`,
            pageSize: 10,
            renderRow: (r) => `
            <tr><td>${esc(r.period)}</td><td>${money(r.sales)}</td><td>${Number(r.transactions || 0)}</td><td>${esc(r.bestSeller || "-")}</td></tr>
          `,
            emptyRow: `<tr><td colspan="4">No sales data</td></tr>`
          });
        }
      }
    };

    const modeByLabel = {
      daily: "daily",
      weekly: "weekly",
      monthly: "monthly",
      "best sellers": "best_sellers",
      transactions: "transactions"
    };
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        setButtonGroupActive(tabs, tab);
        const key = modeByLabel[tab.textContent.trim().toLowerCase()] || "daily";
        applyMode(key);
      });
    });
    if (tabs.length) setButtonGroupActive(tabs, tabs[0]);
    applyMode("daily");
  }

  function renderTimeline(container, order) {
    if (!container) return;
    if (!order) {
      container.innerHTML = `<div class="small">No active delivery orders found.</div>`;
      return;
    }
    const steps = ["Order Placed", "Preparing", "In Transit", "Out for Delivery", "Delivered"];
    const idx = Math.max(0, steps.indexOf(order.status));
    const events = new Map((order.status_events || []).map((e) => [statusText(e.status), e]));
    container.innerHTML = `
      <div class="trackHead">
        <div class="iconBox">D</div>
        <div>
          <div style="font-weight:1200;font-size:18px">Active Delivery</div>
          <div class="small">Order #${esc(order.id)}</div>
        </div>
      </div>
      ${steps.map((title, i) => {
        const done = i <= idx;
        const event = events.get(title);
        const time = event?.created_at ? fmtDate(event.created_at) : (done ? fmtDate(order.createdAt) : "Pending");
        const note = event?.note || "";
        return `
          <div class="step">
            <div>
              <div class="dot ${done ? "done" : ""}">${done ? "OK" : "."}</div>
              ${i < steps.length - 1 ? `<div class="line" style="height:70px"></div>` : ""}
            </div>
            <div class="info" style="${done ? "" : "opacity:.6"}">
              <h4>${title}</h4>
              <div class="meta">${esc(time)}</div>
              <p>${esc(note || (title === "Delivered" ? "Final status once customer receives the order." : "Status update from operations."))}</p>
            </div>
          </div>
        `;
      }).join("")}
    `;
  }

  function deliveryStatusBadgeClass(status) {
    const s = String(status || "");
    if (s === "Delivered") return "green";
    if (s === "In Transit" || s === "Out for Delivery") return "blue";
    if (s === "Cancelled") return "red";
    return "yellow";
  }

  function renderProductDelivery(container, tracks, pageKey) {
    if (!container) return;
    if (!tracks?.length) {
      container.innerHTML = `<div class="small">No product delivery records found.</div>`;
      return;
    }
    container.innerHTML = `
      <div class="card" style="box-shadow:none;border-radius:16px;padding:0;border:0;">
        <div style="font-weight:1100;font-size:16px;margin-bottom:8px;">Product Delivery Tracking</div>
        <table class="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="${pageKey}-tbody"></tbody>
        </table>
      </div>
    `;
    const tbody = container.querySelector(`#${pageKey}-tbody`);
    const draw = () => renderPaginatedTable({
      tbody,
      rows: tracks,
      pageKey,
      pageSize: 10,
      renderRow: (t) => {
        const uiStatus = statusText(t.status);
        return `
          <tr>
            <td>${esc(t.orderId)}</td>
            <td>${esc(t.productName)}</td>
            <td>${Number(t.qty || 0)}</td>
            <td>${esc(t.customerName || "-")}</td>
            <td><span class="badge ${deliveryStatusBadgeClass(uiStatus)}">${esc(uiStatus || "-")}</span></td>
            <td>${esc(fmtDate(t.updatedAt))}</td>
            <td><button class="btn2" type="button" data-delivery-details="${esc(t.orderId)}|${esc(t.productName)}">Details</button></td>
          </tr>
        `;
      },
      emptyRow: `<tr><td colspan="7">No product delivery records found.</td></tr>`,
      onRendered: (visible) => bindDeliveryDetailsButtons(container, visible)
    });
    draw();
  }

  function bindDeliveryDetailsButtons(container, tracks) {
    const steps = ["Order Placed", "Preparing", "In Transit", "Out for Delivery", "Delivered"];
    const statusIndex = (status) => {
      const s = statusText(status);
      const idx = steps.indexOf(s);
      if (idx >= 0) return idx;
      if (s === "Cancelled") return 0;
      return 0;
    };
    container.querySelectorAll("[data-delivery-details]").forEach((btn) => {
      btn.onclick = () => {
        const token = btn.getAttribute("data-delivery-details") || "";
        const [orderId, productName] = token.split("|");
        const track = tracks.find((t) => String(t.orderId) === String(orderId) && String(t.productName) === String(productName));
        if (!track) return;
        const byStatus = new Map((track.statusEvents || []).map((e) => [statusText(e.status), e]));
        const currentIdx = statusIndex(track.status);
        const timeline = steps.map((step) => {
          const ev = byStatus.get(step);
          const isDone = steps.indexOf(step) <= currentIdx;
          const fallbackDate = step === "Order Placed"
            ? (track.orderCreatedAt || track.updatedAt)
            : track.updatedAt;
          const when = ev?.created_at
            ? fmtDateTime(ev.created_at)
            : (isDone
                ? (fallbackDate ? fmtDateTime(fallbackDate) : "Done (time unavailable)")
                : "Not yet");
          const note = ev?.note ? ` - ${ev.note}` : "";
          return { step, when, note: ev?.note || "", done: isDone };
        });
        showDeliveryDetailsModal({
          orderId: track.orderId,
          productName: track.productName,
          qty: track.qty,
          customerName: track.customerName || "-",
          currentStatus: statusText(track.status),
          timeline
        });
      };
    });
  }

  function showDeliveryDetailsModal(details) {
    let modal = document.getElementById("deliveryDetailsModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "deliveryDetailsModal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.45);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px;";
      modal.innerHTML = `
        <div style="width:min(760px,96vw);max-height:88vh;overflow:auto;background:#fff;border-radius:18px;border:1px solid rgba(229,231,235,.9);box-shadow:0 20px 40px rgba(15,23,42,.25);">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(229,231,235,.9);">
            <div style="font-weight:1100;font-size:18px;">Delivery Details</div>
            <button type="button" data-close-modal class="btn2">Close</button>
          </div>
          <div id="deliveryDetailsBody" style="padding:16px;"></div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.style.display = "none";
      });
      const closeBtn = modal.querySelector("[data-close-modal]");
      if (closeBtn) closeBtn.onclick = () => { modal.style.display = "none"; };
    }

    const body = modal.querySelector("#deliveryDetailsBody");
    if (body) {
      body.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
          <div><div class="small"><b>Order</b></div><div>${esc(details.orderId)}</div></div>
          <div><div class="small"><b>Product</b></div><div>${esc(details.productName)}</div></div>
          <div><div class="small"><b>Quantity</b></div><div>${Number(details.qty || 0)}</div></div>
          <div><div class="small"><b>Customer</b></div><div>${esc(details.customerName)}</div></div>
          <div><div class="small"><b>Current Status</b></div><div>${esc(details.currentStatus || "-")}</div></div>
        </div>
        <div style="font-weight:1000;font-size:15px;margin:6px 0 10px;">Status Timeline</div>
        <div style="display:grid;gap:8px;">
          ${(details.timeline || []).map((t) => `
            <div style="display:flex;justify-content:space-between;gap:12px;border:1px solid rgba(229,231,235,.9);border-radius:12px;padding:10px 12px;background:${t.done ? "rgba(22,163,74,.06)" : "#fff"};">
              <div style="font-weight:900;">${esc(t.step)}</div>
              <div style="text-align:right;">
                <div style="font-weight:800;color:${t.done ? "#0b7a33" : "#64748b"};">${esc(t.when)}</div>
                ${t.note ? `<div class="small" style="max-width:360px;">${esc(t.note)}</div>` : ""}
              </div>
            </div>
          `).join("")}
        </div>
      `;
    }
    modal.style.display = "flex";
  }

  async function renderAdminDelivery() {
    const container = document.querySelector(".timeline");
    const load = async () => {
      const data = await api("/api/panel/admin/delivery");
      renderProductDelivery(container, data.productTracks || [], "admin-delivery-products");
    };
    await load();
    if (deliveryRefreshTimer) clearInterval(deliveryRefreshTimer);
    deliveryRefreshTimer = setInterval(() => { load().catch(() => {}); }, 8000);
  }

  async function renderStaffOrders() {
    const data = await api("/api/panel/staff/orders");
    const orders = data.orders || [];
    const tbody = document.querySelector("tbody");
    if (!tbody) return;
    const draw = () => {
      renderPaginatedTable({
        tbody,
        rows: orders,
        pageKey: "staff-orders",
        pageSize: 10,
        renderRow: (o) => `
        <tr>
          <td>${esc(o.id)}</td><td>${esc(o.customerName)}</td><td>${money(o.total)}</td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <span class="tag ${panelTagClass(o.status)}">${esc(o.status)}</span>
              <span class="badge ${paymentBadgeClass(o.paymentStatus)}">${paymentBadgeLabel(o.paymentStatus)}</span>
            </div>
          </td>
          <td><button class="btn2" type="button" data-order-action="${esc(o.id)}" data-next-status="${esc(getNextOrderStatus(o.status))}">${getOrderActionText(o.status)}</button></td>
        </tr>
      `,
        emptyRow: `<tr><td colspan="5">No orders found</td></tr>`,
        onRendered: () => bindOrderActionButtons(draw, orders)
      });
    };
    draw();
  }

  function bindOrderActionButtons(refreshFn, orders = []) {
    document.querySelectorAll("[data-order-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const orderCode = btn.getAttribute("data-order-action");
        const nextStatus = btn.getAttribute("data-next-status");
        if (!nextStatus) {
          const details = orders.find((o) => String(o.id) === String(orderCode));
          if (details) {
            alert(`Order ${details.id}\nCustomer: ${details.customerName}\nTotal: ${money(details.total)}\nStatus: ${details.status}\nPayment: ${paymentBadgeLabel(details.paymentStatus)}`);
          }
          return;
        }
        const oldText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Updating...";
        try {
          await apiPatch(`/api/orders/${encodeURIComponent(orderCode)}/status`, { status: nextStatus });
          const target = orders.find((o) => String(o.id) === String(orderCode));
          if (target) target.status = nextStatus;
          await refreshFn();
        } catch (err) {
          alert(`Failed to update order status: ${err.message}`);
          btn.disabled = false;
          btn.textContent = oldText;
        }
      });
    });
  }

  async function renderStaffInventory() {
    const data = await api("/api/panel/staff/inventory");
    const tbody = document.querySelector("tbody");
    if (!tbody) return;
    renderPaginatedTable({
      tbody,
      rows: (data.inventory || []),
      pageKey: "staff-inventory",
      pageSize: 10,
      renderRow: (p) => {
      const cls = p.status === "In Stock" ? "ok" : p.status === "Low Stock" ? "low" : "out";
      return `<tr><td>${esc(p.name)}</td><td>${Number(p.stockCases || 0)}</td><td><span class="status ${cls}">${esc(p.status)}</span></td></tr>`;
      },
      emptyRow: `<tr><td colspan="3">No products found</td></tr>`
    });
  }

  async function renderStaffDelivery() {
    const container = document.querySelector(".timeline");
    const load = async () => {
      const data = await api("/api/panel/staff/delivery");
      renderProductDelivery(container, data.productTracks || [], "staff-delivery-products");
    };
    await load();
    if (deliveryRefreshTimer) clearInterval(deliveryRefreshTimer);
    deliveryRefreshTimer = setInterval(() => { load().catch(() => {}); }, 8000);
  }

  async function boot() {
    try {
      if (path.endsWith("/admin-dashboard.html")) return renderAdminDashboard();
      if (path.endsWith("/admin-orders.html")) return renderAdminOrders();
      if (path.endsWith("/admin-inventory.html")) return renderAdminInventory();
      if (path.endsWith("/admin-customers.html")) return renderAdminCustomers();
      if (path.endsWith("/admin-reports.html")) return renderAdminReports();
      if (path.endsWith("/admin-rewards.html")) return renderAdminRewards();
      if (path.endsWith("/admin-sales.html")) return renderAdminSales();
      if (path.endsWith("/admin-delivery.html")) return renderAdminDelivery();
      if (path.endsWith("/staff-orders.html")) return renderStaffOrders();
      if (path.endsWith("/staff-inventory.html")) return renderStaffInventory();
      if (path.endsWith("/staff-delivery.html")) return renderStaffDelivery();
    } catch (err) {
      console.error(err);
      if (String(err.message).toLowerCase().includes("missing bearer token") || String(err.message).toLowerCase().includes("forbidden")) {
        alert("You need to log in with the correct role to access this page.");
      } else {
        alert(`Panel failed to load: ${err.message}`);
      }
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
