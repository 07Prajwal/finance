import { allowLocalMode, config, isRemoteConfigured } from "./config.js";
import * as Finance from "./finance.js";
import { SEED_EXPENSES, SEED_PORTFOLIO } from "./seed.js";

const SESSION_KEY = "finance.session.v1";
const LOCAL_DATA_KEY = "finance.data.v1";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const NUM = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const PALETTE = ["#0071E3", "#1D1D1F", "#6E6E73", "#86868b", "#A1A1A6", "#D2D2D7"];

const EXPENSE_TYPES = ["Our Expense", "Home Expense", "My Expense"];
const EXPENSE_CATS = ["Food", "Quick Delivery", "Travel", "Shopping", "Medicine", "Other"];
const EXPENSE_ACCOUNTS = ["UPI", "Cash", "Card"];
const WIZARD_STEPS = ["date", "amount", "type", "category", "account", "notes", "confirm"];

const charts = {};
let session = null;
let expenses = [];
let portfolio = structuredClone(SEED_PORTFOLIO);
let activityFilter = { month: "", type: "", category: "", account: "", notes: "" };
let activityViewAll = false;
let catChartMonth = Finance.thisMonth();
let catChartType = "";
let typeChartMonth = Finance.thisMonth();
let typeChartCategory = "";
let yearChartYear = String(new Date().getFullYear());
let pfSort = Finance.DEFAULT_HOLDING_SORT;
let sleeve = "indian";
let calcKind = "sip";
let calcState = { monthly: 10000, rate: 12, years: 10, step: 10, lump: 100000, loan: 2500000, loanRate: 8.5, tenure: 20 };
let calcTimer = 0;
let wizard = null;
let tradeForm = null;

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}
function rupee(n, d = 0) { return Finance.formatInr(n, d); }
function pct(n) { const v = (n || 0) * 100; return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function cls(n) { return n >= 0 ? "up" : "down"; }
function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
function nowTime() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
function nid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
function roleFromToken(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    const role = payload.app_role || payload.role;
    return role === "owner" || role === "viewer" ? role : "";
  } catch {
    return "";
  }
}

function isOwner() { return session?.role === "owner"; }

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.token || !s?.exp || s.exp < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    s.role = roleFromToken(s.token) || s.role;
    if (s.role !== "owner" && s.role !== "viewer") {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}
function saveSession(s) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function loadLocalData() {
  try {
    const raw = localStorage.getItem(LOCAL_DATA_KEY);
    if (!raw) {
      return {
        expenses: structuredClone(SEED_EXPENSES),
        portfolio: structuredClone(SEED_PORTFOLIO),
      };
    }
    const data = JSON.parse(raw);
    if (!data.portfolio?.realised && data.portfolio) data.portfolio.realised = 0;
    return data;
  } catch {
    return {
      expenses: structuredClone(SEED_EXPENSES),
      portfolio: structuredClone(SEED_PORTFOLIO),
    };
  }
}
function saveLocalData(data) {
  localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
}

function findHolding(id) {
  for (const key of ["indian", "mf", "foreign"]) {
    const idx = (portfolio[key] || []).findIndex((h) => h.id === id);
    if (idx >= 0) return { key, idx, holding: portfolio[key][idx] };
  }
  return null;
}

async function localApi(op, payload = {}) {
  const data = loadLocalData();
  expenses = data.expenses;
  portfolio = data.portfolio;
  if (!portfolio.realised) portfolio.realised = 0;

  if (op === "listAll") return { expenses, portfolio };

  if (session?.role !== "owner") throw new Error("View only — owner password required to change data");

  if (op === "addExpense") {
    expenses.unshift(payload.expense);
  } else if (op === "deleteExpense") {
    expenses = expenses.filter((e) => e.id !== payload.id);
  } else if (op === "buy" || op === "sell") {
    const found = findHolding(payload.holdingId);
    if (!found) throw new Error("Holding not found");
    const fn = op === "buy" ? Finance.applyBuy : Finance.applySell;
    const res = fn(found.holding, { qty: Number(payload.qty), price: Number(payload.price), fx: portfolio.fx });
    if (!res.ok) throw new Error(res.error);
    portfolio[found.key][found.idx] = res.holding;
    if (op === "sell") portfolio.realised = (Number(portfolio.realised) || 0) + res.trade.realised;
  } else if (op === "newBuy") {
    const created = Finance.newHoldingFromBuy({
      id: nid("h"),
      sleeve: payload.sleeve,
      symbol: payload.symbol,
      name: payload.name,
      qty: Number(payload.qty),
      price: Number(payload.price),
      currency: payload.currency || undefined,
      platform: payload.platform || "",
      fx: portfolio.fx,
    });
    if (!created.ok) throw new Error(created.error);
    created.holding.change = 0;
    created.holding.changePct = 0;
    portfolio[payload.sleeve].push(created.holding);
  } else if (op === "updateQuotes") {
    const apply = (row) => {
      const q = (payload.holdings || []).find((h) => h.id === row.id);
      if (!q) return row;
      return { ...row, price: q.price, change: q.change, changePct: q.changePct, name: row.name || q.name };
    };
    portfolio.indian = portfolio.indian.map(apply);
    portfolio.mf = portfolio.mf.map(apply);
    portfolio.foreign = portfolio.foreign.map(apply);
    if (payload.fx?.USDINR) portfolio.fx.USDINR = payload.fx.USDINR;
    if (payload.fx?.EURINR) portfolio.fx.EURINR = payload.fx.EURINR;
  } else {
    throw new Error("Unknown operation");
  }
  saveLocalData({ expenses, portfolio });
  return { expenses, portfolio };
}

