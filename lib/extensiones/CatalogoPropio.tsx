import "server-only";
import type { ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { ENCHUFE_PAGINA, pideSinPiezas, type ParametrosDeBusqueda } from "@/extensiones/_contrato";
import { BordeDePieza } from "./BordeDePieza";
import { paginaPropiaDeLaTienda } from "./pagina-propia-tienda";
import { RecargarSinPiezas } from "./RecargarSinPiezas";
import { conTope, reportarFalloPieza } from "./tope";

/**
 * ADR-460 · el catálogo propio de `/t/<negocio>/tienda`, o `null` (= el
 * catálogo general de siempre). Mismas garantías que la página propia
 * (`EnchufePagina`):
 * · sin página propia, sin `Catalogo` o con `?sinPiezas=1` → `null`, y la
 *   búsqueda NI se espera (el catálogo general no cambia en nada);
 * · tope de 2 s hasta que `Catalogo()` devuelve; si tira o se pasa → `null` + aviso;
 * · si falla al dibujarse, `<RecargarSinPiezas>` recarga con `?sinPiezas=1`.
 */
export async function catalogoPropio(searchParams: Promise<ParametrosDeBusqueda>): Promise<ReactNode | null> {
  const propia = await paginaPropiaDeLaTienda();
  const Catalogo = propia?.pieza.Catalogo;
  if (!propia || !Catalogo) return null;
  const busqueda = await searchParams;
  if (pideSinPiezas(busqueda)) return null;

  let vista: ReactNode;
  try {
    vista = await conTope(
      Promise.resolve().then(() => Catalogo({ ctx: propia.ctx, opciones: propia.opciones, searchParams: busqueda })),
      undefined,
      `el catálogo de ${propia.piezaId}`,
    );
  } catch (err) {
    unstable_rethrow(err);
    reportarFalloPieza(err, { piezaId: propia.piezaId, enchufe: ENCHUFE_PAGINA, tenantId: propia.ctx.tenantId, etapa: "catalogo" });
    return null;
  }

  return (
    <BordeDePieza piezaId={propia.piezaId} fallback={<RecargarSinPiezas />} mientrasCarga={null}>
      {vista}
    </BordeDePieza>
  );
}
