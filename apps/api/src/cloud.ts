import { createClient } from "@supabase/supabase-js";
import { settings } from "./config";
export function cloud(token?: string) {
  return createClient(settings.url, settings.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined,
  });
}