async function remoteApi(op, payload = {}) {
  const res = await fetch(`${config.supabaseUrl}/functions/v1/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      apikey: config.supabaseAnonKey,
      "X-Finance-Token": session.token,
    },
    body: JSON.stringify({ op, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function normalizeExpenses(rows) {
  return (rows || []).map((e) => ({
    ...e,
    amount: Number(e.amount),
    notes: e.notes || "",
    time: e.time || "",
  }));
}

async function api(op, payload) {
  const data = isRemoteConfigured() ? await remoteApi(op, payload) : await localApi(op, payload);
  if (data.expenses) expenses = normalizeExpenses(data.expenses);
  if (data.portfolio) portfolio = data.portfolio;
  return data;
}

async function loginRemote(password) {
  const res = await fetch(`${config.supabaseUrl}/functions/v1/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      apikey: config.supabaseAnonKey,
    },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not sign in");
  const role = roleFromToken(data.token) || data.role;
  if (role !== "owner" && role !== "viewer") throw new Error("Could not sign in");
  return { token: data.token, role, exp: Date.now() + SESSION_MS };
}

function loginLocal(password) {
  if (password === config.localOwnerPassword) {
    return { token: "local-owner", role: "owner", exp: Date.now() + SESSION_MS };
  }
  if (password === config.localViewerPassword) {
    return { token: "local-viewer", role: "viewer", exp: Date.now() + SESSION_MS };
  }
  throw new Error("Wrong password");
}

function setRoleChrome() {
  document.body.classList.toggle("is-owner", isOwner());
  $("role-chip").textContent = isOwner() ? "Owner" : "Viewer";
}

function currentPageId() {
  let id = (location.hash || "#home").replace(/^#/, "") || "home";
  if (id.startsWith("/")) id = id.slice(1);
  if (!$(id) || !$(id).classList.contains("page")) id = "home";
  return id;
}

function activatePage(id) {
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === id));
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === id));
}

function unlockApp() {
  $("login-gate").classList.add("hidden");
  $("setup-gate").classList.add("hidden");
  $("app-shell").classList.remove("locked");
  $("local-banner").classList.toggle("hidden", isRemoteConfigured());
  setRoleChrome();
  if (!location.hash || location.hash === "#") location.hash = "home";
  activatePage(currentPageId());
}

function lockApp() {
  session = null;
  localStorage.removeItem(SESSION_KEY);
  $("app-shell").classList.add("locked");
  $("local-banner").classList.add("hidden");
  document.body.classList.remove("is-owner");
}

function showLoginError(msg) {
  const el = $("login-error");
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
}

async function afterLogin() {
  const err = $("login-error");
  if (err) {
    err.textContent = "Loading…";
    err.classList.remove("hidden");
    err.className = "status";
  }
  await api("listAll");
  saveSession(session);
  unlockApp();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  showPage();
}

function showPage() {
  const id = currentPageId();
  activatePage(id);
  if (!session) return;
  try {
    if (id === "home") renderHome();
    if (id === "expenses") renderExpenses();
    if (id === "portfolio") renderPortfolio();
    if (id === "calculators") renderCalc();
  } catch (err) {
    const status = $("quote-status") || $("expense-status");
    if (status) {
      status.textContent = err.message || "Could not draw this page.";
      status.className = "status bad";
    }
  }
}

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

function doughnut(id, labels, values) {
  destroyChart(id);
  const ctx = $(id);
  if (!ctx || typeof Chart === "undefined") return;
  try {
  charts[id] = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: PALETTE.slice(0, labels.length), borderWidth: 0 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 12 } } } }, cutout: "62%" },
  });
  } catch { /* canvas may still be hidden on first paint */ }
}

function bar(id, labels, values, color = "#0071E3") {
  destroyChart(id);
  const ctx = $(id);
  if (!ctx || typeof Chart === "undefined") return;
  try {
  charts[id] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: color, borderRadius: 4, barPercentage: 0.6 }] },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#6E6E73" } },
        y: { grid: { color: "#E5E7EB" }, ticks: { color: "#6E6E73", callback: (v) => Finance.formatInr(v) }, border: { display: false } },
      },
    },
  });
  } catch { /* canvas may still be hidden on first paint */ }
}

function lineStack(id, labels, invested, returns, investedLabel, returnsLabel) {
  destroyChart(id);
  const ctx = $(id);
  if (!ctx || typeof Chart === "undefined") return;
  try {
  charts[id] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: investedLabel, data: invested, backgroundColor: "#1D1D1F", stack: "a", borderRadius: 2 },
        { label: returnsLabel, data: returns, backgroundColor: "#0071E3", stack: "a", borderRadius: 2 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 12 } } } },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, grid: { color: "#E5E7EB" }, border: { display: false }, ticks: { callback: (v) => Finance.formatInr(v) } },
      },
    },
  });
  } catch { /* canvas may still be hidden on first paint */ }
}

function metricHTML(items) {
  return items.map((m) => `
    <div class="metric">
      <div class="label">${esc(m.label)}</div>
      <div class="value">${m.value}</div>
      ${m.delta ? `<div class="delta ${m.tone || ""}">${m.delta}</div>` : ""}
    </div>`).join("");
}

