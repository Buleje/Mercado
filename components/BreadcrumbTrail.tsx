"use client";

/**
 * BreadcrumbTrail — parte VISIBLE del breadcrumb (la JSON-LD vive en
 * BreadcrumbSchema, server). Aplica `useTenantPath` a cada href para que en la
 * tienda individual (`/t/<slug>/…`) las migas NO saquen al cliente al
 * marketplace `/`. En el marketplace/root es no-op (devuelve el path tal cual).
 */

import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";
import { useTenantPath } from "@/hooks/use-tenant-path";

export interface BreadcrumbTrailItem {
  name: string;
  /** Path relativo (ej. "/", "/cuenta"). Se prefija con /t/<slug> si aplica. */
  href: string;
}

export default function BreadcrumbTrail({ items }: { items: BreadcrumbTrailItem[] }) {
  const tenantPath = useTenantPath();
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <ol className="flex items-center gap-1 text-sm text-muted flex-wrap">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted/50 shrink-0" />}
              {isLast ? (
                <span className="font-medium text-[var(--text-primary)] truncate max-w-48">{item.name}</span>
              ) : (
                <Link href={tenantPath(item.href)} className="hover:text-primary transition-colors truncate max-w-36">
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
