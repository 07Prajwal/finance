import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyBuy,
  applySell,
  chartSeries,
  clampCalc,
  computeEmi,
  computeLumpsum,
  computeSip,
  computeStepup,
  enrichHolding,
  enrichPortfolio,
  filterExpenses,
  formatInr,
  formatInrGroup,
  groupSpend,
  marketValueInr,
  parseInrInput,
  runCalculator,
  sleeveTotals,
  sortHoldings,
  spendStats,
  sumAmounts,
  validateCalcInputs,
  xirr,
  yearlyByMonth,
} from "./finance.js";

const FX = { USDINR: 94.47, EURINR: 109.85 };

function close(actual, expected, eps = 0.02) {
  assert.ok(
    Math.abs(actual - expected) < eps,
    `expected ${expected}, got ${actual}`
  );
}

describe("foreign FX (Numbers market value in rupees)", () => {
  it("AT&T value is price × shares × USDINR; cost stays in INR", () => {
    const att = {
      symbol: "T",
      price: 25.68,
      shares: 4.90348,
      avg: 20.59,
      cost: 10000,
      currency: "USD",
      change: -0.51,
    };
    const expected = 25.68 * 4.90348 * 94.47;
    close(marketValueInr(att, FX), expected, 0.01);
    const row = enrichHolding(att, FX);
    close(row.market, expected, 0.01);
    assert.equal(row.cost, 10000);
    close(row.gain, expected - 10000, 0.01);
    close(row.day, -0.51 * 4.90348 * 94.47, 0.01);
  });

  it("Nokia lots convert EUR price × shares × EURINR", () => {
    const lots = [
      { price: 8.656, shares: 36.43225, cost: 20010, currency: "EUR" },
      { price: 8.656, shares: 18.09105, cost: 0, currency: "EUR" },
      { price: 8.656, shares: 16.8, cost: 15884, currency: "EUR" },
    ];
    for (const lot of lots) {
      const expected = 8.656 * lot.shares * 109.85;
      close(marketValueInr(lot, FX), expected, 0.01);
    }
  });
});

describe("sleeve totals and unrealised %", () => {
  it("sums shares, invested, value, unrealised and %", () => {
    const rows = [
      enrichHolding({ price: 10, shares: 2, cost: 15, change: 0 }, {}),
      enrichHolding({ price: 20, shares: 1, cost: 25, change: 0 }, {}),
    ];
    const t = sleeveTotals(rows);
    assert.equal(t.shares, 3);
    assert.equal(t.cost, 40);
    assert.equal(t.market, 40);
    assert.equal(t.gain, 0);
    assert.equal(t.gainPct, 0);
  });

  it("portfolio realised is carried through and foreign is INR after FX", () => {
    const p = enrichPortfolio({
      fx: FX,
      realised: 1234.5,
      indian: [{ price: 100, shares: 1, cost: 90, change: 0 }],
      mf: [],
      foreign: [{ price: 25.68, shares: 4.90348, cost: 10000, currency: "USD", change: 0 }],
    });
    assert.equal(p.realised, 1234.5);
    close(p.i.market, 100, 0.01);
    close(p.f.market, 25.68 * 4.90348 * 94.47, 0.01);
    assert.ok(p.total.market > p.i.market);
  });
});

describe("buy / sell", () => {
  const base = { symbol: "RELIANCE.NS", shares: 10, avg: 100, cost: 1000, price: 100 };

  it("buy uses weighted-average cost", () => {
    const res = applyBuy(base, { qty: 10, price: 200, fx: {} });
    assert.equal(res.ok, true);
    assert.equal(res.holding.shares, 20);
    assert.equal(res.holding.avg, 150);
    assert.equal(res.holding.cost, 3000);
    assert.equal(res.trade.side, "buy");
    assert.equal(res.trade.realised, 0);
  });

  it("foreign buy converts price through FX into INR cost", () => {
    const att = { currency: "USD", shares: 0, avg: 0, cost: 0, price: 25 };
    const res = applyBuy(att, { qty: 4, price: 25, fx: FX });
    assert.equal(res.ok, true);
    close(res.holding.cost, 4 * 25 * 94.47, 0.01);
    assert.equal(res.holding.avg, 25);
    assert.equal(res.holding.shares, 4);
  });

  it("sell realises proceeds minus average cost and keeps remaining cost", () => {
    const res = applySell(base, { qty: 4, price: 150, fx: {} });
    assert.equal(res.ok, true);
    assert.equal(res.holding.shares, 6);
    close(res.holding.cost, 600, 0.01);
    assert.equal(res.holding.avg, 100);
    close(res.trade.proceedsInr, 600, 0.01);
    close(res.trade.realised, 200, 0.01);
  });

  it("rejects oversell and qty ≤ 0", () => {
    assert.equal(applySell(base, { qty: 11, price: 100, fx: {} }).ok, false);
    assert.match(applySell(base, { qty: 11, price: 100, fx: {} }).error, /more than you hold/);
    assert.equal(applySell(base, { qty: 0, price: 100, fx: {} }).ok, false);
    assert.equal(applySell(base, { qty: -1, price: 100, fx: {} }).ok, false);
    assert.equal(applyBuy(base, { qty: 0, price: 100, fx: {} }).ok, false);
    assert.equal(applyBuy(base, { qty: 1, price: NaN, fx: {} }).ok, false);
  });
});

