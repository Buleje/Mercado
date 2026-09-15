import { Suspense } from "react";
import { AdminProviders } from "./providers";
import { SkipLink } from "@/components/ui-system/SkipLink";
import DesignTokensProvider from "@/components/admin/DesignTokensProvider";
import { TenantSlugProvider } from "@/contexts/tenant-context";
import { cookies } from "next/headers";
import TenantCacheGuard from "./TenantCacheGuard";
import "./print.css";


export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // El read de cookies (slug del tenant) se aísla en <AdminTenantTree> dentro
  // de un <Suspense> para que el shell de /admin sea estático/prerenderizable
  // y NO dispare el aviso dev de Next 16 cacheComponents ("rendering with
  // server caches disabled"). Mismo patrón que el root layout (DynamicHeadContent).
  // El árbol de providers + children renderiza igual que antes (después de
  // resolver cookies); sin fallback con slug distinto → cero flash de tenant.
  return (
    <>
      {/* Guard anti-fuga cross-tenant. Va PRIMERO en el árbol: React renderiza
          en orden, así que limpia el cache del tenant anterior antes de que
          cualquier hijo lo lea — también en navegaciones de cliente, que es lo
          que el `<script>` que vivía acá no cubría. */}
      <TenantCacheGuard />
      <Suspense fallback={null}>
        <AdminTenantTree>{children}</AdminTenantTree>
      </Suspense>
    </>
  );
}

/**
 * Aísla el read dinámico de la cookie del tenant. Al estar dentro de <Suspense>,
 * Next 16 lo trata como "agujero dinámico" y deja prerenderizable el resto del
 * shell de /admin. Lee `active-tenant-slug` (set por proxy.ts y /t/[slug]);
 * DesignTokensProvider lo usa para resolver el override custom o caer al preset.
 */
async function AdminTenantTree({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const tenantSlug = cookieStore.get("active-tenant-slug")?.value ?? null;
  // AdminProviders contiene su propio Suspense boundary interno alrededor
  // de useSearchParams (ver providers.tsx). Requerido por Next 16 para no
  // marcar /admin como blocking-route.
  return (
    <AdminProviders>
      {/* TenantSlugProvider: sin esto, useTenant() en el admin caía al default
          industry:"bodega" → TODO admin (pizzería, farmacia, etc.) mostraba
          "Bodega/Minimarket". Resuelve el vertical real por slug. */}
      <TenantSlugProvider slug={tenantSlug ?? undefined}>
        {/* Skip-link WCAG 2.4.1 — apunta al <main id="main-content"> en AdminMainContent. */}
        <SkipLink />
        <DesignTokensProvider tenantId={tenantSlug}>
          {children}
        </DesignTokensProvider>
      </TenantSlugProvider>
    </AdminProviders>
  );
}
