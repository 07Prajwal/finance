/**
 * Public client config only. Never put the service-role key or password hashes here.
 *
 * After you create a Supabase project, paste the project URL and the anon (public) key.
 * Password hashes live in Supabase Edge Function secrets.
 */
export const config = {
  supabaseUrl: "https://capyboshlcdhpzxurajn.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhcHlib3NobGNkaHB6eHVyYWpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTI3ODAsImV4cCI6MjEwNDQyODc4MH0.nTmVl61N47eXdU4njQUF958JM86FdjYmOpjle4D9R-o",
  /** Used only when Supabase is not configured. Ignored after the URL and anon key are set. */
  localOwnerPassword: "owner",
  localViewerPassword: "viewer",
};

export function isRemoteConfigured() {
  const url = (config.supabaseUrl || "").trim();
  const key = (config.supabaseAnonKey || "").trim();
  if (!url || !key) return false;
  if (url.includes("YOUR_") || key.includes("YOUR_")) return false;
  return true;
}

export function allowLocalMode() {
  if (typeof location === "undefined") return false;
  if (isRemoteConfigured()) return false;
  return true;
}
