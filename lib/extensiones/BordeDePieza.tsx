/**
 * BordeDePieza — el borde que pone el sistema alrededor de toda pieza (ADR-457).
 *
 * Si la pieza tira al dibujarse —en el servidor o en el navegador— se ve el
 * `fallback` (la versión normal) y el error va a Sentry. Reusa el
 * `ErrorBoundary` del panel, que ya reporta.
 *
 * · `Suspense` adentro: un error de una vista de SERVIDOR durante el SSR no
 *   tumba la página; React manda el `fallback` y reintenta en el navegador,
 *   donde el `ErrorBoundary` lo ataja.
 * · El `fallback` va envuelto en un fragmento: el `ErrorBoundary` trata
 *   `null` como «no me pasaron nada» y pintaría su tarjeta roja de error
 *   —en la tienda pública—. Un fragmento vacío es «no mostrar nada».
 *
 * Sin `"use client"`: se puede usar desde un componente de servidor
 * (`<Enchufe>`) y desde uno de cliente (la pestaña «A medida»).
 */
import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export interface BordeDePiezaProps {
  piezaId: string;
  /** La versión normal. `null` = no mostrar nada si la pieza falla. */
  fallback?: ReactNode;
  children: ReactNode;
}

export function BordeDePieza({ piezaId, fallback = null, children }: BordeDePiezaProps) {
  const normal = <>{fallback}</>;
  return (
    <ErrorBoundary fallback={normal} moduleName={`la pieza ${piezaId}`}>
      <Suspense fallback={normal}>{children}</Suspense>
    </ErrorBoundary>
  );
}
