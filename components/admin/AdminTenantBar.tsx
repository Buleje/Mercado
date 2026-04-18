/**
 * components/admin/AdminTenantBar.tsx
 *
 * Server Component puro — presentacional sin hooks, estado ni handlers. Se
 * renderiza como parte del shell del panel admin y no envía JS al cliente.
 *
 * Barra superior fina que vincula el panel admin con la tienda individual del
 * tenant que se está administrando. Resuelve la petición:
 *
 *   "El panel admin del negocio debe venir junto a la tienda individual,
 *    es decir, el panel admin se vincula con la tienda individual de cada
 *    negocio y su inicio."
 *
 * Muestra:
 *   - Nombre del tenant activo (resuelto vía /api/tenants/resolve)
 *   - Botón "Inicio del negocio" → /t/{slug}
 *   - Botón "Ver mi tienda"     → /t/{slug}/tienda
 *
 * Se renderiza arriba de AdminTopHeader. Si no hay slug resuelto (caso raro),
 * la barra no se renderiza para evitar mostrar links rotos.
 */

import { ExternalLink, Home, Store as StoreIcon } from "@buleje/design-system/icons";
import Link from "next/link";

interface AdminTenantBarProps {
  /** Slug del tenant que se está administrando (ej. "main", "luis"). */
  tenantSlug: string | null;
  /** Nombre legible del tenant (ej. "Buleje"). Cae en `tenantSlug` si falta. */
  tenantName?: string | null;
}

export function AdminTenantBar({ tenantSlug, tenantName }: AdminTenantBarProps) {
  if (!tenantSlug) return null;

  const displayName = tenantName?.trim() || tenantSlug;
  const homePath = `/t/${tenantSlug}`;
  const storePath = `/t/${tenantSlug}/tienda`;

  return (
    <div
      className="bg-primary/5 dark:bg-primary/10 border-b border-primary/20 dark:border-primary/30 px-4 sm:px-6 py-1 flex items-center justify-between gap-3 text-xs"
      role="banner"
      aria-label="Barra de tenant activo"
    >
      <div className="flex items-center gap-2 min-w-0">
        <StoreIcon className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
        <span className="text-muted-foreground hidden sm:inline">Administrando:</span>
        <span className="font-semibold text-primary truncate">{displayName}</span>
        <span className="text-xs text-muted-foreground hidden md:inline">({tenantSlug})</span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Link
          href={homePath}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          title="Abrir el inicio del negocio en una nueva pestaña"
        >
          <Home className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Inicio</span>
        </Link>
        <Link
          href={storePath}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-colors"
          title="Abrir la tienda del negocio en una nueva pestaña"
        >
          <span className="hidden sm:inline">Ver mi tienda</span>
          <span className="sm:hidden">Tienda</span>
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
