import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
config({ quiet: true });
export const settings = {
  production: process.env.NODE_ENV === "production",
  mode: (process.env.AUTH_MODE ||
    (process.env.SUPABASE_URL ? "supabase" : "local")) as "local" | "supabase",
  dataMode:
    process.env.DATA_MODE || (process.env.SUPABASE_URL ? "supabase" : "file"),
  url: process.env.SUPABASE_URL || "",
  key: process.env.SUPABASE_ANON_KEY || "",
  bucket: process.env.SUPABASE_STORAGE_BUCKET || "garments",
  dataDirectory: resolve(
    process.env.DATA_DIRECTORY || resolve(process.cwd(), "../../.data"),
  ),
  host: process.env.API_HOST || "127.0.0.1",
  port: Number(process.env.API_PORT || 4000),
  origin: process.env.WEB_ORIGIN || "http://127.0.0.1:3000",
};
if (!["local", "supabase"].includes(settings.mode))
  throw new Error("Invalid AUTH_MODE");
if (
  settings.production &&
  (settings.mode !== "supabase" || settings.dataMode === "file")
)
  throw new Error(
    "Production requires Supabase authentication and persistent cloud storage.",
  );
if (settings.mode === "supabase" && (!settings.url || !settings.key))
  throw new Error("Supabase URL and publishable key are required.");

if (!["file", "supabase"].includes(settings.dataMode))
  throw new Error("Invalid DATA_MODE");
if ((settings.mode === "local") !== (settings.dataMode === "file"))
  throw new Error("Authentication and storage modes must match.");
