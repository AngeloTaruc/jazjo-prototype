import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const staffSource = fs.readFileSync("frontend/customer/src/StaffPanel.jsx", "utf8");
const adminSource = fs.readFileSync("frontend/customer/src/AdminPanel.jsx", "utf8");
const appSource = fs.readFileSync("frontend/customer/src/App.jsx", "utf8");
const apiSource = fs.readFileSync("frontend/customer/src/lib/api.js", "utf8");
const serverSource = fs.readFileSync("server/index.mjs", "utf8");
const staffMigrationSource = fs.existsSync("sql/2026-06-26_staff_accounts.sql")
  ? fs.readFileSync("sql/2026-06-26_staff_accounts.sql", "utf8")
  : "";
const invoicePrintSource = fs.existsSync("frontend/customer/src/lib/invoicePrint.js")
  ? fs.readFileSync("frontend/customer/src/lib/invoicePrint.js", "utf8")
  : "";

test("staff orders expose full order editing", () => {
  assert.match(apiSource, /apiUpdateOrderDetails/);
  assert.match(serverSource, /\/details/);
  assert.match(staffSource, /Edit Order/);
  assert.match(staffSource, /saveOrderEdit/);
  assert.match(staffSource, /updateEditItemQty/);
});

test("inventory panels show ARIMA forecast summaries", () => {
  assert.match(adminSource, /ARIMA Forecast Summary/);
  assert.match(staffSource, /ARIMA Forecast Summary/);
  assert.match(adminSource, /createDemandForecast/);
  assert.match(staffSource, /createDemandForecast/);
});

test("admin report export buttons have PDF and Excel actions", () => {
  assert.match(adminSource, /exportExcel/);
  assert.match(adminSource, /buildCsvContent/);
  assert.match(adminSource, /buildPrintableReportHtml/);
  assert.match(adminSource, /openPrintableReport/);
  assert.match(adminSource, /document\.createElement\("iframe"\)/);
  assert.match(adminSource, /iframe\.srcdoc = buildPrintableReportHtml\(\)/);
  assert.doesNotMatch(adminSource, /window\.open\("", "_blank", "noopener,noreferrer"\)/);
  assert.match(adminSource, /download = `jazjo-reports-/);
});

test("admin report rows open sales and inventory preview modals", () => {
  assert.match(adminSource, /SalesReportPreview/);
  assert.match(adminSource, /InventoryReductionSummary/);
  assert.match(adminSource, /SALES OVERVIEW/);
  assert.match(adminSource, /SALES SUMMARY TABLE/);
  assert.match(adminSource, /INVENTORY REDUCTION SUMMARY/);
  assert.match(adminSource, /selectedReport\?\.key === "sales"/);
  assert.match(adminSource, /selectedReport\?\.key === "inventory"/);
  assert.match(serverSource, /inventorySummary/);
  assert.match(serverSource, /totalReductionValue/);
  assert.match(serverSource, /salesReductionByProduct/);
  assert.match(serverSource, /reductionSource/);
  assert.match(adminSource, /max-h-\[72vh\]/);
  assert.match(adminSource, /min-w-\[760px\]/);
});

test("admin sales chart renders visible values and bar tracks", () => {
  assert.match(adminSource, /Sales Trend/);
  assert.match(adminSource, /money\(p\.sales\)/);
  assert.match(adminSource, /p\.orders/);
  assert.match(adminSource, /chart-bar-track/);
  assert.match(adminSource, /aria-label=\{`\$\{p\.label\} sales/);
});

test("admin sales shows daily dated order totals", () => {
  assert.match(serverSource, /dailyRows/);
  assert.match(serverSource, /orders: rec\.orders/);
  assert.match(adminSource, /Daily Sales by Date/);
  assert.match(adminSource, /<Th>DATE<\/Th><Th>TOTAL ORDERS<\/Th><Th>SALES<\/Th>/);
  assert.match(adminSource, /row\.date/);
  assert.match(adminSource, /row\.orders/);
});

test("staff dashboard KPI cards open detail modals", () => {
  assert.match(staffSource, /const \[detail, setDetail\] = useState\(null\)/);
  assert.match(staffSource, /onPress=\{\(\) => setDetail\("prepare"\)\}/);
  assert.match(staffSource, /onPress=\{\(\) => setDetail\("deliver"\)\}/);
  assert.match(staffSource, /onPress=\{\(\) => setDetail\("completed"\)\}/);
  assert.match(staffSource, /onPress=\{\(\) => setDetail\("lowStock"\)\}/);
  assert.match(staffSource, /Staff Dashboard Details/);
  assert.match(staffSource, /detailItems\.map/);
  assert.match(staffSource, /function KpiCard\(\{ label, value, icon, onPress \}\)/);
});

