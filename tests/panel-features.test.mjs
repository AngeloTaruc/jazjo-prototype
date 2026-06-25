import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const staffSource = fs.readFileSync("frontend/customer/src/StaffPanel.jsx", "utf8");
const adminSource = fs.readFileSync("frontend/customer/src/AdminPanel.jsx", "utf8");
const apiSource = fs.readFileSync("frontend/customer/src/lib/api.js", "utf8");
const serverSource = fs.readFileSync("server/index.mjs", "utf8");

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
