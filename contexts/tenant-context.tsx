"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getActiveTenantSlug, tenantFetch } from "@/lib/tenant-fetch";

// ─── Types ──────────────────────────────────────────────────
interface TenantContextValue {
  tenantSlug: string;
  tenantId: string | null;
  isLoading: boolean;
}

const DEFAULT_SLUG = "main";

const TenantCtx = createContext<TenantContextValue>({
  tenantSlug: DEFAULT_SLUG,
  tenantId: null,
  isLoading: true,
});

// ─── BroadcastChannel message type ──────────────────────────
interface TenantBroadcast {
  type: "tenant-resolved";
  slug: string;
  tenantId: string;
}

// ─── Provider ───────────────────────────────────────────────

export function TenantSlugProvider({
  slug: initialSlug,
  children,
}: {
  slug?: string;
  children: ReactNode;
}) {
  // Derive slug directly from prop — avoids setState-in-effect for this value
  const resolvedSlug = initialSlug ?? DEFAULT_SLUG;
  const [tenantSlug, setTenantSlug] = useState<string>(resolvedSlug);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Keep tenantSlug in sync when initialSlug prop changes (derived state pattern)
  if (tenantSlug !== resolvedSlug) {
    setTenantSlug(resolvedSlug);
  }

  useEffect(() => {
    // Reuse the canonical slug resolver from tenant-fetch.ts
    const slug = initialSlug ?? getActiveTenantSlug();

    let channel: BroadcastChannel | null = null;

    // Set up BroadcastChannel scoped to this tenant
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(`buleje-tenant-${slug}`);
      channel.onmessage = (event: MessageEvent<TenantBroadcast>) => {
        if (event.data?.type === "tenant-resolved" && event.data.slug === slug) {
          setTenantId(event.data.tenantId);
          setIsLoading(false);
        }
      };
    }

    // Fetch tenant info (tenantFetch auto-injects x-tenant-id header)
    tenantFetch(`/api/tenants/resolve?slug=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.id) {
          setTenantId(data.id);
          // Broadcast to other tabs of the same tenant
          channel?.postMessage({
            type: "tenant-resolved",
            slug,
            tenantId: data.id,
          } satisfies TenantBroadcast);
        }
      })
      .catch(() => {
        // Silently fail — tenantId stays null
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => {
      channel?.close();
    };
  }, [initialSlug]);

  return (
    <TenantCtx.Provider value={{ tenantSlug, tenantId, isLoading }}>
      {children}
    </TenantCtx.Provider>
  );
}

// ─── Hooks ──────────────────────────────────────────────────

export function useTenantSlug(): string {
  return useContext(TenantCtx).tenantSlug;
}

export function useTenant(): TenantContextValue {
  return useContext(TenantCtx);
}

// ─── Utility ────────────────────────────────────────────────

/** Build a tenant-scoped localStorage key: buleje-{slug}-{key} */
export function tenantKey(slug: string, key: string): string {
  return slug ? `buleje-${slug}-${key}` : `buleje-${key}`;
}
