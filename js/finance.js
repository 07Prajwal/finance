/** Pure finance math. No DOM. Used by the app and by Node tests. */

export function fxRate(holding, fx = {}) {
  if (!holding?.currency) return 1;
  if (holding.currency === "USD") return Number(fx.USDINR) || 0;
  if (holding.currency === "EUR") return Number(fx.EURINR) || 0;
  return 1;
}

export function marketValueInr(holding, fx) {
  const shares = Number(holding.shares) || 0;
  const price = Number(holding.price) || 0;
  return price * shares * fxRate(holding, fx);
}

export function enrichHolding(holding, fx) {
  const rate = fxRate(holding, fx);
  const shares = Number(holding.shares) || 0;
  const cost = Number(holding.cost) || 0;
  const market = marketValueInr(holding, fx);
  const gain = market - cost;
  const gainPct = cost ? gain / cost : (market ? 1 : 0);
  const day = (Number(holding.change) || 0) * shares * rate;
  return { ...holding, shares, cost, market, gain, gainPct, day, rate };
}

export function sleeveTotals(rows) {
  const shares = rows.reduce((s, r) => s + (Number(r.shares) || 0), 0);
  const cost = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const market = rows.reduce((s, r) => s + (Number(r.market) || 0), 0);
  const day = rows.reduce((s, r) => s + (Number(r.day) || 0), 0);
  const gain = market - cost;
  const gainPct = cost ? gain / cost : 0;
  return { shares, cost, market, gain, gainPct, day };
}

export function enrichPortfolio(portfolio) {
  const fx = portfolio.fx || { USDINR: 0, EURINR: 0 };
  const realised = Number(portfolio.realised) || 0;
  const trades = portfolio.trades || [];
  const asOf = new Date();
  const indian = (portfolio.indian || []).map((h) => enrichHolding(h, fx));
  const mf = (portfolio.mf || []).map((h) => enrichHolding(h, fx));
  const foreign = (portfolio.foreign || []).map((h) => enrichHolding(h, fx));
  const withXirr = (rows) => rows.map((h) => ({
    ...h,
    xirr: xirrRate(cashflowsForHoldings([h], trades, asOf)),
  }));
  const indianX = withXirr(indian);
  const mfX = withXirr(mf);
  const foreignX = withXirr(foreign);
  const i = sleeveTotals(indianX);
  const m = sleeveTotals(mfX);
  const f = sleeveTotals(foreignX);
  const total = sleeveTotals([...indianX, ...mfX, ...foreignX]);
  i.xirr = xirrRate(cashflowsForHoldings(indianX, trades, asOf));
  m.xirr = xirrRate(cashflowsForHoldings(mfX, trades, asOf));
  f.xirr = xirrRate(cashflowsForHoldings(foreignX, trades, asOf));
  total.xirr = xirrRate(cashflowsForHoldings([...indianX, ...mfX, ...foreignX], trades, asOf));
  return { fx, realised, trades, indian: indianX, mf: mfX, foreign: foreignX, i, m, f, total };
}

