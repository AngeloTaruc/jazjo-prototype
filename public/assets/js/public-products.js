(() => {
  const grid = document.getElementById("grid");
  if (!grid) return;

  const search = document.getElementById("search");
  const category = document.getElementById("category");
  const categoryOptions = document.getElementById("categoryOptions");
  const cartCount = document.getElementById("cartCount");
  const cartTotal = document.getElementById("cartTotal");
  const clearCartBtn = document.getElementById("clearCart");
  const checkoutBtn = document.getElementById("checkout");

  let products = [];
  const CART_KEY = "jazjo_cart_v1";
  let cart = loadCart();

  const money = (n) => "PHP " + Number(n || 0).toFixed(2);
  const safe = (s) => String(s || "").replace(/[<&>]/g, "");
  const placeholder = (name) =>
    "data:image/svg+xml;base64," + btoa(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='340'><rect width='100%' height='100%' fill='#eaf7ee'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#0f172a' font-family='Arial' font-size='24'>${safe(name)}</text></svg>`);
  const stockLabel = (stockCases) => {
    const n = Number(stockCases || 0);
    return n <= 0 ? "Out of Stock" : n <= 10 ? "Low Stock" : "In Stock";
  };
  const packOptions = (unit) => {
    return [
      { label: "1 case", value: 1 },
      { label: "Half case", value: 0.5 }
    ];
  };
  const normalizeCategory = (value, name = "") => {
    const raw = String(value || "").trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
    const text = `${raw} ${String(name || "").toLowerCase()}`;
    if (raw === "softdrinks" || raw === "soft drinks" || raw === "soft drink") return "soft drinks";
    if (raw === "energy" || raw === "energy drink" || raw === "energy drinks") return "energy drinks";
    if (/water|wilkins|nature spring/.test(text)) return "water";
    if (/cobra|sting|gatorade|energy/.test(text)) return "energy drinks";
    if (/juice|tea|c2|magnolia|zesto/.test(text)) return "juice";
    if (/coke|cola|sprite|royal|rc|root beer|soda|mountaindew|mountain dew/.test(text)) return "soft drinks";
    return raw;
  };
  const displayCategory = (value) => normalizeCategory(value).replace(/\b\w/g, (m) => m.toUpperCase());

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function updateCartBar() {
    const count = cart.reduce((s, i) => s + i.qty, 0);
    const total = cart.reduce((s, i) => {
      const product = products.find((p) => String(p.id) === String(i.productId));
      return s + (Number(i.qty || 0) * Number(i.caseQty || 1) * Number(product?.price || 0));
    }, 0);
    cartCount.textContent = `${count} item${count !== 1 ? "s" : ""}`;
    cartTotal.textContent = money(total);
  }

  function addToCart(product, qty, pack) {
    const caseQty = Number(pack?.value || 1);
    const packLabel = String(pack?.label || "1 case");
    const existing = cart.find(i => String(i.productId) === String(product.id) && Number(i.caseQty || 1) === caseQty);
    const nextCases = (Number(existing?.qty || 0) + Number(qty || 0)) * caseQty;
    if (nextCases > Number(product.stockCases || 0)) {
      alert(`Only ${product.stockCases} case(s) available for ${product.name}.`);
      return;
    }
    if (existing) existing.qty += qty;
    else cart.push({ productId: product.id, qty, caseQty, packLabel });
    saveCart();
    updateCartBar();
  }

  function render() {
    const q = (search.value || "").toLowerCase().trim();
    const cat = normalizeCategory(category.value);
    const preferred = ["soft drinks", "water", "energy drinks", "juice"];
    if (categoryOptions) {
      categoryOptions.innerHTML = preferred.map((c) => `
        <button class="category-card ${cat === c ? "active" : ""}" type="button" data-category="${c}">
          ${displayCategory(c)}
        </button>
      `).join("");
      categoryOptions.querySelectorAll("[data-category]").forEach((btn) => {
        btn.onclick = () => {
          category.value = btn.dataset.category;
          render();
        };
      });
    }
    const filtered = products.filter((p) => {
      const matchText = p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      const matchCat = cat === "all" || p.category === cat;
      return matchText && matchCat;
    });

    grid.innerHTML = filtered.map((p) => {
      const packs = packOptions(p.unit);
      const packSelectHtml = `<select class="pack">
            ${packs.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join("")}
          </select>`;
      return `
      <article class="card" data-id="${p.id}">
        <div class="img">
          <img src="${p.img}" alt="${p.name}">
          <div class="badge">${p.stock}</div>
        </div>
        <div class="content">
          <h3 class="title">${p.name}</h3>
          <span class="price">${money(p.price)}</span>
          <div class="meta"><span>${displayCategory(p.category)}</span></div>
          <div class="row">
            ${packSelectHtml}
            <input class="qty" type="number" min="1" value="1" />
            <button class="btn btn-primary add">Add to Cart</button>
          </div>
        </div>
      </article>
    `;
    }).join("");

    grid.querySelectorAll(".card").forEach((card) => {
      const id = String(card.dataset.id);
      const product = products.find((x) => String(x.id) === id);
      const qtyInput = card.querySelector(".qty");
      const packSelect = card.querySelector(".pack");
      const priceText = card.querySelector(".price");
      const addBtn = card.querySelector(".add");

      const refreshDisplayedPrice = () => {
        const factor = Number(packSelect?.value || 1);
        priceText.textContent = money(Number(product.price || 0) * factor);
      };
      if (packSelect) {
        packSelect.addEventListener("change", refreshDisplayedPrice);
        refreshDisplayedPrice();
      }

      addBtn.addEventListener("click", () => {
        if (product.stock === "Out of Stock") return alert("Sorry, this product is out of stock.");
        const qty = Math.max(1, Number(qtyInput.value || 1));
        const chosen = packSelect?.selectedOptions?.[0];
        addToCart(product, qty, {
          value: Number(packSelect?.value || 1),
          label: chosen ? chosen.textContent : "1 case"
        });
      });
    });
    updateCartBar();
  }

  async function loadProducts() {
    grid.innerHTML = `<div class="card" style="padding:16px;">Loading products...</div>`;
    const res = await fetch("/api/products");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load products");
    products = (data.products || []).map((p, idx) => ({
      id: p.id || p.sku || String(idx + 1),
      name: p.name,
      category: normalizeCategory(p.category, p.name),
      unit: p.unit || "",
      price: Number(p.price || 0),
      stock: stockLabel(p.stockCases ?? p.stock_cases),
      stockCases: Number(p.stockCases ?? p.stock_cases ?? 0),
      img: p.image_url || placeholder(p.name)
    }));
    render();
  }

  search.addEventListener("input", render);
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      render();
    }
  });
  category.addEventListener("change", render);
  clearCartBtn.addEventListener("click", () => { cart = []; saveCart(); updateCartBar(); });
  checkoutBtn.addEventListener("click", () => {
    if (!cart.length) return alert("Your cart is empty.");
    window.location.href = "/customer-app/#/cart";
  });

  loadProducts().catch((err) => {
    grid.innerHTML = `<div class="card" style="padding:16px;">Failed to load products: ${err.message}</div>`;
  });
  updateCartBar();
})();
