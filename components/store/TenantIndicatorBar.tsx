"use client";

import { Store } from "@buleje/design-system/icons";
import { useTenantSlug } from "@/contexts/tenant-context";
import { useSettings } from "@/contexts/settings-context";

/**
 * Compact bar shown at the very top of the store when the user is browsing
 * a specific tenant (not "main"). Helps avoid confusion in multi-tenant QA
 * and lets customers know whose store they're visiting.
 */
export default function TenantIndicatorBar() {
  const slug = useTenantSlug();
  const { businessName } = useSettings();

  // Don't show for main tenant (it's the default)
  if (slug === "main") return null;

  const name = businessName || slug;

  return (
    <div className="flex items-center justify-center gap-2 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary dark:bg-primary/20 dark:text-primary-light">
      <Store className="h-3.5 w-3.5 shrink-0" />
      <span>Estás comprando en <strong>{name}</strong></span>
    </div>
  );
}