describe("calculators", () => {
  it("SIP matches beginning-of-month compound annuity", () => {
    const r = 0.12 / 12;
    const n = 120;
    const expected = 10000 * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
    const sip = computeSip(10000, 12, 10);
    close(sip.hero, expected, 1);
    assert.equal(sip.invested, 1_200_000);
    assert.equal(sip.chartReturnsLabel, "Est. returns");
    assert.equal(sip.yearly.length, 10);
  });

  it("step-up SIP increases monthly amount once a year", () => {
    const plain = computeSip(10000, 12, 2);
    const stepped = computeStepup(10000, 12, 2, 10);
    assert.ok(stepped.invested > plain.invested);
    assert.ok(stepped.hero > plain.hero);
    close(stepped.invested, 10000 * 12 + 11000 * 12, 0.01);
  });

  it("lumpsum compounds annually", () => {
    const lump = computeLumpsum(100000, 12, 10);
    close(lump.hero, 100000 * Math.pow(1.12, 10), 0.5);
    assert.equal(lump.invested, 100000);
    assert.equal(lump.chartInvestedLabel, "Invested");
  });

  it("EMI uses reducing-balance formula and principal/interest labels", () => {
    const loan = 2_500_000;
    const rate = 8.5;
    const years = 20;
    const r = rate / 12 / 100;
    const n = years * 12;
    const expected = (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const emi = computeEmi(loan, rate, years);
    close(emi.hero, expected, 0.5);
    close(emi.principal, loan, 0.01);
    assert.equal(emi.months, 240);
    assert.equal(emi.chartInvestedLabel, "Principal repaid");
    assert.equal(emi.chartReturnsLabel, "Interest paid");
    const series = chartSeries(emi);
    assert.equal(series.investedLabel, "Principal repaid");
    assert.equal(series.returnsLabel, "Interest paid");
    assert.notEqual(series.returnsLabel, "Est. returns");
  });

  it("rejects 0 years, negative amount, NaN, and out-of-range rates", () => {
    assert.ok(validateCalcInputs("sip", { monthly: 0, rate: 12, years: 10 }).length);
    assert.ok(validateCalcInputs("sip", { monthly: -100, rate: 12, years: 10 }).length);
    assert.ok(validateCalcInputs("sip", { monthly: 1000, rate: 12, years: 0 }).length);
    assert.ok(validateCalcInputs("sip", { monthly: NaN, rate: 12, years: 10 }).length);
    assert.ok(validateCalcInputs("emi", { loan: 100000, loanRate: 0, tenure: 20 }).length);
    const bad = runCalculator("sip", { monthly: 0, rate: 12, years: 0 });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => /cannot be 0 or negative/i.test(e)));
    assert.ok(bad.errors.some((e) => /1 year/i.test(e)));
  });

  it("rejects more than 50 years and amounts above calculator caps", () => {
    const long = validateCalcInputs("sip", { monthly: 10000, rate: 12, years: 1000 });
    assert.ok(long.some((e) => /50 years/i.test(e)));
    const sipCap = validateCalcInputs("sip", { monthly: 200001, rate: 12, years: 10 });
    assert.ok(sipCap.some((e) => /2,00,000/.test(e)));
    const lumpCap = validateCalcInputs("lumpsum", { lump: 10000001, rate: 12, years: 10 });
    assert.ok(lumpCap.some((e) => /1,00,00,000/.test(e)));
    const emiCap = validateCalcInputs("emi", { loan: 20000001, loanRate: 8.5, tenure: 20 });
    assert.ok(emiCap.some((e) => /2,00,00,000/.test(e)));
    assert.equal(clampCalc("years", 1000), 50);
    assert.equal(clampCalc("monthly", 500000), 200000);
  });
});

describe("Indian rupee grouping", () => {
  it("formats lakhs and crores with en-IN separators", () => {
    assert.equal(formatInrGroup(200000), "2,00,000");
    assert.equal(formatInrGroup(10000000), "1,00,00,000");
    assert.equal(formatInrGroup(20000000), "2,00,00,000");
    assert.ok(formatInr(200000).includes("2,00,000"));
    assert.equal(parseInrInput("2,00,000"), 200000);
    assert.equal(parseInrInput("₹1,00,00,000"), 10000000);
  });
});