function renderHome() {
  const s = Finance.spendStats(expenses);
  const p = Finance.enrichPortfolio(portfolio);
  $("home-invest-metrics").innerHTML = metricHTML([
    { label: "Current value", value: rupee(p.total.market), delta: `Day ${rupee(p.total.day)}`, tone: cls(p.total.day) },
    { label: "Invested", value: rupee(p.total.cost) },
    { label: "Unrealised P/L", value: rupee(p.total.gain), delta: pct(p.total.cost ? p.total.gain / p.total.cost : 0), tone: cls(p.total.gain) },
    { label: "Day change", value: rupee(p.total.day), tone: cls(p.total.day) },
  ]);
  $("home-spend-metrics").innerHTML = metricHTML([
    { label: "This month", value: rupee(s.monthTotal), delta: `${s.count} logs in ${s.month}` },
    { label: "Year to date", value: rupee(s.yearTotal) },
  ]);
  doughnut("home-alloc-chart", ["Indian stocks", "Mutual funds", "Foreign stocks"], [p.i.market, p.m.market, p.f.market]);
  const cats = Object.keys(s.byCat);
  doughnut("home-spend-chart", cats.length ? cats : ["No spend yet"], cats.length ? cats.map((c) => s.byCat[c]) : [1]);
}

function trashSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M8 7l.8 13h6.4L16 7"/></svg>`;
}

function fillSelect(id, options, selected, allLabel) {
  const el = $(id);
  if (!el) return;
  const html = [
    allLabel != null ? `<option value="">${esc(allLabel)}</option>` : "",
    ...options.map((o) => {
      const value = o.value ?? o;
      const label = o.label ?? o;
      return `<option value="${esc(value)}"${String(value) === String(selected) ? " selected" : ""}>${esc(label)}</option>`;
    }),
  ].join("");
  if (el.innerHTML === html) {
    el.value = selected;
    return;
  }
  el.innerHTML = html;
  el.value = selected;
}

function monthOptions(extra) {
  const keys = Finance.expenseMonthKeys(expenses);
  if (extra && !keys.includes(extra)) keys.unshift(extra);
  return keys.map((k) => ({ value: k, label: Finance.monthLabel(k) }));
}

function yearOptions(extra) {
  const years = Finance.expenseYears(expenses);
  if (extra && !years.includes(String(extra))) years.unshift(String(extra));
  return years;
}

function doughnutOrEmpty(id, grouped) {
  const labels = Object.keys(grouped);
  doughnut(id, labels.length ? labels : ["No spend yet"], labels.length ? labels.map((k) => grouped[k]) : [1]);
}

function renderCatChart() {
  doughnutOrEmpty("cat-chart", Finance.groupSpend(
    Finance.filterExpenses(expenses, { month: catChartMonth, type: catChartType }),
    "category"
  ));
}

function renderTypeChart() {
  doughnutOrEmpty("type-chart", Finance.groupSpend(
    Finance.filterExpenses(expenses, { month: typeChartMonth, category: typeChartCategory }),
    "type"
  ));
}

function renderYearChart() {
  const byMonth = Finance.yearlyByMonth(expenses, yearChartYear);
  bar("month-chart", byMonth.map((m) => m.label), byMonth.map((m) => m.total));
}

function renderExpenseCharts() {
  renderCatChart();
  renderTypeChart();
  renderYearChart();
}

function renderExpenseActivity() {
  const filtered = Finance.filterExpenses(expenses, activityFilter)
    .slice()
    .sort((a, b) => `${b.date}${b.time || ""}`.localeCompare(`${a.date}${a.time || ""}`));
  const shown = activityViewAll ? filtered : filtered.slice(0, 20);
  const sum = Finance.sumAmounts(shown);
  $("expense-rows").innerHTML = shown.map((e) => `
    <tr>
      <td>${esc(e.date)} <span class="tiny">${esc(e.time || "")}</span></td>
      <td><span class="chip">${esc(e.type)}</span></td>
      <td>${esc(e.category)}</td>
      <td>${esc(e.account)}</td>
      <td>${esc(e.notes || "")}</td>
      <td class="num">${rupee(e.amount, 2)}</td>
      <td class="owner-only actions-cell">
        <button class="icon-btn" type="button" data-del="${esc(e.id)}" aria-label="Delete expense">${trashSvg()}</button>
      </td>
    </tr>`).join("");
  $("expense-foot").innerHTML = `
    <tr>
      <td colspan="5">Sum of ${shown.length} row${shown.length === 1 ? "" : "s"}</td>
      <td class="num">${rupee(sum, 2)}</td>
      <td class="owner-only"></td>
    </tr>`;
  const meta = $("activity-meta");
  if (meta) {
    meta.textContent = activityViewAll || filtered.length <= 20
      ? `${shown.length} of ${filtered.length}`
      : `Recent ${shown.length} of ${filtered.length}`;
  }
  const viewBtn = $("act-viewall");
  if (viewBtn) {
    viewBtn.textContent = activityViewAll ? "Show recent 20" : "View all";
    viewBtn.classList.toggle("hidden", filtered.length <= 20);
  }
}

function renderExpenses() {
  const s = Finance.spendStats(expenses, new Date());
  const our = s.inMonth.filter((e) => e.type === "Our Expense").reduce((a, e) => a + Number(e.amount), 0);
  $("expense-metrics").innerHTML = metricHTML([
    { label: "This month", value: rupee(s.monthTotal) },
    { label: "Our expense", value: rupee(our) },
    { label: "Categories", value: String(Object.keys(s.byCat).length) },
    { label: "Year total", value: rupee(s.yearTotal) },
  ]);

  fillSelect("cat-month", monthOptions(catChartMonth), catChartMonth);
  fillSelect("cat-type", EXPENSE_TYPES, catChartType, "All types");
  fillSelect("type-month", monthOptions(typeChartMonth), typeChartMonth);
  fillSelect("type-category", EXPENSE_CATS, typeChartCategory, "All categories");
  fillSelect("year-chart-year", yearOptions(yearChartYear).map((y) => ({ value: y, label: y })), yearChartYear);
  fillSelect("act-month", monthOptions(), activityFilter.month, "All months");
  fillSelect("act-type", EXPENSE_TYPES, activityFilter.type, "All types");
  fillSelect("act-category", EXPENSE_CATS, activityFilter.category, "All categories");
  fillSelect("act-account", EXPENSE_ACCOUNTS, activityFilter.account, "All accounts");

  renderExpenseCharts();
  renderExpenseActivity();
}

