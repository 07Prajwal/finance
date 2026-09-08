import { corsHeaders, json, sha256Hex, signJwt, timingSafeEqual } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { password } = await req.json();
    if (!password || typeof password !== "string") return json({ error: "Password required" }, 400);
    const hash = await sha256Hex(password);
    const owner = (Deno.env.get("OWNER_PASSWORD_HASH") || "").trim().toLowerCase();
    const viewer = (Deno.env.get("VIEWER_PASSWORD_HASH") || "").trim().toLowerCase();
    const secret = Deno.env.get("JWT_SECRET") || "";
    if (!owner || !viewer || !secret) return json({ error: "Server is not configured" }, 500);
    let role = null;
    if (timingSafeEqual(hash, owner)) role = "owner";
    else if (timingSafeEqual(hash, viewer)) role = "viewer";
    if (!role) return json({ error: "Wrong password" }, 401);
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt({ role, iat: now, exp: now + 7 * 24 * 3600 }, secret);
    return json({ token, role });
  } catch {
    return json({ error: "Could not sign in" }, 400);
  }
});
