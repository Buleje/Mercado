import type { Metadata } from "next";
import { Suspense } from "react";
import { esIdDeTroza } from "@/lib/forestal/ctp-troza-url";
import TrozaTarjetaPagina from "@/components/admin/forestal/troza-tarjeta/TrozaTarjetaPagina";
import { TarjetaEsqueleto } from "@/components/admin/forestal/troza-tarjeta/TarjetaEstados";

/**
 * /admin/q/<id> — lo que abre el QR chico de la etiqueta de una troza
 * (ADR-436): la TARJETA de la pieza, hecha para el celular (Brandon,
 * 2026-09-26: «tipo formato imagen, bien presentado»). Hasta el 26-09 era un
 * route handler que redirigía al libro entero con la ficha modal encima.
 *
 * La sesión la sigue exigiendo el guard de `/admin/*` en `proxy.ts` ANTES de
 * llegar acá (sin sesión → login con `?from=`): escanear una etiqueta pegada
 * en el patio no le muestra nada a un extraño. Y la ficha se pide al endpoint
 * del libro, que filtra por el negocio de la sesión: un id de otro negocio da
 * «no está en el libro», sin confirmar que exista.
 *
 * `params` se lee DENTRO de un `<Suspense>`: con `cacheComponents`, leerlo en
 * la página misma daba «Uncached data was accessed outside of <Suspense>» en
 * la consola (por eso antes era un route handler).
 */

export const metadata: Metadata = {
  title: "Troza | Buleje",
  description: "La troza de un vistazo: medidas, papeles y dónde está",
  // Pantalla operativa detrás de login: no tiene por qué indexarse.
  robots: { index: false, follow: false },
};

/**
 * Con `cacheComponents`, un segmento dinámico SIN `generateStaticParams` vuelve
 * «dato de tiempo de ejecución» todo `usePathname()` del árbol, y el del root
 * layout (`RootDeferredWidgets`) está fuera de un `<Suspense>`: la consola daba
 * «Uncached data was accessed outside of <Suspense>» (le pasa también a
 * `/admin/documentos/[id]/editar`). Con esto el Suspense es opcional (docs de
 * `usePathname`). Un solo id de muestra —que no es de ninguna troza— basta: el
 * resto se arma al pedirlo.
 */
export function generateStaticParams(): { id: string }[] {
  return [{ id: "muestra" }];
}

async function Tarjeta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  /* Lo que no tiene forma de id no se pregunta: la ruta corta no es un buscador. */
  return <TrozaTarjetaPagina id={id} idValido={esIdDeTroza(id)} />;
}

export default function TrozaQrPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <main data-area="admin" className="min-h-dvh bg-[var(--surface-sunken)] px-3 pt-4 sm:px-6 sm:pt-8 dark:bg-[var(--surface-canvas)]">
          <div className="mx-auto w-full max-w-[30rem] lg:max-w-[60rem]">
            <TarjetaEsqueleto />
          </div>
        </main>
      }
    >
      <Tarjeta params={params} />
    </Suspense>
  );
}