function renderPortfolio() {
  const p = Finance.enrichPortfolio(portfolio);
  $("pf-metrics").innerHTML = metricHTML([
    { label: "Current value", value: rupee(p.total.market), delta: `Day ${rupee(p.total.day)} · ${pct(p.total.market ? p.total.day / (p.total.market - p.total.day) : 0)}`, tone: cls(p.total.day) },
    { label: "Invested", value: rupee(p.total.cost) },
    { label: "Unrealised P/L", value: rupee(p.total.gain), delta: pct(p.total.gainPct), tone: cls(p.total.gain) },
    { label: "Unrealised P/L %", value: pct(p.total.gainPct), tone: cls(p.total.gain) },
    { label: "Realised P/L", value: rupee(p.realised), tone: cls(p.realised) },
    { label: "XIRR", value: p.total.xirr == null ? "—" : pct(p.total.xirr), delta: p.total.xirr == null ? "Needs dated buys" : "Money-weighted" },
  ]);
  doughnut("alloc-chart", ["Indian stocks", "Mutual funds", "Foreign stocks"], [p.i.market, p.m.market, p.f.market]);
  bar("sleeve-chart", ["Indian", "Mutual funds", "Foreign"], [p.i.gain, p.m.gain, p.f.gain], "#1D1D1F");

  const map = { indian: p.indian, mf: p.mf, foreign: p.foreign };
  const totals = { indian: p.i, mf: p.m, foreign: p.f };
  const rows = Finance.sortHoldings(map[sleeve].filter((r) => r.shares > 1e-9), pfSort);
  const t = totals[sleeve];
  const fxCol = sleeve === "foreign";
  const unit = sleeve === "mf" ? "Units" : "Shares";
  const sortEl = $("pf-sort");
  if (sortEl && sortEl.dataset.ready !== "name-v1") {
    sortEl.innerHTML = Finance.HOLDING_SORTS.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join("");
    sortEl.dataset.ready = "name-v1";
  }
  if (sortEl) sortEl.value = pfSort;
  $("pf-head").innerHTML = `<tr>
    <th>Holding</th><th>Platform</th><th class="num">Price</th><th class="num">Day</th>
    <th class="num">${unit}</th><th class="num">Avg</th>
    <th class="num">Invested</th><th class="num">Current</th><th class="num">Profit</th><th class="num">Profit %</th><th class="num">XIRR</th>
    <th class="owner-only"></th>
  </tr>`;
  $("pf-rows").innerHTML = rows.map((r) => `
    <tr class="${r.gain < 0 ? "loss" : ""}">
      <td><strong>${esc(r.name)}</strong><div class="tiny">${esc(r.symbol)}${fxCol ? " · " + esc(r.currency) : ""}</div></td>
      <td>${esc(r.platform)}</td>
      <td class="num">${NUM.format(r.price)}</td>
      <td class="num ${r.changePct >= 0 ? "gain" : "loss"}">${pct(r.changePct)}</td>
      <td class="num">${NUM.format(r.shares)}</td>
      <td class="num">${NUM.format(r.avg)}</td>
      <td class="num">${rupee(r.cost)}</td>
      <td class="num">${rupee(r.market)}</td>
      <td class="num ${r.gain >= 0 ? "gain" : "loss"}">${rupee(r.gain)}</td>
      <td class="num ${r.gainPct >= 0 ? "gain" : "loss"}">${pct(r.gainPct)}</td>
      <td class="num ${r.xirr == null ? "" : r.xirr >= 0 ? "gain" : "loss"}">${r.xirr == null ? "—" : pct(r.xirr)}</td>
      <td class="owner-only actions-cell">
        <button class="icon-btn buy" type="button" data-trade="buy" data-id="${esc(r.id)}">Buy</button>
        <button class="icon-btn sell" type="button" data-trade="sell" data-id="${esc(r.id)}">Sell</button>
      </td>
    </tr>`).join("");
  $("pf-foot").innerHTML = `<tr>
    <td>Total</td><td></td><td></td><td></td>
    <td class="num">${NUM.format(t.shares)}</td><td></td>
    <td class="num">${rupee(t.cost)}</td>
    <td class="num">${rupee(t.market)}</td>
    <td class="num ${t.gain >= 0 ? "gain" : "loss"}">${rupee(t.gain)}</td>
    <td class="num ${t.gainPct >= 0 ? "gain" : "loss"}">${pct(t.gainPct)}</td>
    <td class="num ${t.xirr == null ? "" : t.xirr >= 0 ? "gain" : "loss"}">${t.xirr == null ? "—" : pct(t.xirr)}</td>
    <td class="owner-only"></td>
  </tr>`;
}

function statPair(a, av, b, bv) {
  return `<div class="metric"><div class="label">${a}</div><div class="value" style="font-size:21px">${av}</div></div>
          <div class="metric"><div class="label">${b}</div><div class="value" style="font-size:21px">${bv}</div></div>`;
}

