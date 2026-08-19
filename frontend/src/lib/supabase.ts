import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly and early rather than letting every auth call throw a
  // confusing network error later.
  console.warn(
    "Supabase env vars are missing - copy frontend/.env.example to frontend/.env and fill them in."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
