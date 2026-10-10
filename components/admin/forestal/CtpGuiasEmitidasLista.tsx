"use client";

/**
 * La lista de «Guías emitidas» del CTP: una fila por despacho con GTF, cada
 * una con su casilla para llevarla a un trámite (relación de guías, anulación,
 * pérdida, talonario: la barra es `CtpGuiasEmitidasBarra`). La casilla de
 * arriba elige las de la lista tal como está filtrada.
 *
 * Partida de `CtpGuiasEmitidasView` sin cambiar las filas: lo único nuevo es
 * la casilla y el resalte de la elegida.
 */

import { formatDateShort } from "@/lib/format";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { claveDeGuia, lineasPorGuia, type EstadoGuia, type GuiaEmitida } from "@/lib/forestal/guias-emitidas";
import { CasillaGuia, CasillaTodasGuias } from "./gtf-seleccion-casillas";
import type { SeleccionGuias } from "./hooks/use-seleccion-guias";

const fecha = (iso: string) =>
  formatDateShort(iso, { soloFecha: true });

const ESTADO_CLASE: Record<EstadoGuia, string> = {
  completa: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  incompleta: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  anulada: "text-[var(--text-tertiary)] line-through",
};

export default function CtpGuiasEmitidasLista({
  guias,
  todas = guias,
  sel,
}: {
  guias: readonly GuiaEmitida[];
  /** Todas las del período (sin filtrar): una guía se elige con TODAS sus líneas, aunque el filtro esconda alguna. */
  todas?: readonly GuiaEmitida[];
  sel: SeleccionGuias;
}) {
  /* Una fila por LÍNEA de despacho, pero la casilla elige la GUÍA entera (08-10). */
  const porGuia = lineasPorGuia(todas);
  const lineasDe = (g: GuiaEmitida) => porGuia.get(claveDeGuia(g)) ?? [g.despachoId];
  const claves = new Set(guias.map(claveDeGuia));
  const ids = [...new Set(guias.flatMap(lineasDe))];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 pl-1 text-sm text-[var(--text-secondary)]">
        <CasillaTodasGuias ids={ids} sel={sel} etiqueta={`Elegir las ${claves.size} guías de la lista`} />
        <span aria-hidden>{claves.size === 1 ? "Elegir la guía para un trámite" : `Elegir las ${claves.size} para un trámite`}</span>
      </div>
      <ul className="space-y-1.5">
        {guias.map((g) => (
          <li
            key={g.despachoId}
            className={`flex flex-wrap items-center gap-3 rounded-xl border py-2.5 pl-1 pr-3 ${
              sel.tiene(g.despachoId)
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
            }`}
          >
            <CasillaGuia id={g.despachoId} ids={lineasDe(g)} numero={g.gtfNumber} sel={sel} />
            <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
              {fecha(g.fecha)}
            </span>
            {/* `basis-48`: a 400 px el estado y las marcas bajan a otra línea
                en vez de partir el N° de guía en dos (la casilla le quitó 40 px). */}
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={`font-mono text-sm font-bold ${ESTADO_CLASE[g.estado]}`}>{g.gtfNumber}</span>
                <span className="truncate text-sm text-[var(--text-secondary)]">
                  {g.destinatario ?? g.destino ?? "sin destinatario"}
                </span>
                {g.placa && <span className="font-mono text-xs text-[var(--text-tertiary)]">{g.placa}</span>}
              </div>
              <span className="block truncate text-xs text-[var(--text-tertiary)]">
                {[
                  g.lineNo != null ? `línea #${g.lineNo}` : null,
                  g.producto,
                  g.especie,
                  g.cantidad != null ? `${g.cantidad} ${g.unidad ?? ""}`.trim() : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <span className={`shrink-0 text-sm font-bold ${ESTADO_CLASE[g.estado]}`}>
              {g.estado === "anulada"
                ? "anulada"
                : g.estado === "completa"
                  ? "lista"
                  : `faltan ${g.faltan}`}
            </span>
            {g.estado !== "anulada" && !g.verificada && (
              <span
                className="shrink-0 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs font-bold text-[var(--text-tertiary)]"
                title="No se verificó contra el SNIFFS de SERFOR"
              >
                sin verificar
              </span>
            )}
            {/* Distinto de «faltan N», que cuenta CAMPOS del documento: una
                guía puede estar impecable y amparar madera cuyo origen todavía
                no se declaró. Ese documento ya salió a la calle. */}
            {g.sinOrigen > 0.001 && (
              <span
                className="shrink-0 rounded bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                title="Esta guía ampara madera sin corrida de producción atribuida. Completa el origen desde Despacho ▸ cadena de custodia."
              >
                {g.unidad === "m3" ? fmtM3(g.sinOrigen) : g.sinOrigen.toFixed(4)} {g.unidad ?? ""} sin origen
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
