import { AdminProviders } from "./providers";
import { SkipLink } from "@/components/ui-system/SkipLink";
import "./print.css";

/**
 * [SEGURIDAD MULTI-TENANT] Script blocking que se ejecuta ANTES de hidratar
 * React. Compara el `active-tenant-slug` actual con el "owner" del cache
 * almacenado en localStorage; si difieren, borra TODO el cache cliente
 * scoped al tenant para que el primer render no muestre data del tenant
 * anterior. Crítico para el flujo de impersonación del superadmin.
 *
 * Por qué inline y no useEffect: useEffect corre DESPUÉS del primer render.
 * Los hijos podrían leer localStorage stale antes del guard. Este script
 * corre antes de cualquier React, garantizando aislamiento.
 *
 * Mantener este código en sincronía con `lib/tenant-cache.ts`. La lista
 * de prefijos cacheados debe coincidir.
 */
const TENANT_CACHE_GUARD_SCRIPT = `
(function() {
  try {
    var match = document.cookie.match(/(?:^|;\\s*)active-tenant-slug=([^;]+)/);
    var slug = match ? decodeURIComponent(match[1]) : null;
    if (!slug) return;
    var ownerKey = "__tenant-cache-owner";
    var owner = localStorage.getItem(ownerKey);
    if (owner === slug) return;
    var prefixes = ["poc-", "admin-", "dashboard-data-", "buleje-admin-", "morning-summary-"];
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k !== ownerKey) keys.push(k);
    }
    var removed = 0;
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      for (var p = 0; p < prefixes.length; p++) {
        if (key.indexOf(prefixes[p]) === 0) {
          localStorage.removeItem(key);
          removed++;
          break;
        }
      }
    }
    localStorage.setItem(ownerKey, slug);
    if (removed > 0) {
      console.info("[tenant-cache] " + (owner || "(none)") + " -> " + slug + ": cleared " + removed + " stale cache entries (sync guard).");
    }
  } catch (e) { /* ignore */ }
})();
`.trim();

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // AdminProviders contiene su propio Suspense boundary interno alrededor
  // de useSearchParams (ver providers.tsx). Requerido por Next 16 para no
  // marcar /admin como blocking-route.
  //
  // El <script> se emite FUERA del subárbol cliente (AdminProviders) para
  // que React 19 lo serialice como HTML en el server render y el browser
  // lo ejecute nativamente antes de hidratar. Si va dentro del provider
  // cliente, React 19 emite el warning "Encountered a script tag while
  // rendering React component" y no lo ejecuta en navegaciones cliente.
  return (
    <>
      {/* Guard sincrónico anti-fuga cross-tenant — corre antes de cualquier
          componente React (incluso antes de que se monte AdminProviders). */}
      <script
        // eslint-disable-next-line react/no-danger -- script blocking pre-hidratación, contenido constante
        dangerouslySetInnerHTML={{ __html: TENANT_CACHE_GUARD_SCRIPT }}
      />
      <AdminProviders>
        {/* Skip-link WCAG 2.4.1 — apunta al <main id="main-content"> en AdminMainContent. */}
        <SkipLink />
        {children}
      </AdminProviders>
    </>
  );
}