function isPositiveNumber(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function applyBuy(holding, { qty, price, fx }) {
  if (!isPositiveNumber(qty) || !isPositiveNumber(price)) {
    return { ok: false, error: "Quantity and price must be greater than 0" };
  }
  const rate = fxRate(holding, fx);
  if (holding.currency && !(rate > 0)) {
    return { ok: false, error: "FX rate must be greater than 0" };
  }
  const addedCostInr = qty * price * rate;
  const oldShares = Number(holding.shares) || 0;
  const oldCost = Number(holding.cost) || 0;
  const oldAvg = Number(holding.avg) || 0;
  const newShares = oldShares + qty;
  const newCost = oldCost + addedCostInr;
  const newAvg = (oldAvg * oldShares + price * qty) / newShares;
  return {
    ok: true,
    holding: { ...holding, shares: newShares, cost: newCost, avg: newAvg, price },
    trade: {
      side: "buy",
      qty,
      price,
      costInr: addedCostInr,
      proceedsInr: 0,
      realised: 0,
    },
  };
}

export function applySell(holding, { qty, price, fx }) {
  if (!isPositiveNumber(qty)) {
    return { ok: false, error: "Quantity must be greater than 0" };
  }
  if (!isPositiveNumber(price)) {
    return { ok: false, error: "Price must be greater than 0" };
  }
  const shares = Number(holding.shares) || 0;
  if (qty > shares + 1e-9) {
    return { ok: false, error: "Cannot sell more than you hold" };
  }
  const rate = fxRate(holding, fx);
  if (holding.currency && !(rate > 0)) {
    return { ok: false, error: "FX rate must be greater than 0" };
  }
  const proceedsInr = qty * price * rate;
  const costRemoved = shares ? (Number(holding.cost) || 0) * (qty / shares) : 0;
  const realised = proceedsInr - costRemoved;
  const remainingQty = Math.max(0, shares - qty);
  const remainingCost = Math.max(0, (Number(holding.cost) || 0) - costRemoved);
  const avg = remainingQty > 0 ? Number(holding.avg) || 0 : 0;
  return {
    ok: true,
    holding: { ...holding, shares: remainingQty, cost: remainingCost, avg, price },
    trade: {
      side: "sell",
      qty,
      price,
      costInr: costRemoved,
      proceedsInr,
      realised,
    },
  };
}

export function newHoldingFromBuy({
  id,
  sleeve,
  symbol,
  name,
  qty,
  price,
  currency,
  platform,
  fx,
}) {
  const holding = {
    id,
    sleeve,
    symbol,
    name: name || symbol,
    price,
    change: 0,
    changePct: 0,
    shares: 0,
    avg: 0,
    cost: 0,
    currency: currency || undefined,
    platform: platform || "",
  };
  return applyBuy(holding, { qty, price, fx });
}

export function monthKey(date) {
  return String(date || "").slice(0, 7);
}

export function thisMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function spendStats(expenses, now = new Date(), typeFilter = "All") {
  const scoped = typeFilter && typeFilter !== "All"
    ? expenses.filter((e) => e.type === typeFilter)
    : expenses;
  const month = thisMonth(now);
  const year = String(now.getFullYear());
  const inMonth = scoped.filter((e) => monthKey(e.date) === month);
  const inYear = scoped.filter((e) => String(e.date).startsWith(year));
  const byCat = {};
  const byType = {};
  const byMonth = Array.from({ length: 12 }, (_, i) => ({
    label: new Date(2000, i, 1).toLocaleString("en", { month: "short" }),
    total: 0,
  }));
  for (const e of inMonth) {
    byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount);
    byType[e.type] = (byType[e.type] || 0) + Number(e.amount);
  }
  for (const e of inYear) {
    const m = Number(String(e.date).slice(5, 7)) - 1;
    if (m >= 0 && m < 12) byMonth[m].total += Number(e.amount);
  }
  return {
    month,
    monthTotal: inMonth.reduce((s, e) => s + Number(e.amount), 0),
    yearTotal: inYear.reduce((s, e) => s + Number(e.amount), 0),
    count: inMonth.length,
    byCat,
    byType,
    byMonth,
    inMonth,
  };
}

export function monthLabel(yyyyMm) {
  const raw = String(yyyyMm || "");
  if (raw.length < 7) return raw;
  const d = new Date(Number(raw.slice(0, 4)), Number(raw.slice(5, 7)) - 1, 1);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en", { month: "short", year: "numeric" });
}

