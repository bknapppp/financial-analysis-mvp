import { createClient } from "@supabase/supabase-js";

function getEnvironmentVariable(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseServerClient() {
  const url = getEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY");

  // Server-only code uses the service role to keep the client footprint minimal.
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
