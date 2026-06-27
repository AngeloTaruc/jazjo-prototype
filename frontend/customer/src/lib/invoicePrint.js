import { paymentStatusLabel } from "./customerLogic.js";

function formatPrintableDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

export function openPrintableHtml(html, { onError } = {}) {
  const iframe = document.createElement("iframe");
  iframe.title = "Printable document";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.srcdoc = html;
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      onError?.();
      return;
    }
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 1000);
  };
  document.body.appendChild(iframe);
}

export function buildInvoiceHtml(invoice) {
  const rows = (invoice?.items || []).map((item) => `
    <tr>
      <td>${String(item.product || "")}</td>
      <td>${Number(item.quantity || 0)}</td>
      <td>PHP ${Number(item.unitPrice || 0).toLocaleString("en-PH")}</td>
      <td>PHP ${Number(item.lineTotal || 0).toLocaleString("en-PH")}</td>
    </tr>
  `).join("");
  return `
    <html>
      <head>
        <title>${invoice?.invoiceNumber || "Sales Invoice"}</title>
        <style>
          @page { size: A4; margin: 14mm; }
          body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; }
          header { display:flex; justify-content:space-between; gap:24px; border-bottom:2px solid #0f172a; padding-bottom:12px; }
          h1,h2,p { margin:0; }
          .muted { color:#475569; font-size:12px; }
          .grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; margin:18px 0; }
          .card { border:1px solid #cbd5e1; border-radius:12px; padding:12px; }
          table { width:100%; border-collapse:collapse; margin-top:16px; font-size:12px; }
          th,td { border:1px solid #cbd5e1; padding:8px; text-align:left; }
          th { background:#e2e8f0; }
          .totals { margin-top:18px; width:320px; margin-left:auto; }
          .totals div { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #e2e8f0; }
          .grand { font-weight:800; font-size:14px; }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1>Jazjo Beverages</h1>
            <p class="muted">${invoice?.company?.address || ""}</p>
            <p class="muted">${invoice?.company?.contact || ""}</p>
          </div>
          <div>
            <h2>Sales Invoice</h2>
            <p class="muted">Invoice No: ${invoice?.invoiceNumber || "-"}</p>
            <p class="muted">Order No: ${invoice?.orderNumber || "-"}</p>
            <p class="muted">Date: ${formatPrintableDate(invoice?.createdAt)}</p>
          </div>
        </header>
        <div class="grid">
          <div class="card"><strong>Customer</strong><p class="muted">${invoice?.customer || "-"}</p></div>
          <div class="card"><strong>Payment Method</strong><p class="muted">${invoice?.paymentMethod || "-"}</p></div>
          <div class="card"><strong>Fulfillment</strong><p class="muted">${invoice?.fulfillmentType || "-"}</p></div>
          <div class="card"><strong>Order Status</strong><p class="muted">${invoice?.orderStatus || "-"} / ${paymentStatusLabel(invoice?.paymentStatus || "", invoice?.orderStatus || "")}</p></div>
        </div>
        <table>
          <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4">No items</td></tr>'}</tbody>
        </table>
        <div class="totals">
          <div><span>Subtotal</span><strong>PHP ${Number(invoice?.subtotal || 0).toLocaleString("en-PH")}</strong></div>
          <div><span>Delivery Fee</span><strong>PHP ${Number(invoice?.deliveryFee || 0).toLocaleString("en-PH")}</strong></div>
          <div><span>Discount</span><strong>PHP ${Number(invoice?.discount || 0).toLocaleString("en-PH")}</strong></div>
          <div class="grand"><span>Grand Total</span><strong>PHP ${Number(invoice?.grandTotal || 0).toLocaleString("en-PH")}</strong></div>
        </div>
      </body>
    </html>
  `;
}