describe("spend stats", () => {
  it("splits this month and YTD from a fixed now", () => {
    const now = new Date("2026-09-08T12:00:00");
    const stats = spendStats(
      [
        { date: "2026-09-01", amount: 100, category: "Food", type: "Our Expense" },
        { date: "2026-08-01", amount: 50, category: "Travel", type: "My Expense" },
        { date: "2025-09-01", amount: 999, category: "Food", type: "Our Expense" },
      ],
      now
    );
    assert.equal(stats.monthTotal, 100);
    assert.equal(stats.yearTotal, 150);
    assert.equal(stats.byCat.Food, 100);
    assert.equal(stats.byMonth[7].total, 50);
    assert.equal(stats.byMonth[8].total, 100);
    const ours = spendStats(
      [
        { date: "2026-09-01", amount: 100, category: "Food", type: "Our Expense" },
        { date: "2026-09-01", amount: 40, category: "Food", type: "My Expense" },
      ],
      now,
      "Our Expense"
    );
    assert.equal(ours.monthTotal, 100);
    assert.equal(ours.byType["Our Expense"], 100);
    assert.equal(ours.byType["My Expense"], undefined);
  });
});

describe("expense filters and grouping", () => {
  const rows = [
    { date: "2026-09-08", amount: 200, type: "Home Expense", category: "Medicine", account: "UPI", notes: "Train ticket" },
    { date: "2026-09-07", amount: 50, type: "My Expense", category: "Food", account: "Cash", notes: "Lunch" },
    { date: "2026-08-01", amount: 80, type: "Home Expense", category: "Medicine", account: "UPI", notes: "pharmacy" },
  ];
  it("greps notes case-insensitively and can limit by month/type", () => {
    const found = filterExpenses(rows, { notes: "train ticket" });
    assert.equal(found.length, 1);
    assert.equal(found[0].amount, 200);
    const month = filterExpenses(rows, { month: "2026-09", type: "Home Expense" });
    assert.equal(sumAmounts(month), 200);
  });
  it("builds category and type pies from independent filters", () => {
    const cat = groupSpend(filterExpenses(rows, { month: "2026-09", type: "Home Expense" }), "category");
    assert.equal(cat.Medicine, 200);
    assert.equal(cat.Food, undefined);
    const types = groupSpend(filterExpenses(rows, { month: "2026-09", category: "Food" }), "type");
    assert.equal(types["My Expense"], 50);
    assert.equal(types["Home Expense"], undefined);
  });
  it("yearly bars follow the selected year", () => {
    const y2026 = yearlyByMonth(rows, "2026");
    assert.equal(y2026[7].total, 80);
    assert.equal(y2026[8].total, 250);
  });
});

describe("holding sort", () => {
  const rows = [
    { name: "A", market: 100, gain: 10, gainPct: 0.1, cost: 90 },
    { name: "B", market: 50, gain: 40, gainPct: 0.8, cost: 10 },
  ];
  it("sorts profit high to low and current low to high", () => {
    assert.equal(sortHoldings(rows, "gain-desc")[0].name, "B");
    assert.equal(sortHoldings(rows, "market-asc")[0].name, "B");
    assert.equal(sortHoldings(rows, "gainPct-desc")[0].name, "B");
    assert.equal(sortHoldings(rows, "cost-desc")[0].name, "A");
  });
  it("defaults to alphabetical name order", () => {
    const mixed = [{ name: "Reliance" }, { name: "HDFC Bank" }, { name: "Adani Ports" }];
    assert.deepEqual(sortHoldings(mixed).map((r) => r.name), ["Adani Ports", "HDFC Bank", "Reliance"]);
    assert.equal(sortHoldings(mixed, "name-desc")[0].name, "Reliance");
  });
});

describe("XIRR", () => {
  it("matches the Excel sample cash flows", () => {
    const res = xirr([
      { date: "2008-01-01", amount: -10000 },
      { date: "2008-03-01", amount: 2750 },
      { date: "2008-10-30", amount: 4250 },
      { date: "2009-02-15", amount: 3250 },
      { date: "2009-04-01", amount: 2750 },
    ]);
    assert.equal(res.ok, true);
    close(res.rate, 0.373362535, 1e-5);
  });
  it("rejects cash flows that cannot produce a rate", () => {
    assert.equal(xirr([{ date: "2026-01-01", amount: -100 }]).ok, false);
    assert.equal(xirr([
      { date: "2026-01-01", amount: -100 },
      { date: "2026-01-01", amount: 120 },
    ]).ok, false);
  });
});
