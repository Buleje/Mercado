"use client";

/**
 * Carga la app Buleje IA en cliente y aparte del bundle del panel. `ssr: false`:
 * depende de `useSearchParams`, del micrófono y de la cámara del navegador.
 */
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { Loader2 } from "@buleje/design-system/icons";

function Abriendo() {
  return (
    <div className="flex min-h-dvh items-center justify-center gap-2 bg-[var(--surface-canvas)] text-base text-[var(--text-secondary)]">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Abriendo Buleje IA…
    </div>
  );
}

const BulejeIaApp = dynamic(() => import("./BulejeIaApp"), { ssr: false, loading: Abriendo });

export default function BulejeIaLoader() {
  return (
    <Suspense fallback={<Abriendo />}>
      <BulejeIaApp />
    </Suspense>
  );
}