export function expenseMonthKeys(expenses) {
  return [...new Set((expenses || []).map((e) => monthKey(e.date)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));
}

export function expenseYears(expenses) {
  return [...new Set((expenses || []).map((e) => String(e.date || "").slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))]
    .sort((a, b) => b.localeCompare(a));
}

export function filterExpenses(expenses, filters = {}) {
  const month = filters.month || "";
  const type = filters.type || "";
  const category = filters.category || "";
  const account = filters.account || "";
  const notes = String(filters.notes || "").trim().toLowerCase();
  return (expenses || []).filter((e) => {
    if (month && monthKey(e.date) !== month) return false;
    if (type && e.type !== type) return false;
    if (category && e.category !== category) return false;
    if (account && e.account !== account) return false;
    if (notes && !String(e.notes || "").toLowerCase().includes(notes)) return false;
    return true;
  });
}

export function groupSpend(expenses, key) {
  const out = {};
  for (const e of expenses || []) {
    const k = e[key] || "Other";
    out[k] = (out[k] || 0) + Number(e.amount);
  }
  return out;
}

export function yearlyByMonth(expenses, year) {
  const y = String(year || "");
  const byMonth = Array.from({ length: 12 }, (_, i) => ({
    label: new Date(2000, i, 1).toLocaleString("en", { month: "short" }),
    total: 0,
  }));
  for (const e of expenses || []) {
    if (!String(e.date).startsWith(y)) continue;
    const m = Number(String(e.date).slice(5, 7)) - 1;
    if (m >= 0 && m < 12) byMonth[m].total += Number(e.amount);
  }
  return byMonth;
}

export function sumAmounts(expenses) {
  return (expenses || []).reduce((s, e) => s + Number(e.amount || 0), 0);
}

export const DEFAULT_HOLDING_SORT = "name-asc";

export const HOLDING_SORTS = [
  { id: "name-asc", key: "name", dir: "asc", kind: "text", label: "Name · A to Z" },
  { id: "name-desc", key: "name", dir: "desc", kind: "text", label: "Name · Z to A" },
  { id: "market-desc", key: "market", dir: "desc", label: "Current · high to low" },
  { id: "market-asc", key: "market", dir: "asc", label: "Current · low to high" },
  { id: "gain-desc", key: "gain", dir: "desc", label: "Profit · high to low" },
  { id: "gain-asc", key: "gain", dir: "asc", label: "Profit · low to high" },
  { id: "gainPct-desc", key: "gainPct", dir: "desc", label: "Profit % · high to low" },
  { id: "gainPct-asc", key: "gainPct", dir: "asc", label: "Profit % · low to high" },
  { id: "cost-desc", key: "cost", dir: "desc", label: "Invested · high to low" },
  { id: "cost-asc", key: "cost", dir: "asc", label: "Invested · low to high" },
];

export function sortHoldings(rows, sortId = DEFAULT_HOLDING_SORT) {
  const spec = HOLDING_SORTS.find((s) => s.id === sortId) || HOLDING_SORTS[0];
  const mul = spec.dir === "asc" ? 1 : -1;
  return (rows || []).slice().sort((a, b) => {
    if (spec.kind === "text") {
      const av = String(a[spec.key] || a.symbol || "");
      const bv = String(b[spec.key] || b.symbol || "");
      return av.localeCompare(bv, "en", { numeric: true, sensitivity: "base" }) * mul;
    }
    const av = Number(a[spec.key]) || 0;
    const bv = Number(b[spec.key]) || 0;
    if (av === bv) return String(a.name || a.symbol || "").localeCompare(String(b.name || b.symbol || ""), "en", { numeric: true, sensitivity: "base" });
    return (av - bv) * mul;
  });
}

function dateUTC(d) {
  const s = String(d || "").slice(0, 10);
  const [y, m, day] = s.split("-").map(Number);
  if (!y || !m || !day) return NaN;
  return Date.UTC(y, m - 1, day);
}

function isoDate(d) {
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const dt = d instanceof Date ? d : new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function tradeCashflows(trades) {
  return (trades || []).map((t) => {
    const date = isoDate(t.date);
    if (!date || Number.isNaN(dateUTC(date))) return null;
    if (t.side === "buy") {
      const amount = -Math.abs(Number(t.cost_inr != null ? t.cost_inr : Number(t.qty) * Number(t.price)));
      return amount ? { date, amount } : null;
    }
    const amount = Math.abs(Number(t.proceeds_inr != null ? t.proceeds_inr : Number(t.qty) * Number(t.price)));
    return amount ? { date, amount } : null;
  }).filter(Boolean);
}

export function xirr(cashflows, guess = 0.1) {
  const flows = (cashflows || [])
    .filter((f) => f && f.date && Number.isFinite(Number(f.amount)) && Number(f.amount) !== 0)
    .map((f) => ({ date: isoDate(f.date), amount: Number(f.amount) }))
    .sort((a, b) => dateUTC(a.date) - dateUTC(b.date));
  if (flows.length < 2) return { ok: false };
  const t0 = dateUTC(flows[0].date);
  const t1 = dateUTC(flows[flows.length - 1].date);
  if (!(t1 > t0)) return { ok: false };
  const hasPos = flows.some((f) => f.amount > 0);
  const hasNeg = flows.some((f) => f.amount < 0);
  if (!hasPos || !hasNeg) return { ok: false };

  const yearFrac = (d) => (dateUTC(d) - t0) / (365 * 24 * 3600 * 1000);
  const npv = (rate) => flows.reduce((s, f) => s + f.amount / (1 + rate) ** yearFrac(f.date), 0);
  const deriv = (rate) => flows.reduce((s, f) => {
    const t = yearFrac(f.date);
    return s - (t * f.amount) / (1 + rate) ** (t + 1);
  }, 0);

  let rate = guess;
  for (let i = 0; i < 50; i += 1) {
    if (rate <= -0.999999) rate = -0.999999;
    const y = npv(rate);
    const dy = deriv(rate);
    if (!Number.isFinite(y) || !Number.isFinite(dy) || Math.abs(dy) < 1e-12) break;
    const next = rate - y / dy;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-10) {
      rate = next;
      break;
    }
    rate = next;
  }
  if (Number.isFinite(rate) && Math.abs(npv(rate)) < 1e-6) return { ok: true, rate };

  let lo = -0.9999;
  let hi = 10;
  let nLo = npv(lo);
  let nHi = npv(hi);
  if (!Number.isFinite(nLo) || !Number.isFinite(nHi) || nLo * nHi > 0) return { ok: false };
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    const nMid = npv(mid);
    if (!Number.isFinite(nMid)) return { ok: false };
    if (Math.abs(nMid) < 1e-8) return { ok: true, rate: mid };
    if (nLo * nMid <= 0) {
      hi = mid;
      nHi = nMid;
    } else {
      lo = mid;
      nLo = nMid;
    }
  }
  const mid = (lo + hi) / 2;
  return Number.isFinite(mid) ? { ok: true, rate: mid } : { ok: false };
}

