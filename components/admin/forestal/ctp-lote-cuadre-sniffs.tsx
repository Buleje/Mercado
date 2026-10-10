/**
 * Cómo cuadra un lote con el SNIFFS (ADR-398), como renglón de la tarjeta.
 *
 * Salió de `CtpLoteCard` (27-09) sin cambiar la lógica: el lote se armó pegando
 * la pantalla del SNIFFS, así que se puede afirmar si lo que dice el libro es
 * lo mismo que quedó declarado allá. `pendiente` es un estado legítimo —la
 * programación existe y la producción todavía no se declaró—, no un error.
 *
 * El detalle de las cifras era un `title` nativo (no se abre con el dedo ni
 * con el teclado): ahora es el ⓘ del panel.
 */

import { ScanText } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { TOLERANCIA_CUADRE_SNIFFS_M3, type CuadreSniffs } from "@/lib/forestal/lotes-aserrio";
import { m3Fino } from "./ctp-lote-card-partes";

function detalle(c: CuadreSniffs): string {
  if (c.deltaProducidoM3 == null) {
    const alla = c.consumidoSniffsM3 != null ? `${m3Fino(c.consumidoSniffsM3)} m³` : "no se leyó";
    return `La lista del SNIFFS no trae productos: sólo se compara el consumo. Allá ${alla}, acá ${m3Fino(c.consumidoLoteM3)} m³. Pega el detalle del lote para comparar la producción.`;
  }
  if (c.estado === "pendiente") {
    return `El SNIFFS declara ${m3Fino(c.producidoSniffsM3)} m³ en ${c.productosSniffs} producto(s). El libro todavía no declaró producción de este lote.`;
  }
  const consumidoAlla = c.consumidoSniffsM3 != null ? ` de ${m3Fino(c.consumidoSniffsM3)} m³ consumidos` : "";
  return `SNIFFS: ${m3Fino(c.producidoSniffsM3)} m³ producidos${consumidoAlla}. Libro: ${m3Fino(c.producidoLoteM3)} m³ de ${m3Fino(c.consumidoLoteM3)} m³.`;
}

function resumen(c: CuadreSniffs): string {
  if (c.deltaProducidoM3 == null) {
    /* Vino de la LISTA, que no trae productos: lo único comparable es el
       consumido, y decir «cuadra con el libro» a secas prometería una
       comparación que no se hizo. Si además falta declarar la producción, ESO
       es lo que hay que hacer y va primero. */
    if (c.estado !== "cuadra") return `el consumo difiere en ${m3Fino(Math.abs(c.deltaConsumidoM3 ?? 0))} m³`;
    return c.produccionPendiente ? "falta declarar acá lo que salió" : "el consumo cuadra";
  }
  if (c.estado === "cuadra") return "cuadra con el libro";
  if (c.estado === "pendiente") return `${m3Fino(c.producidoSniffsM3)} m³ declarados allá, falta acá`;
  const consumo =
    c.deltaConsumidoM3 != null && Math.abs(c.deltaConsumidoM3) > TOLERANCIA_CUADRE_SNIFFS_M3
      ? ` y ${m3Fino(Math.abs(c.deltaConsumidoM3))} m³ consumidos`
      : "";
  return `difiere en ${m3Fino(Math.abs(c.deltaProducidoM3))} m³ producidos${consumo}`;
}

const TONO: Record<CuadreSniffs["estado"], string> = {
  cuadra: "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]",
  difiere: "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-ink)]",
  pendiente: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};

export function LoteCuadreSniffs({
  cuadre,
  onResolver,
}: {
  cuadre: CuadreSniffs;
  /** Lleva al mismo formulario de producción, con los productos del SNIFFS ya cargados. */
  onResolver?: () => void;
}) {
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-3 py-2 text-sm font-bold ${TONO[cuadre.estado]}`}>
      <ScanText className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        SNIFFS{cuadre.lote ? ` N° ${cuadre.lote}` : ""}: {resumen(cuadre)}{" "}
        <InfoTip title="Cuadre con el SNIFFS" body={detalle(cuadre)} />
      </span>
      {onResolver && cuadre.estado !== "cuadra" && (
        <button type="button" onClick={onResolver} className="shrink-0 underline underline-offset-2">
          {cuadre.estado === "pendiente" ? "declararlo" : "revisarlo"}
        </button>
      )}
    </p>
  );
}
