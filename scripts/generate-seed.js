import { writeFileSync } from "node:fs";
import { SEED_EXPENSES, SEED_PORTFOLIO } from "../js/seed.js";

function sqlStr(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlNum(v) {
  return Number(v);
}

const lines = ["-- Generated from js/seed.js. Run after schema.sql.", ""];

lines.push("insert into settings (key, value) values");
lines.push(`  ('fx', '${JSON.stringify(SEED_PORTFOLIO.fx)}'::jsonb)`);
lines.push("on conflict (key) do update set value = excluded.value;");
lines.push("");

lines.push("insert into expenses (id, date, time, amount, type, category, account, notes) values");
lines.push(
  SEED_EXPENSES.map((e) =>
    `  (${sqlStr(e.id)}, ${sqlStr(e.date)}, ${sqlStr(e.time)}, ${sqlNum(e.amount)}, ${sqlStr(e.type)}, ${sqlStr(e.category)}, ${sqlStr(e.account)}, ${sqlStr(e.notes)})`
  ).join(",\n")
);
lines.push("on conflict (id) do nothing;");
lines.push("");

const all = [
  ...SEED_PORTFOLIO.indian.map((h) => ({ ...h, sleeve: "indian" })),
  ...SEED_PORTFOLIO.mf.map((h) => ({ ...h, sleeve: "mf" })),
  ...SEED_PORTFOLIO.foreign.map((h) => ({ ...h, sleeve: "foreign" })),
];
lines.push("insert into holdings (id, sleeve, symbol, name, price, change, change_pct, shares, avg, cost, currency, platform) values");
lines.push(
  all.map((h) =>
    `  (${sqlStr(h.id)}, ${sqlStr(h.sleeve)}, ${sqlStr(h.symbol)}, ${sqlStr(h.name)}, ${sqlNum(h.price)}, ${sqlNum(h.change)}, ${sqlNum(h.changePct)}, ${sqlNum(h.shares)}, ${sqlNum(h.avg)}, ${sqlNum(h.cost)}, ${sqlStr(h.currency)}, ${sqlStr(h.platform)})`
  ).join(",\n")
);
lines.push("on conflict (id) do nothing;");
lines.push("");

writeFileSync(new URL("../supabase/seed.sql", import.meta.url), lines.join("\n"));
console.log(`Wrote seed.sql (${SEED_EXPENSES.length} expenses, ${all.length} holdings)`);
