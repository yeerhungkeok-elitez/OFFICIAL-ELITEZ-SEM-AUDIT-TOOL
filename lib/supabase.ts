import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Defer the env-var error to first use rather than module load so that
// `next build` succeeds without credentials (CI / no .env.local).
// At runtime the env vars are always present, so the Proxy is never hit.
export const supabase: SupabaseClient = url && key
  ? createClient(url, key)
  : new Proxy({} as SupabaseClient, {
      get() {
        throw new Error(
          "Missing Supabase environment variables. " +
          "Copy .env.local.example to .env.local and fill in your project credentials.",
        );
      },
    });
