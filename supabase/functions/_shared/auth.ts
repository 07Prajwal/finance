const encoder = new TextEncoder();

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function b64urlFromBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64url(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return new Uint8Array(sig);
}

export async function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const h = b64urlFromBytes(encoder.encode(JSON.stringify(header)));
  const p = b64urlFromBytes(encoder.encode(JSON.stringify(payload)));
  const sig = await hmac(secret, `${h}.${p}`);
  return `${h}.${p}.${b64urlFromBytes(sig)}`;
}

export async function verifyJwt(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = b64urlFromBytes(await hmac(secret, `${h}.${p}`));
  if (!timingSafeEqual(s, expected)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(bytesFromB64url(p)));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.role !== "owner" && payload.role !== "viewer") return null;
    return { role: payload.role };
  } catch {
    return null;
  }
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