function sliderRow(key, label, suffix) {
  const lim = Finance.CALC_LIMITS[key];
  const value = calcState[key];
  const shown = lim.money ? Finance.formatInrGroup(value) : value;
  const extra = lim.money
    ? `type="text" inputmode="decimal" data-money="1" autocomplete="off"`
    : `type="number" min="${lim.min}" max="${lim.max}" step="${lim.step}"`;
  return `<div class="slider-row" data-field="${key}">
    <header>
      <label>${label}</label>
      <div class="num-wrap">
        <input ${extra} data-key="${key}" value="${shown}" />
        <span class="suffix">${suffix}</span>
      </div>
    </header>
    <input type="range" data-key="${key}" min="${lim.min}" max="${lim.max}" step="${lim.step}" value="${value}" />
    <p class="field-error" data-err="${key}"></p>
  </div>`;
}

function renderCalcControls() {
  const isEmi = calcKind === "emi";
  const isLump = calcKind === "lumpsum";
  const isStep = calcKind === "stepup";
  $("calc-controls").innerHTML = `
    ${!isEmi && !isLump ? sliderRow("monthly", "Monthly investment", "₹") : ""}
    ${isLump ? sliderRow("lump", "Total investment", "₹") : ""}
    ${isEmi ? sliderRow("loan", "Loan amount", "₹") : ""}
    ${isEmi ? sliderRow("loanRate", "Interest rate (p.a.)", "%") : sliderRow("rate", "Expected return (p.a.)", "%")}
    ${isEmi ? sliderRow("tenure", "Tenure", "yr") : sliderRow("years", "Time period", "yr")}
    ${isStep ? sliderRow("step", "Annual step-up", "%") : ""}
    <p class="tiny">Figures are estimates. Actual returns vary with markets and tax.</p>
    <p class="field-error" id="calc-errors"></p>
  `;
  $("calc-controls").oninput = (e) => {
    const inp = e.target.closest("[data-key]");
    if (!inp) return;
    const key = inp.dataset.key;
    const lim = Finance.CALC_LIMITS[key];
    let value = inp.type === "range" ? Number(inp.value) : (lim.money ? Finance.parseInrInput(inp.value) : Number(inp.value));
    if (!Number.isFinite(value)) return;
    value = Finance.clampCalc(key, value);
    calcState[key] = value;
    const row = inp.closest(".slider-row");
    row.querySelectorAll("[data-key]").forEach((el) => {
      if (el === inp && el.type !== "range") return;
      if (el.type === "range") el.value = value;
      else if (lim.money) el.value = Finance.formatInrGroup(value);
      else el.value = value;
    });
    if (inp.type === "range") {
      clearTimeout(calcTimer);
      calcTimer = setTimeout(renderCalcResults, 120);
    } else {
      renderCalcResults();
    }
  };
  $("calc-controls").onfocusout = (e) => {
    const inp = e.target.closest("[data-key]");
    if (!inp || inp.type === "range") return;
    const key = inp.dataset.key;
    const lim = Finance.CALC_LIMITS[key];
    const value = calcState[key];
    inp.value = lim.money ? Finance.formatInrGroup(value) : value;
  };
}

function renderCalcResults() {
  const result = Finance.runCalculator(calcKind, calcState);
  const errBox = $("calc-errors");
  if (!result.ok) {
    if (errBox) errBox.textContent = result.errors.join(" · ");
    $("calc-hero").textContent = "—";
    $("calc-stats").innerHTML = "";
    $("calc-kicker").textContent = "Fix the inputs";
    destroyChart("calc-chart");
    return;
  }
  if (errBox) errBox.textContent = "";
  $("calc-kicker").textContent = result.kicker;
  if (result.kind === "emi") {
    $("calc-hero").textContent = rupee(result.hero);
    $("calc-stats").innerHTML =
      statPair("Principal", rupee(result.principal), "Total interest", rupee(result.interest)) +
      statPair("Total payable", rupee(result.total), "Tenure", `${result.months} months`);
  } else {
    $("calc-hero").textContent = rupee(result.hero);
    $("calc-stats").innerHTML = statPair("Invested amount", rupee(result.invested), "Est. returns", rupee(result.returns));
  }
  const series = Finance.chartSeries(result);
  lineStack("calc-chart", series.labels, series.invested, series.returns, series.investedLabel, series.returnsLabel);
}

function renderCalc() {
  renderCalcControls();
  renderCalcResults();
}

function openOverlay(html) {
  $("modal").innerHTML = html;
  $("overlay").classList.remove("hidden");
}
function closeOverlay() {
  $("overlay").classList.add("hidden");
  $("modal").innerHTML = "";
  wizard = null;
  tradeForm = null;
}

function choiceButtons(name, options, selected) {
  return `<div class="step-pills">${options.map((o) =>
    `<button type="button" data-choice="${esc(name)}" data-val="${esc(o)}" class="${selected === o ? "on" : ""}">${esc(o)}</button>`
  ).join("")}</div>`;
}

