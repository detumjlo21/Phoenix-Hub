import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export async function ensureAnonymousSession(){
  const { data: existing } = await supabase.auth.getSession();
  if(existing.session) return existing.session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if(error) throw error;
  return data.session;
}