export function cashflowsForHoldings(holdings, trades, asOf = new Date()) {
  const ids = new Set((holdings || []).map((h) => h.id).filter(Boolean));
  const flows = tradeCashflows((trades || []).filter((t) => ids.has(t.holding_id)));
  const market = (holdings || []).reduce((s, h) => s + (Number(h.market) || 0), 0);
  if (market > 0) flows.push({ date: isoDate(asOf), amount: market });
  return flows;
}

function xirrRate(flows) {
  const res = xirr(flows);
  return res.ok ? res.rate : null;
}

const RATE_MIN = 0.1;
const RATE_MAX = 50;

export const CALC_LIMITS = {
  monthly: { min: 500, max: 200000, step: 500, money: true },
  lump: { min: 1000, max: 10000000, step: 1000, money: true },
  loan: { min: 100000, max: 20000000, step: 50000, money: true },
  years: { min: 1, max: 50, step: 1 },
  tenure: { min: 1, max: 50, step: 1 },
  rate: { min: 0.1, max: 30, step: 0.1 },
  loanRate: { min: 0.1, max: 20, step: 0.1 },
  step: { min: 0, max: 50, step: 1 },
};

export function formatInr(n, fractionDigits = 0) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(Number(n) || 0);
}

export function formatInrGroup(n, fractionDigits = 0) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(Number(n) || 0);
}