function renderWizard() {
  const step = WIZARD_STEPS[wizard.i];
  const n = wizard.i + 1;
  const last = wizard.i === WIZARD_STEPS.length - 1;
  const d = wizard.data;
  let body = "";
  let title = "Add expense";
  if (step === "date") {
    title = "When was this?";
    body = `${choiceButtons("dateMode", ["Today", "Pick a date"], d.dateMode)}
      ${d.dateMode === "Pick a date" ? `<label class="field" style="margin-top:16px">Date<input type="date" id="wiz-date" value="${esc(d.date)}" /></label>` : ""}`;
  } else if (step === "amount") {
    title = "How much?";
    body = `<label class="field">Amount (₹)<input type="number" id="wiz-amount" min="0.01" step="0.01" value="${d.amount || ""}" autofocus /></label>`;
  } else if (step === "type") {
    title = "What type?";
    body = choiceButtons("type", EXPENSE_TYPES, d.type);
  } else if (step === "category") {
    title = "Which category?";
    body = choiceButtons("category", EXPENSE_CATS, d.category);
  } else if (step === "account") {
    title = "Paid from?";
    body = choiceButtons("account", EXPENSE_ACCOUNTS, d.account);
  } else if (step === "notes") {
    title = "Any notes?";
    body = `<label class="field">Notes<input type="text" id="wiz-notes" value="${esc(d.notes)}" placeholder="Optional" /></label>`;
  } else {
    title = "Confirm";
    body = `<div class="confirm-list">
      <div><span>Date</span><strong>${esc(d.date)}</strong></div>
      <div><span>Amount</span><strong>${rupee(Number(d.amount), 2)}</strong></div>
      <div><span>Type</span><strong>${esc(d.type)}</strong></div>
      <div><span>Category</span><strong>${esc(d.category)}</strong></div>
      <div><span>Account</span><strong>${esc(d.account)}</strong></div>
      <div><span>Notes</span><strong>${esc(d.notes || "—")}</strong></div>
    </div>`;
  }
  openOverlay(`
    <p class="wizard-progress">Step ${n} of ${WIZARD_STEPS.length}</p>
    <h2>${title}</h2>
    <div class="lead"></div>
    ${body}
    <p class="field-error" id="wiz-error"></p>
    <div class="modal-footer">
      <button class="btn secondary" type="button" id="wiz-back">${wizard.i === 0 ? "Cancel" : "Back"}</button>
      <button class="btn" type="button" id="wiz-next">${last ? "Save expense" : "Next"}</button>
    </div>
  `);
}

function wizardRead() {
  const step = WIZARD_STEPS[wizard.i];
  if (step === "date") {
    if (wizard.data.dateMode === "Pick a date") {
      const el = $("wiz-date");
      if (el) wizard.data.date = el.value;
    } else {
      wizard.data.date = todayISO();
    }
  }
  if (step === "amount") {
    const el = $("wiz-amount");
    if (el) wizard.data.amount = el.value;
  }
  if (step === "notes") {
    const el = $("wiz-notes");
    if (el) wizard.data.notes = el.value;
  }
}

function wizardCanAdvance() {
  const step = WIZARD_STEPS[wizard.i];
  const d = wizard.data;
  if (step === "date" && !d.date) return "Pick a date";
  if (step === "amount") {
    const n = Number(d.amount);
    if (!(n > 0)) return "Amount must be greater than 0";
  }
  if (step === "type" && !d.type) return "Choose a type";
  if (step === "category" && !d.category) return "Choose a category";
  if (step === "account" && !d.account) return "Choose an account";
  return "";
}

function startExpenseWizard() {
  wizard = {
    i: 0,
    data: {
      dateMode: "Today",
      date: todayISO(),
      amount: "",
      type: "",
      category: "",
      account: "",
      notes: "",
    },
  };
  renderWizard();
}

async function saveExpenseFromWizard() {
  const d = wizard.data;
  await api("addExpense", {
    expense: {
      id: nid("e"),
      date: d.date,
      time: nowTime(),
      amount: Number(d.amount),
      type: d.type,
      category: d.category,
      account: d.account,
      notes: d.notes || "",
    },
  });
  closeOverlay();
  $("expense-status").textContent = "Expense saved.";
  $("expense-status").className = "status ok";
  if ((location.hash || "#home").slice(1) !== "expenses") location.hash = "expenses";
  else renderExpenses();
}

function confirmDeleteExpense(id) {
  const e = expenses.find((x) => x.id === id);
  if (!e) return;
  openOverlay(`
    <h2>Delete this expense?</h2>
    <p class="lead">${rupee(e.amount, 2)} on ${esc(e.date)}${e.notes ? ` · ${esc(e.notes)}` : ""}</p>
    <p class="tiny">This cannot be undone.</p>
    <div class="modal-footer">
      <button class="btn secondary" type="button" id="dlg-cancel">Cancel</button>
      <button class="btn danger" type="button" id="dlg-delete" data-id="${esc(id)}">Delete</button>
    </div>
  `);
}

function priceUnit(holding) {
  if (holding?.currency === "USD") return "USD";
  if (holding?.currency === "EUR") return "EUR";
  return "INR";
}

function openTradeModal(mode, holding) {
  tradeForm = { mode, holding };
  const isNew = mode === "new";
  const unit = isNew ? "INR" : priceUnit(holding);
  const title = isNew ? "New buy" : mode === "buy" ? `Buy ${holding.name}` : `Sell ${holding.name}`;
  const extra = isNew ? `
    <div class="fields" style="grid-template-columns:1fr 1fr">
      <label class="field">Sleeve
        <select id="tr-sleeve">
          <option value="indian">Indian stocks</option>
          <option value="mf">Mutual funds</option>
          <option value="foreign">Foreign stocks</option>
        </select>
      </label>
      <label class="field">Currency
        <select id="tr-currency">
          <option value="">INR</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
      </label>
      <label class="field">Symbol<input id="tr-symbol" required placeholder="RELIANCE.NS" /></label>
      <label class="field">Name<input id="tr-name" placeholder="Optional" /></label>
      <label class="field span-3">Platform<input id="tr-platform" placeholder="Zerodha" /></label>
    </div>` : `<p class="tiny">Held: ${NUM.format(holding.shares)} · Avg ${NUM.format(holding.avg)} ${unit}</p>`;
  openOverlay(`
    <h2>${esc(title)}</h2>
    ${extra}
    <div class="fields" style="grid-template-columns:1fr 1fr;margin-top:12px">
      <label class="field">Quantity<input type="number" id="tr-qty" min="0" step="any" required /></label>
      <label class="field">Price (<span id="tr-price-unit">${unit}</span>)<input type="number" id="tr-price" min="0" step="any" required /></label>
      <label class="field">Date<input type="date" id="tr-date" value="${todayISO()}" /></label>
    </div>
    <p class="field-error" id="tr-error"></p>
    <div class="modal-footer">
      <button class="btn secondary" type="button" id="dlg-cancel">Cancel</button>
      <button class="btn" type="button" id="tr-save">${isNew || mode === "buy" ? "Record buy" : "Record sell"}</button>
    </div>
  `);
}

