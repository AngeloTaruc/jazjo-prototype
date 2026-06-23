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
  assert.match(adminSource, /openPrintableReport/);
  assert.match(adminSource, /download = `jazjo-reports-/);
});