test("staff dashboard loads data from staff-accessible endpoints", () => {
  assert.doesNotMatch(staffSource, /apiAdminDashboard/);
  assert.match(staffSource, /Promise\.all\(\[apiStaffOrders\(\), apiStaffInventory\(\)\]\)/);
  assert.match(staffSource, /setData\(\{\s*orders:/);
  assert.match(staffSource, /lowStock:/);
  assert.match(staffSource, /lowStockCount:/);
});

test("admin and staff surfaces display fulfillment type", () => {
  assert.match(apiSource, /fulfillmentType/);
  assert.match(adminSource, /Fulfillment/);
  assert.match(adminSource, /fulfillmentType/);
  assert.match(staffSource, /Fulfillment/);
  assert.match(staffSource, /fulfillmentType/);
  assert.match(serverSource, /fulfillmentType: order\.fulfillment_type/);
});

test("admin manages staff accounts from an admin-only page", () => {
  assert.match(adminSource, /Staff Accounts/);
  assert.match(adminSource, /AdminStaffAccountsPage/);
  assert.match(adminSource, /apiAdminStaffAccounts/);
  assert.match(adminSource, /apiAdminCreateStaffAccount/);
  assert.match(adminSource, /apiAdminUpdateStaffAccount/);
  assert.match(adminSource, /apiAdminDisableStaffAccount/);
  assert.match(adminSource, /apiAdminResetStaffPassword/);
  assert.match(adminSource, /Confirm Password/);
  assert.match(adminSource, /Email is already registered/);

  assert.match(apiSource, /apiAdminStaffAccounts/);
  assert.match(apiSource, /\/api\/panel\/admin\/staff/);
  assert.match(apiSource, /reset-password/);

  assert.match(serverSource, /listStaffAccounts/);
  assert.match(serverSource, /createStaffAccount/);
  assert.match(serverSource, /updateStaffAccount/);
  assert.match(serverSource, /disableStaffAccount/);
  assert.match(serverSource, /resetStaffPassword/);
  assert.match(serverSource, /\/api\/panel\/admin\/staff/);
  assert.match(serverSource, /requireAuth\(req, \["admin"\]\)/);
  assert.match(serverSource, /assertProfileIsActive/);

  assert.match(staffMigrationSource, /add column if not exists is_active/);
});

test("sales invoice printing is shared across panel and customer surfaces", () => {
  assert.match(invoicePrintSource, /export function buildInvoiceHtml/);
  assert.match(invoicePrintSource, /export function openPrintableHtml/);
  assert.match(adminSource, /from "\.\/lib\/invoicePrint\.js"/);
  assert.doesNotMatch(adminSource, /function buildInvoiceHtml/);
  assert.match(apiSource, /apiOrderInvoice/);
  assert.match(serverSource, /\/api\/orders\/"\)\s*&& url\.pathname\.endsWith\("\/invoice"\)/);
});

test("customer and staff orders expose sales invoice printing", () => {
  assert.match(appSource, /apiOrderInvoice/);
  assert.match(appSource, /openSalesInvoice/);
  assert.match(appSource, /Sales Invoice/);
  assert.match(staffSource, /apiOrderInvoice/);
  assert.match(staffSource, /openSalesInvoice/);
  assert.match(staffSource, /Sales Invoice/);
});

test("staff account editor uses readable inputs and centered reset modal", () => {
  const staffPage = adminSource.slice(
    adminSource.indexOf("function AdminStaffAccountsPage"),
    adminSource.indexOf("function AdminRewardsPage")
  );

  assert.match(staffPage, /function StaffAccountInput/);
  assert.match(staffPage, /text-\[var\(--text-secondary\)\]/);
  assert.match(staffPage, /bg-\[var\(--bg-input\)\]/);
  assert.match(staffPage, /onValueChange/);
  assert.doesNotMatch(staffPage, /<HeroInput\s+label="Name"/);
  assert.match(staffPage, /<Modal\.Backdrop>/);
  assert.match(staffPage, /<Modal\.Container size="sm">/);
});

test("staff account form lets admins type before showing validation errors", () => {
  const staffPage = adminSource.slice(
    adminSource.indexOf("function AdminStaffAccountsPage"),
    adminSource.indexOf("function AdminRewardsPage")
  );

  assert.match(staffPage, /const \[touched, setTouched\] = useState\(\{\}\)/);
  assert.match(staffPage, /const \[submitted, setSubmitted\] = useState\(false\)/);
  assert.match(staffPage, /visibleErrors/);
  assert.match(staffPage, /onBlur=\{\(\) => touchField\("email"\)\}/);
  assert.doesNotMatch(staffPage, /Object\.keys\(errors\)\.length > 0/);
});