async function submitTrade() {
  const qty = Number($("tr-qty").value);
  const price = Number($("tr-price").value);
  const date = $("tr-date").value || todayISO();
  const err = $("tr-error");
  try {
    if (!(qty > 0) || !(price > 0)) {
      err.textContent = "Quantity and price must be greater than 0";
      return;
    }
    if (tradeForm.mode === "new") {
      const sl = $("tr-sleeve").value;
      const symbol = $("tr-symbol").value.trim();
      if (!symbol) {
        err.textContent = "Symbol is required";
        return;
      }
      const currency = $("tr-currency").value || undefined;
      if (sl !== "foreign" && currency) {
        err.textContent = "USD/EUR is only for the foreign sleeve.";
        return;
      }
      if (sl === "foreign" && !currency) {
        err.textContent = "Pick USD or EUR for a foreign lot.";
        return;
      }
      await api("newBuy", {
        sleeve: sl,
        symbol,
        name: $("tr-name").value.trim(),
        platform: $("tr-platform").value.trim(),
        currency,
        qty,
        price,
        date,
      });
      if (sl) sleeve = sl;
    } else {
      await api(tradeForm.mode, { holdingId: tradeForm.holding.id, qty, price, date });
    }
    closeOverlay();
    renderPortfolio();
    $("quote-status").textContent = tradeForm.mode === "sell" ? "Sale recorded. Realised P/L updated." : "Buy recorded. Average cost updated.";
    $("quote-status").className = "status ok";
  } catch (e) {
    err.textContent = e.message || "Could not save";
  }
}

async function fetchYahoo(symbols) {
  if (isRemoteConfigured()) {
    const data = await api("fetchQuotes", { symbols });
    if (!data.quotes || !Object.keys(data.quotes).length) throw new Error("quotes blocked");
    return data.quotes;
  }
  const out = {};
  const url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" + encodeURIComponent(symbols.join(","));
  const proxies = [
    url,
    "https://corsproxy.io/?" + encodeURIComponent(url),
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
  ];
  for (const u of proxies) {
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      const list = data.quoteResponse?.result || [];
      if (!list.length) continue;
      for (const q of list) {
        out[q.symbol] = {
          price: q.regularMarketPrice,
          change: q.regularMarketChange,
          changePct: (q.regularMarketChangePercent || 0) / 100,
          name: q.shortName || q.longName,
        };
      }
      return out;
    } catch { /* next proxy */ }
  }
  throw new Error("quotes blocked");
}

function applyQuotesInMemory(quotes) {
  const apply = (row) => {
    const q = quotes[row.symbol];
    if (!q || !q.price) return row;
    return { ...row, price: q.price, change: q.change, changePct: q.changePct, name: row.name || q.name };
  };
  portfolio.indian = portfolio.indian.map(apply);
  portfolio.mf = portfolio.mf.map(apply);
  portfolio.foreign = portfolio.foreign.map(apply);
  if (quotes["USDINR=X"]?.price) portfolio.fx.USDINR = quotes["USDINR=X"].price;
  if (quotes["EURINR=X"]?.price) portfolio.fx.EURINR = quotes["EURINR=X"].price;
}

async function refreshQuotes() {
  const status = $("quote-status");
  status.textContent = "Fetching live prices…";
  status.className = "status";
  const symbols = [
    ...portfolio.indian.map((h) => h.symbol),
    ...portfolio.mf.map((h) => h.symbol),
    ...portfolio.foreign.map((h) => h.symbol),
    "USDINR=X",
    "EURINR=X",
  ];
  const unique = [...new Set(symbols)];
  try {
    const half = Math.ceil(unique.length / 2);
    const a = await fetchYahoo(unique.slice(0, half));
    const b = await fetchYahoo(unique.slice(half));
    const quotes = { ...a, ...b };
    applyQuotesInMemory(quotes);
    if (isOwner()) {
      const holdings = [...portfolio.indian, ...portfolio.mf, ...portfolio.foreign].map((h) => ({
        id: h.id, price: h.price, change: h.change, changePct: h.changePct, name: h.name,
      }));
      await api("updateQuotes", { holdings, fx: portfolio.fx });
    }
    const n = Object.keys(quotes).length;
    status.textContent = `Live prices updated for ${n} symbols. USD/INR ${Number(portfolio.fx.USDINR || 0).toFixed(2)}, EUR/INR ${Number(portfolio.fx.EURINR || 0).toFixed(2)}.`;
    status.className = "status ok";
    renderPortfolio();
  } catch (err) {
    status.textContent = (err && err.message) || "Live prices could not be updated. Last saved prices are still shown.";
    status.className = "status bad";
  }
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  showLoginError("");
  const password = e.target.password.value;
  try {
    session = isRemoteConfigured() ? await loginRemote(password) : loginLocal(password);
    await afterLogin();
  } catch (err) {
    showLoginError(err.message || "Could not sign in");
  }
});

$("sign-out").addEventListener("click", () => {
  lockApp();
  $("login-gate").classList.remove("hidden");
});

$("nav-add-expense").addEventListener("click", startExpenseWizard);
$("add-expense").addEventListener("click", startExpenseWizard);
$("new-buy").addEventListener("click", () => openTradeModal("new"));
$("refresh-quotes").addEventListener("click", refreshQuotes);

