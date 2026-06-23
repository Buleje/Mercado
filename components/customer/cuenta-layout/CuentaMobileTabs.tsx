"use client";

/**
 * CuentaMobileTabs — barra horizontal con scroll de tabs para /cuenta/*.
 *
 * Se muestra en breakpoints menores a lg. Permite saltar entre secciones sin
 * usar el sidebar desktop. Highlighteada la ruta activa.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTenantPath } from "@/hooks/use-tenant-path";
import {
  CUENTA_NAV_ITEMS,
  findActiveNavItem,
} from "./cuenta-nav.config";

export interface CuentaMobileTabsProps {
  className?: string;
}

export function CuentaMobileTabs({ className }: CuentaMobileTabsProps) {
  const pathname = usePathname() ?? "/cuenta";
  const active = findActiveNavItem(pathname);
  const tenantPath = useTenantPath();

  return (
    <div
      className={cn(
        "lg:hidden -mx-4 sm:-mx-6 overflow-x-auto scrollbar-none",
        "border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]",
        className,
      )}
    >
      <nav
        aria-label="Secciones de cuenta"
        className="flex items-center gap-1 px-4 sm:px-6 py-2 min-w-max"
      >
        {CUENTA_NAV_ITEMS.filter((item) => !item.hiddenInSidebar).map((item) => {
          const Icon = item.icon;
          const isActive = active?.id === item.id;
          return (
            <Link
              key={item.id}
              href={tenantPath(item.href)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 whitespace-nowrap",
                "text-[length:var(--ts-xs)] font-medium transition-colors",
                isActive
                  ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default CuentaMobileTabs;
