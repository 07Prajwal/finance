import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, json, sha256Hex, timingSafeEqual } from "../_shared/auth.ts";

const TYPES = ["Our Expense", "Home Expense", "My Expense"];
const CATS = ["Food", "Quick Delivery", "Travel", "Shopping", "Medicine", "Other"];
const ACCOUNTS = ["UPI", "Cash", "Card"];

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

function kolkataNow() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return { date, time };
}

function parseAmount(v) {
  const n = Number(String(v ?? "").replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function pick(value, allowed) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return "";
  const hit = allowed.find((a) => a.toLowerCase() === s);
  if (hit) return hit;
  const aliases = {
    our: "Our Expense",
    home: "Home Expense",
    my: "My Expense",
    food: "Food",
    delivery: "Quick Delivery",
    "quick delivery": "Quick Delivery",
    travel: "Travel",
    shopping: "Shopping",
    medicine: "Medicine",
    other: "Other",
    upi: "UPI",
    gpay: "UPI",
    cash: "Cash",
    card: "Card",
  };
  const alias = aliases[s];
  return allowed.includes(alias) ? alias : "";
}

function parseBody(raw, contentType) {
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
  }
  return JSON.parse(raw || "{}");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const contentType = req.headers.get("content-type") || "";
    const raw = await req.text();
    let body;
    try {
      body = parseBody(raw, contentType);
    } catch {
      return json({ error: "Invalid body" }, 400);
    }

    const password = String(body.password || req.headers.get("x-finance-password") || "");
    if (!password) return json({ error: "Password required" }, 400);

    const owner = (Deno.env.get("OWNER_PASSWORD_HASH") || "").trim().toLowerCase();
    if (!owner) return json({ error: "Server is not configured" }, 500);
    const hash = await sha256Hex(password);
    if (!timingSafeEqual(hash, owner)) return json({ error: "Wrong password" }, 401);

    const amount = parseAmount(body.amount);
    if (!(amount > 0)) return json({ error: "Amount must be greater than 0" }, 400);

    const type = pick(body.type, TYPES);
    const category = pick(body.category, CATS);
    const account = pick(body.account, ACCOUNTS) || "UPI";
    if (!type) return json({ error: `Type must be one of: ${TYPES.join(", ")}` }, 400);
    if (!category) return json({ error: `Category must be one of: ${CATS.join(", ")}` }, 400);

    const now = kolkataNow();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? String(body.date).slice(0, 10) : now.date;
    const time = String(body.time || now.time).slice(0, 8);
    const notes = String(body.notes || "").trim();
    const id = `e-${crypto.randomUUID()}`;

    const client = service();
    const { error } = await client.from("expenses").insert({
      id,
      date,
      time,
      amount,
      type,
      category,
      account,
      notes,
    });
    if (error) throw error;

    return json({ ok: true, id, date, time, amount, type, category, account, notes });
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
});
