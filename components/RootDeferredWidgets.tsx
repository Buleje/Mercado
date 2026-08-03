"use client";

/**
 * RootDeferredWidgets — lazy-load de 5 widgets del root layout que no
 * son criticos para First Contentful Paint:
 *
 *   - SmoothScrollProvider (Lenis, ~40kb)
 *   - ClientEffects (keyboard shortcuts, analytics mounts)
 *   - ServiceWorkerRegistrar (PWA SW install)
 *   - InstallPrompt (prompt PWA, solo aparece si browser lo soporta)
 *   - CommandPalette (Cmd+K menu, solo abre al shortcut)
 *
 * Todos son `ssr: false` porque requieren window/document o son pure
 * client-side effects. Se descargan DESPUES del paint inicial.
 */

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const SmoothScrollProvider = dynamic(
  () => import("@/components/SmoothScrollProvider"),
  {},
);

const ScrollProgressBar = dynamic(
  () => import("@/components/ScrollProgressBar"),
  {},
);

const AutoTranslator = dynamic(
  () => import("@/components/AutoTranslator"),
  {},
);

const ClientEffects = dynamic(() => import("@/components/ui/ClientEffects"), {
  
});

const ServiceWorkerRegistrar = dynamic(
  () => import("@/components/ServiceWorkerRegistrar"),
  {},
);

const InstallPrompt = dynamic(() => import("@/components/InstallPrompt"), {
  
});

const CommandPalette = dynamic(() => import("@/components/CommandPalette"), {
  
});

export default function RootDeferredWidgets() {
  // El CommandPalette del root escucha Ctrl+K sin filtro de ruta, así que
  // dentro de /admin y /superadmin se abría ENCIMA de la paleta propia de cada
  // panel: dos overlays apilados, cada uno con su buscador y las mismas
  // acciones repetidas. Cada panel ya trae la suya (GlobalSearch en admin,
  // superadmin/CommandPalette en superadmin) y son las que conocen sus módulos.
  const pathname = usePathname();
  const hasOwnPalette = pathname?.startsWith("/admin") || pathname?.startsWith("/superadmin");

  return (
    <>
      <SmoothScrollProvider />
      <ScrollProgressBar />
      <AutoTranslator />
      <ClientEffects />
      <ServiceWorkerRegistrar />
      <InstallPrompt />
      {!hasOwnPalette && <CommandPalette />}
    </>
  );
}
