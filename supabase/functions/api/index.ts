import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { applyBuy, applySell, newHoldingFromBuy } from "../_shared/finance.js";
import { corsHeaders, json, verifyJwt } from "../_shared/auth.ts";

function service() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("Server is not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
      fetch: (input, init = {}) => {
        const headers = new Headers(init.headers || {});
        headers.set("Authorization", `Bearer ${key}`);
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function financeToken(req) {
  const custom = (req.headers.get("x-finance-token") || "").trim();
  if (custom) return custom;
  return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

function asHolding(row) {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    price: Number(row.price),
    change: Number(row.change),
    changePct: Number(row.change_pct),
    shares: Number(row.shares),
    avg: Number(row.avg),
    cost: Number(row.cost),
    currency: row.currency || undefined,
    platform: row.platform || "",
  };
}

function requireTradeDate(body) {
  const d = String(body?.date || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d;
}

async function listAll(client) {
  const [exp, hold, fxRow, trades] = await Promise.all([
    client.from("expenses").select("*").order("date", { ascending: false }),
    client.from("holdings").select("*"),
    client.from("settings").select("value").eq("key", "fx").maybeSingle(),
    client.from("trades").select("id, holding_id, side, qty, price, date, cost_inr, proceeds_inr, realised"),
  ]);
  for (const r of [exp, hold, fxRow, trades]) {
    if (r.error) throw r.error;
  }
  const fx = fxRow.data?.value || { USDINR: 0, EURINR: 0 };
  const realised = (trades.data || [])
    .filter((t) => t.side === "sell")
    .reduce((s, t) => s + Number(t.realised || 0), 0);
  const indian = [];
  const mf = [];
  const foreign = [];
  for (const row of hold.data || []) {
    const h = asHolding(row);
    if (row.sleeve === "mf") mf.push(h);
    else if (row.sleeve === "foreign") foreign.push(h);
    else indian.push(h);
  }
  return { expenses: exp.data || [], portfolio: { fx, realised, indian, mf, foreign, trades: trades.data || [] } };
}

async function fxOf(client) {
  const { data } = await client.from("settings").select("value").eq("key", "fx").maybeSingle();
  return data?.value || { USDINR: 0, EURINR: 0 };
}

const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function quoteFromMeta(symbol, meta) {
  const price = Number(meta?.regularMarketPrice);
  if (!(price > 0)) return null;
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPreviousClose);
  const change = Number.isFinite(prev) && prev > 0 ? price - prev : 0;
  const changePct = prev > 0 ? change / prev : 0;
  return {
    price,
    change,
    changePct,
    name: meta.shortName || meta.longName || symbol,
  };
}

async function yahooChart(symbol) {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  for (const host of hosts) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
    });
    if (!res.ok) continue;
    const data = await res.json();
    const q = quoteFromMeta(symbol, data.chart?.result?.[0]?.meta);
    if (q) return q;
  }
  return null;
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function fetchFrankfurterFx() {
  const fx = {};
  for (const [pair, from] of [["USDINR=X", "USD"], ["EURINR=X", "EUR"]]) {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=INR`);
    if (!res.ok) continue;
    const data = await res.json();
    const price = Number(data?.rates?.INR);
    if (price > 0) fx[pair] = { price, change: 0, changePct: 0, name: `${from}/INR` };
  }
  return fx;
}

async function fetchYahooQuotes(symbols) {
  const unique = [...new Set((symbols || []).map((s) => String(s).trim()).filter(Boolean))];
  const out = {};
  const rows = await mapPool(unique, 8, async (sym) => {
    try {
      return [sym, await yahooChart(sym)];
    } catch {
      return [sym, null];
    }
  });
  for (const [sym, q] of rows) {
    if (q) out[sym] = q;
  }
  if (!out["USDINR=X"] || !out["EURINR=X"]) {
    try {
      const fx = await fetchFrankfurterFx();
      for (const [k, v] of Object.entries(fx)) {
        if (!out[k]) out[k] = v;
      }
    } catch {
      /* FX backup is optional */
    }
  }
  if (!Object.keys(out).length) throw new Error("Live prices are unavailable right now");
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const claims = await verifyJwt(financeToken(req), Deno.env.get("JWT_SECRET") || "");
  if (!claims) return json({ error: "Please sign in again" }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const op = body.op;
  const client = service();

  try {
    if (op === "listAll") return json(await listAll(client));
    if (op === "fetchQuotes") {
      const quotes = await fetchYahooQuotes(body.symbols || []);
      return json({ quotes });
    }
    if (claims.role !== "owner") {
      return json({ error: "View only — owner password required to change data" }, 403);
    }

    if (op === "addExpense") {
      const e = body.expense;
      if (!e?.id || !e.date || !(Number(e.amount) > 0)) return json({ error: "Invalid expense" }, 400);
      const { error } = await client.from("expenses").insert({
        id: e.id,
        date: e.date,
        time: e.time || "",
        amount: e.amount,
        type: e.type,
        category: e.category,
        account: e.account,
        notes: e.notes || "",
      });
      if (error) throw error;
      return json(await listAll(client));
    }

    if (op === "deleteExpense") {
      if (!body.id) return json({ error: "Missing id" }, 400);
      const { error } = await client.from("expenses").delete().eq("id", body.id);
      if (error) throw error;
      return json(await listAll(client));
    }

    if (op === "buy" || op === "sell") {
      const date = requireTradeDate(body);
      if (!date) return json({ error: "Pick the buy/sell date" }, 400);
      const { data: row, error } = await client.from("holdings").select("*").eq("id", body.holdingId).maybeSingle();
      if (error) throw error;
      if (!row) return json({ error: "Holding not found" }, 404);
      const fx = await fxOf(client);
      const fn = op === "buy" ? applyBuy : applySell;
      const res = fn(asHolding(row), { qty: Number(body.qty), price: Number(body.price), fx });
      if (!res.ok) return json({ error: res.error }, 400);
      const { error: uerr } = await client.from("holdings").update({
        shares: res.holding.shares,
        avg: res.holding.avg,
        cost: res.holding.cost,
        price: res.holding.price,
      }).eq("id", row.id);
      if (uerr) throw uerr;
      const { error: terr } = await client.from("trades").insert({
        id: crypto.randomUUID(),
        holding_id: row.id,
        side: op,
        qty: Number(body.qty),
        price: Number(body.price),
        date,
        cost_inr: res.trade.costInr,
        proceeds_inr: res.trade.proceedsInr,
        realised: res.trade.realised,
      });
      if (terr) throw terr;
      return json(await listAll(client));
    }

    if (op === "newBuy") {
      const sleeve = body.sleeve;
      if (!["indian", "mf", "foreign"].includes(sleeve)) return json({ error: "Invalid sleeve" }, 400);
      if (!body.symbol) return json({ error: "Symbol is required" }, 400);
      const date = requireTradeDate(body);
      if (!date) return json({ error: "Pick the buy date" }, 400);
      const fx = await fxOf(client);
      const created = newHoldingFromBuy({
        id: crypto.randomUUID(),
        sleeve,
        symbol: String(body.symbol).trim(),
        name: String(body.name || body.symbol).trim(),
        qty: Number(body.qty),
        price: Number(body.price),
        currency: body.currency || undefined,
        platform: body.platform || "",
        fx,
      });
      if (!created.ok) return json({ error: created.error }, 400);
      const h = created.holding;
      const { error } = await client.from("holdings").insert({
        id: h.id,
        sleeve,
        symbol: h.symbol,
        name: h.name,
        price: h.price,
        change: 0,
        change_pct: 0,
        shares: h.shares,
        avg: h.avg,
        cost: h.cost,
        currency: h.currency || null,
        platform: h.platform || "",
      });
      if (error) throw error;
      await client.from("trades").insert({
        id: crypto.randomUUID(),
        holding_id: h.id,
        side: "buy",
        qty: Number(body.qty),
        price: Number(body.price),
        date,
        cost_inr: created.trade.costInr,
        proceeds_inr: 0,
        realised: 0,
      });
      return json(await listAll(client));
    }

    if (op === "snapshotQuotes") {
      const listed = await listAll(client);
      const symbols = [
        ...listed.portfolio.indian.map((h) => h.symbol),
        ...listed.portfolio.mf.map((h) => h.symbol),
        ...listed.portfolio.foreign.map((h) => h.symbol),
        "USDINR=X",
        "EURINR=X",
      ];
      const quotes = await fetchYahooQuotes(symbols);
      const { error } = await client.from("price_snapshots").insert({
        id: crypto.randomUUID(),
        payload: { quotes, fx: listed.portfolio.fx },
      });
      if (error) throw error;
      return json({ ok: true, count: Object.keys(quotes).length });
    }

    if (op === "updateQuotes") {
      const updates = body.holdings || [];
      await Promise.all(updates.map((h) =>
        client.from("holdings").update({
          price: h.price,
          change: h.change,
          change_pct: h.changePct,
          name: h.name,
        }).eq("id", h.id)
      ));
      if (body.fx) {
        const { error } = await client.from("settings").upsert({ key: "fx", value: body.fx });
        if (error) throw error;
      }
      return json(await listAll(client));
    }

    return json({ error: "Unknown operation" }, 400);
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
});
