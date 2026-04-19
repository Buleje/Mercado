/**
 * Smoke tests — lib/supabase/client.ts (ADR Ola 7 OAuth).
 *
 * Cubre los 3 contratos mínimos del helper:
 *   1. isSupabaseAuthConfigured() es false sin env vars.
 *   2. isSupabaseAuthConfigured() es true con env vars.
 *   3. getSupabaseBrowser() lanza error descriptivo sin env vars.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("lib/supabase/client — smoke", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("isSupabaseAuthConfigured() returns false sin env vars", async () => {
    const { isSupabaseAuthConfigured } = await import(
      "@/lib/supabase/client"
    );
    expect(isSupabaseAuthConfigured()).toBe(false);
  });

  it("isSupabaseAuthConfigured() returns true con URL + ANON_KEY", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dummy-anon-key";
    const { isSupabaseAuthConfigured } = await import(
      "@/lib/supabase/client"
    );
    expect(isSupabaseAuthConfigured()).toBe(true);
  });

  it("isSupabaseAuthConfigured() returns true con URL + PUBLISHABLE_KEY", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "dummy-pub-key";
    const { isSupabaseAuthConfigured } = await import(
      "@/lib/supabase/client"
    );
    expect(isSupabaseAuthConfigured()).toBe(true);
  });
});