export function parseInrInput(raw) {
  const cleaned = String(raw ?? "").replace(/[₹,\s]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return NaN;
  return Number(cleaned);
}

export function clampCalc(key, n) {
  const lim = CALC_LIMITS[key];
  if (!lim || !Number.isFinite(n)) return n;
  return Math.min(lim.max, Math.max(lim.min, n));
}

function badNumber(n) {
  return n === null || n === undefined || n === "" || Number.isNaN(Number(n));
}

export function validateCalcInputs(kind, state) {
  const errors = [];
  const amountKey = kind === "emi" ? "loan" : kind === "lumpsum" ? "lump" : "monthly";
  const amountLabel = kind === "emi" ? "Loan amount" : "Amount";
  const amountLim = CALC_LIMITS[amountKey];
  const amount = Number(state[amountKey]);
  if (badNumber(state[amountKey])) errors.push(`${amountLabel} is not a number`);
  else if (amount <= 0) errors.push(`${amountLabel} cannot be 0 or negative`);
  else if (amount > amountLim.max) {
    errors.push(`${amountLabel} cannot be more than ${formatInrGroup(amountLim.max)}`);
  }

  const yearsKey = kind === "emi" ? "tenure" : "years";
  const years = Number(state[yearsKey]);
  const yearsLim = CALC_LIMITS[yearsKey];
  if (badNumber(state[yearsKey])) errors.push("Time period is not a number");
  else if (years < yearsLim.min) errors.push("Time period cannot be less than 1 year");
  else if (years > yearsLim.max) errors.push("Time period cannot be more than 50 years");

  const rateKey = kind === "emi" ? "loanRate" : "rate";
  const rateLabel = kind === "emi" ? "Interest rate" : "Expected return";
  const rate = Number(state[rateKey]);
  if (badNumber(state[rateKey])) errors.push(`${rateLabel} is not a number`);
  else if (rate < RATE_MIN || rate > RATE_MAX) {
    errors.push(`${rateLabel} must be between ${RATE_MIN}% and ${RATE_MAX}%`);
  }

  if (kind === "stepup") {
    const step = Number(state.step);
    if (badNumber(state.step)) errors.push("Step-up is not a number");
    else if (step < 0) errors.push("Step-up cannot be negative");
    else if (step > RATE_MAX) errors.push("Step-up is out of range");
  }
  return errors;
}

function yearlyPush(yearly, t, invested, value) {
  if (t % 12 === 0) {
    yearly.push({
      year: t / 12,
      invested,
      returns: Math.max(0, value - invested),
      value,
    });
  }
}

export function computeSip(monthly, rate, years) {
  const r = rate / 12 / 100;
  const n = years * 12;
  let fv = 0;
  let inv = 0;
  const yearly = [];
  for (let t = 1; t <= n; t++) {
    inv += monthly;
    fv = (fv + monthly) * (1 + r);
    yearlyPush(yearly, t, inv, fv);
  }
  return {
    kind: "sip",
    hero: fv,
    invested: inv,
    returns: fv - inv,
    yearly,
    chartInvestedLabel: "Invested",
    chartReturnsLabel: "Est. returns",
    kicker: "Total value",
  };
}

export function computeStepup(monthly, rate, years, step) {
  const r = rate / 12 / 100;
  const n = years * 12;
  let fv = 0;
  let inv = 0;
  let p = monthly;
  const yearly = [];
  for (let t = 1; t <= n; t++) {
    if (t > 1 && (t - 1) % 12 === 0) p *= 1 + step / 100;
    inv += p;
    fv = (fv + p) * (1 + r);
    yearlyPush(yearly, t, inv, fv);
  }
  return {
    kind: "stepup",
    hero: fv,
    invested: inv,
    returns: fv - inv,
    yearly,
    chartInvestedLabel: "Invested",
    chartReturnsLabel: "Est. returns",
    kicker: "Total value",
  };
}

export function computeLumpsum(lump, rate, years) {
  const r = rate / 100;
  const yearly = [];
  for (let y = 1; y <= years; y++) {
    const fv = lump * Math.pow(1 + r, y);
    yearly.push({
      year: y,
      invested: lump,
      returns: Math.max(0, fv - lump),
      value: fv,
    });
  }
  const fv = lump * Math.pow(1 + r, years);
  return {
    kind: "lumpsum",
    hero: fv,
    invested: lump,
    returns: fv - lump,
    yearly,
    chartInvestedLabel: "Invested",
    chartReturnsLabel: "Est. returns",
    kicker: "Total value",
  };
}

export function computeEmi(loan, loanRate, tenure) {
  const r = loanRate / 12 / 100;
  const n = tenure * 12;
  const emi = r ? (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : loan / n;
  const total = emi * n;
  let bal = loan;
  let interestPaid = 0;
  const yearly = [];
  for (let t = 1; t <= n; t++) {
    const interest = bal * r;
    const prin = emi - interest;
    bal = Math.max(0, bal - prin);
    interestPaid += interest;
    if (t % 12 === 0) {
      yearly.push({
        year: t / 12,
        invested: loan - bal,
        returns: interestPaid,
        value: emi,
      });
    }
  }
  return {
    kind: "emi",
    hero: emi,
    principal: loan,
    interest: total - loan,
    total,
    months: n,
    yearly,
    chartInvestedLabel: "Principal repaid",
    chartReturnsLabel: "Interest paid",
    kicker: "Monthly EMI",
  };
}

export function runCalculator(kind, state) {
  const errors = validateCalcInputs(kind, state);
  if (errors.length) return { ok: false, errors };
  if (kind === "sip") return { ok: true, ...computeSip(state.monthly, state.rate, state.years) };
  if (kind === "stepup") {
    return { ok: true, ...computeStepup(state.monthly, state.rate, state.years, state.step) };
  }
  if (kind === "lumpsum") return { ok: true, ...computeLumpsum(state.lump, state.rate, state.years) };
  if (kind === "emi") return { ok: true, ...computeEmi(state.loan, state.loanRate, state.tenure) };
  return { ok: false, errors: ["Unknown calculator"] };
}

export function chartSeries(result) {
  return {
    labels: (result.yearly || []).map((y) => `Y${y.year}`),
    invested: (result.yearly || []).map((y) => y.invested),
    returns: (result.yearly || []).map((y) => y.returns),
    investedLabel: result.chartInvestedLabel,
    returnsLabel: result.chartReturnsLabel,
  };
}
