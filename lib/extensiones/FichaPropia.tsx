import "server-only";
import type { ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { ENCHUFE_PAGINA, pideSinPiezas, type MetadatosFicha, type ParametrosDeBusqueda } from "@/extensiones/_contrato";
import { BordeDePieza } from "./BordeDePieza";
import { paginaPropiaDeLaTienda } from "./pagina-propia-tienda";
import { RecargarSinPiezas } from "./RecargarSinPiezas";
import { conTope, reportarFalloPieza } from "./tope";

/**
 * ADR-460 · la ficha propia de `/t/<negocio>/tienda/<producto>`, o `null` (=
 * la ficha general de siempre). Mismas garantías que el catálogo propio
 * (`CatalogoPropio.tsx`):
 * · sin página propia, sin `Ficha` o con `?sinPiezas=1` → `null`, y la
 *   búsqueda NI se espera (la ficha general no cambia en nada);
 * · tope de 2 s hasta que `Ficha()` devuelve; si tira o se pasa → `null` + aviso;
 * · si falla al dibujarse, `<RecargarSinPiezas>` recarga con `?sinPiezas=1`.
 * Un `notFound()`/`redirect()` que tire la pieza pasa (`unstable_rethrow`).
 */
export async function fichaPropia(producto: string, searchParams: Promise<ParametrosDeBusqueda>): Promise<ReactNode | null> {
  const propia = await paginaPropiaDeLaTienda();
  const Ficha = propia?.pieza.Ficha;
  if (!propia || !Ficha) return null;
  const busqueda = await searchParams;
  if (pideSinPiezas(busqueda)) return null;

  let vista: ReactNode;
  try {
    vista = await conTope(
      Promise.resolve().then(() => Ficha({ ctx: propia.ctx, opciones: propia.opciones, searchParams: busqueda, producto })),
      undefined,
      `la ficha de ${propia.piezaId}`,
    );
  } catch (err) {
    unstable_rethrow(err);
    reportarFalloPieza(err, { piezaId: propia.piezaId, enchufe: ENCHUFE_PAGINA, tenantId: propia.ctx.tenantId, etapa: "ficha" });
    return null;
  }

  return (
    <BordeDePieza piezaId={propia.piezaId} fallback={<RecargarSinPiezas />} mientrasCarga={null}>
      {vista}
    </BordeDePieza>
  );
}

/**
 * Los metadatos de la ficha propia:
 * · `undefined` — no hay ficha propia (o no trae `metadatosFicha`, o falló, o
 *   `?sinPiezas=1`): la página usa los de la ficha general, como siempre;
 * · `null` — el producto no es de esta tienda: «no encontrado», sin indexar;
 * · el objeto — el título y la descripción que da la pieza.
 */
export async function metadatosDeFichaPropia(
  producto: string,
  searchParams: Promise<ParametrosDeBusqueda>,
): Promise<MetadatosFicha | null | undefined> {
  const propia = await paginaPropiaDeLaTienda();
  const metadatos = propia?.pieza.Ficha ? propia.pieza.metadatosFicha : undefined;
  if (!propia || !metadatos) return undefined;
  const busqueda = await searchParams;
  if (pideSinPiezas(busqueda)) return undefined;
  try {
    return await conTope(
      Promise.resolve().then(() => metadatos({ ctx: propia.ctx, opciones: propia.opciones, searchParams: busqueda, producto })),
      undefined,
      `los metadatos de la ficha de ${propia.piezaId}`,
    );
  } catch (err) {
    unstable_rethrow(err);
    reportarFalloPieza(err, { piezaId: propia.piezaId, enchufe: ENCHUFE_PAGINA, tenantId: propia.ctx.tenantId, etapa: "ficha-metadatos" });
    return undefined;
  }
}