$("expenses").addEventListener("change", (e) => {
  const id = e.target.id;
  if (id === "cat-month") catChartMonth = e.target.value;
  else if (id === "cat-type") catChartType = e.target.value;
  else if (id === "type-month") typeChartMonth = e.target.value;
  else if (id === "type-category") typeChartCategory = e.target.value;
  else if (id === "year-chart-year") yearChartYear = e.target.value;
  else if (id === "act-month") activityFilter.month = e.target.value;
  else if (id === "act-type") activityFilter.type = e.target.value;
  else if (id === "act-category") activityFilter.category = e.target.value;
  else if (id === "act-account") activityFilter.account = e.target.value;
  else return;
  if (id.startsWith("act-")) renderExpenseActivity();
  else if (id === "cat-month" || id === "cat-type") renderCatChart();
  else if (id === "type-month" || id === "type-category") renderTypeChart();
  else if (id === "year-chart-year") renderYearChart();
});
$("act-notes").addEventListener("input", (e) => {
  activityFilter.notes = e.target.value;
  renderExpenseActivity();
});
$("act-clear").addEventListener("click", () => {
  activityFilter = { month: "", type: "", category: "", account: "", notes: "" };
  activityViewAll = false;
  $("act-notes").value = "";
  $("act-month").value = "";
  $("act-type").value = "";
  $("act-category").value = "";
  $("act-account").value = "";
  renderExpenseActivity();
});
$("act-viewall").addEventListener("click", () => {
  activityViewAll = !activityViewAll;
  renderExpenseActivity();
});
$("pf-sort").addEventListener("change", (e) => {
  pfSort = e.target.value || Finance.DEFAULT_HOLDING_SORT;
  renderPortfolio();
});
$("pf-sort-clear").addEventListener("click", () => {
  pfSort = Finance.DEFAULT_HOLDING_SORT;
  if ($("pf-sort")) $("pf-sort").value = pfSort;
  renderPortfolio();
});

$("expense-rows").addEventListener("click", (e) => {
  const b = e.target.closest("[data-del]");
  if (!b || !isOwner()) return;
  confirmDeleteExpense(b.dataset.del);
});

$("pf-rows").addEventListener("click", (e) => {
  const b = e.target.closest("[data-trade]");
  if (!b || !isOwner()) return;
  const found = findHolding(b.dataset.id);
  if (!found) return;
  openTradeModal(b.dataset.trade, found.holding);
});

$("pf-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  sleeve = b.dataset.sleeve;
  [...e.currentTarget.children].forEach((x) => x.classList.toggle("on", x === b));
  renderPortfolio();
});

$("calc-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  calcKind = b.dataset.calc;
  [...e.currentTarget.children].forEach((x) => x.classList.toggle("on", x === b));
  renderCalc();
});

$("overlay").addEventListener("change", (e) => {
  if (e.target.id !== "tr-sleeve" && e.target.id !== "tr-currency") return;
  const sl = $("tr-sleeve")?.value;
  const cur = $("tr-currency");
  const unitEl = $("tr-price-unit");
  if (!sl || !unitEl) return;
  if (sl === "foreign") {
    if (cur && !cur.value) cur.value = "USD";
    unitEl.textContent = cur?.value || "USD";
  } else {
    if (cur) cur.value = "";
    unitEl.textContent = "INR";
  }
});

$("overlay").addEventListener("click", async (e) => {
  const t = e.target;
  if (t.id === "overlay" || t.id === "dlg-cancel") {
    closeOverlay();
    return;
  }
  if (t.id === "wiz-back" && wizard) {
    if (wizard.i === 0) {
      closeOverlay();
      return;
    }
    wizardRead();
    wizard.i -= 1;
    renderWizard();
    return;
  }
  if (t.id === "wiz-next" && wizard) {
    wizardRead();
    const err = wizardCanAdvance();
    if (err) {
      $("wiz-error").textContent = err;
      return;
    }
    if (wizard.i === WIZARD_STEPS.length - 1) {
      try { await saveExpenseFromWizard(); } catch (ex) { $("wiz-error").textContent = ex.message; }
      return;
    }
    wizard.i += 1;
    renderWizard();
    return;
  }
  const choice = t.closest("[data-choice]");
  if (choice && wizard) {
    const name = choice.dataset.choice;
    const val = choice.dataset.val;
    if (name === "dateMode") {
      wizard.data.dateMode = val;
      wizard.data.date = val === "Today" ? todayISO() : wizard.data.date;
      renderWizard();
    } else {
      wizard.data[name] = val;
      wizard.i += 1;
      renderWizard();
    }
    return;
  }
  if (t.id === "dlg-delete") {
    try {
      await api("deleteExpense", { id: t.dataset.id });
      closeOverlay();
      renderExpenses();
    } catch (ex) {
      $("wiz-error") && ($("wiz-error").textContent = ex.message);
    }
    return;
  }
  if (t.id === "tr-save") {
    await submitTrade();
  }
});

window.addEventListener("hashchange", showPage);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("overlay").classList.contains("hidden")) closeOverlay();
});

(async function boot() {
  if (!isRemoteConfigured() && !allowLocalMode()) {
    $("setup-gate").classList.remove("hidden");
    return;
  }
  session = loadSession();
  if (session && isRemoteConfigured() && session.token.startsWith("local-")) {
    session = null;
    localStorage.removeItem(SESSION_KEY);
  }
  if (session) {
    try {
      await afterLogin();
      return;
    } catch {
      lockApp();
    }
  }
  $("login-gate").classList.remove("hidden");
})();
