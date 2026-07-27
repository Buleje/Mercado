"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { VocabularyProvider } from "@/contexts/vocabulary-context";
import { ModuleTabsProvider } from "@/contexts/module-tabs-context";
import { SettingsProvider } from "@/contexts/settings-context";
import AdminMotionProvider from "@/components/admin/providers/AdminMotionProvider";
import { UndoToastProvider } from "@/components/admin/shared/UndoToast";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";
import { KeyboardShortcutsHelp } from "@/components/admin/shared/KeyboardShortcutsHelp";
import { ImportCarpetaProvider } from "@/contexts/import-carpeta-context";

const NotificationToast = dynamic(
  () => import("@/components/admin/shared/NotificationToast"),
  { ssr: false },
);

// Ola 4 v4.1 — QuickActionsFab global. Lazy loaded para no afectar TBT.
// El panel del import de carpetas: sólo aparece cuando hay uno corriendo, así
// que entra lazy — no debe pesar en el arranque del panel.
const ImportacionFlotante = dynamic(
  () => import("@/components/admin/documentos/ImportacionFlotante"),
  { ssr: false },
);

const QuickActionsFab = dynamic(
  () => import("@/components/admin/ux/QuickActionsFab").then((m) => ({ default: m.QuickActionsFab })),
  { ssr: false },
);

/** Rutas donde NO montar el FAB (login, kiosk, pos-mobile) */
const FAB_EXCLUDED_PATHS = [
  "/admin/login",
  "/admin/kiosk",
  "/admin/pos-mobile",
];

/** Tabs donde el FAB sobra — el propio modulo tiene sus acciones principales
 *  bien organizadas, agregar un FAB flotante produce ruido visual y accesos
 *  redundantes. POS/Turnos/Caja/Fiados cumplen este criterio. */
const FAB_EXCLUDED_TABS = new Set([
  "ventas-caja",
  "fiados",
  "pedidos",
  "turnos",
  "caja",
  "productos",
  "inventario",
  "clientes",
  "compras",
  "plata",
  "analytics-pro",
  "marketplace",
  "mi-tienda",
  "store-customizer",
  "vendor-dashboard",
  "delivery-partners",
  "delivery-live",
  "rendimiento",
  "asistente-ia",
  "ai-command",
  "sugerencias-ia",
  "metas-logros",
  "marketplace-chat",
  "colas",
  "config",
  "plan",
  "cotizaciones",
  "guias-remision",
  "notas-credito",
  "contratos",
  "auditoria",
  "devoluciones-proveedor",
  "recetas",
  "prestamos",
  "facturacion",
  "scoring",
  "subscriptions",
  "gift-cards-admin",
  "socio-members",
  "lives-admin",
  "mi-perfil",
  "support-inbox",
  "pagina-inicio",
]);

/**
 * Wrapper público — encapsula Suspense boundary alrededor del contenido que
 * usa `useSearchParams()` (Next 16 exige Suspense explícito para no marcar
 * la ruta como "blocking"). El fallback es `{children}` sin FAB para que
 * la UI sea funcional durante el primer paint.
 */
export function AdminProviders({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminProvidersBare>{children}</AdminProvidersBare>}>
      <AdminProvidersInner>{children}</AdminProvidersInner>
    </Suspense>
  );
}

/**
 * Fallback minimal — mismos providers pero SIN consumir search params ni FAB.
 * Se usa durante el Suspense boundary mientras Next resuelve los search params.
 */
function AdminProvidersBare({ children }: { children: React.ReactNode }) {
  return (
    <AdminMotionProvider>
      <SettingsProvider>
        <VocabularyProvider>
          <ModuleTabsProvider>
            <UndoToastProvider>
              <ConfirmDialogProvider>
                <ImportCarpetaProvider>{children}</ImportCarpetaProvider>
              </ConfirmDialogProvider>
            </UndoToastProvider>
          </ModuleTabsProvider>
        </VocabularyProvider>
      </SettingsProvider>
    </AdminMotionProvider>
  );
}

function AdminProvidersInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams?.get("tab") ?? "";
  const showFab =
    !FAB_EXCLUDED_PATHS.some((p) => pathname?.startsWith(p)) &&
    !FAB_EXCLUDED_TABS.has(activeTab);

  // Keyboard shortcuts help modal — `?` solo (sin modificador) o Ctrl/Cmd+?
  // Detecta tambien si el foco esta en un input/textarea/contenteditable
  // para no interceptar el `?` escrito en formularios.
  const [showShortcuts, setShowShortcuts] = useState(false);
  const toggleShortcuts = useCallback(() => setShowShortcuts((v) => !v), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl/Cmd + ? — siempre abre
      if ((e.ctrlKey || e.metaKey) && (e.key === "?" || e.key === "/")) {
        e.preventDefault();
        toggleShortcuts();
        return;
      }
      // `?` solo — abre solo si no estas escribiendo en un input
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const isTyping =
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable;
        if (!isTyping) {
          e.preventDefault();
          toggleShortcuts();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggleShortcuts]);

  return (
    <AdminMotionProvider>
      <SettingsProvider>
        <VocabularyProvider>
          <ModuleTabsProvider>
            <UndoToastProvider>
              <ConfirmDialogProvider>
                {/* Por ENCIMA del router de tabs: el import sigue corriendo
                    aunque te vayas de Documentos a Ventas. */}
                <ImportCarpetaProvider>
                  {children}
                  <ImportacionFlotante />
                </ImportCarpetaProvider>
                <NotificationToast />
                {showFab && <QuickActionsFab />}
                <KeyboardShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />
              </ConfirmDialogProvider>
            </UndoToastProvider>
          </ModuleTabsProvider>
        </VocabularyProvider>
      </SettingsProvider>
    </AdminMotionProvider>
  );
}
