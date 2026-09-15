"use client";

/**
 * El panel de cotejo de «Traer del SNIFFS» en «Producir sin lote» (ADR-397).
 *
 * Sólo dibuja: recibe lo leído y el cotejo ya hecho (`cotejarSniffsSinLote`) y
 * muestra, producto por producto, dónde lo cubicado y lo declarado al SNIFFS no
 * dicen lo mismo. Quien lee y quien decide es `CtpSniffsSinLote`.
 *
 * De acá sólo pueden bajar al formulario tres cosas, y cada una con su botón:
 * la fecha leída, la especie leída (con la grafía que el libro ya usa) y la
 * línea de observación que deja el rastro del cotejo. Nada entra callado y
 * **nada agrega paquetes**: los m³ del Libro salen del pie tablar de lo
 * cubicado, y el resumen del SNIFFS no trae ni piezas ni escuadrías.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, NotebookPen, ScanText, X } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { DetalleProduccionSniffs } from "@/lib/forestal/sniffs-produccion-parse";
import {
  especieComoLaEscribeElLibro,
  lineaObservacionSniffs,
  type CotejoSniffsSinLote,
  type EstadoFilaCotejo,
} from "@/lib/forestal/sniffs-cotejo-sin-lote";
import { fmtDiaSniffs } from "./CtpPegarSniffs";
import { TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

/** Cómo se lee cada fila del cotejo. El color no es el único que lo dice. */
const ESTADOS: Record<EstadoFilaCotejo, { texto: string; clase: string }> = {
  cuadra: {
    texto: "Cuadra",
    clase: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  },
  difiere: {
    texto: "No cuadra",
    clase: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  },
  "falta-cubicar": {
    texto: "Sin cubicar",
    clase: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  },
  "de-mas": { texto: "No lo declara", clase: "text-[var(--text-tertiary)]" },
};

const ACCION =
  "inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60 disabled:hover:bg-transparent dark:text-[var(--accent)]";

export interface CotejoSniffsProps {
  detalle: DetalleProduccionSniffs;
  cotejo: CotejoSniffsSinLote;
  /** La fecha que el formulario ya tiene puesta, para no ofrecer la misma. */
  fecha: string;
  /** Las grafías de especie que el tenant ya usa, para no crear una nueva. */
  especiesConocidas: readonly string[];
  onUsarFecha: (iso: string) => void;
  onUsarEspecie: (nombre: string) => void;
  onAnotar: (linea: string) => void;
  onDescartar: () => void;
  /** La captura leída, en chico. */
  miniatura?: string | null;
}

/** El panel de cotejo, sin la parte de leer: así se puede probar con texto. */
export function PanelCotejoSniffs({
  detalle,
  cotejo,
  fecha,
  especiesConocidas,
  onUsarFecha,
  onUsarEspecie,
  onAnotar,
  onDescartar,
  miniatura = null,
}: CotejoSniffsProps) {
  const [anotado, setAnotado] = useState(false);
  const especieDelLibro = useMemo(
    () => especieComoLaEscribeElLibro(detalle.especieComun, especiesConocidas),
    [detalle.especieComun, especiesConocidas],
  );
  const cabecera = [
    detalle.lote ? `programación ${detalle.lote}` : null,
    detalle.fechaInicio
      ? `${fmtDiaSniffs(detalle.fechaInicio)}${detalle.fechaFin ? ` → ${fmtDiaSniffs(detalle.fechaFin)}` : ""}`
      : null,
    [detalle.especieCientifica, detalle.especieComun].filter(Boolean).join(" · ") || null,
  ].filter(Boolean);

  return (
    <div className="rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-xl bg-primary/10 px-3 py-2 text-sm">
        <ScanText
          className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          aria-hidden
        />
        <b className="text-[var(--text-primary)]">Lo que declaraste al SNIFFS</b>
        {cabecera.length > 0 && (
          <span className="min-w-0 flex-1 truncate font-mono text-xs tabular-nums text-[var(--text-secondary)]">
            {cabecera.join(" · ")}
          </span>
        )}
        {detalle.fechaInicio && detalle.fechaInicio !== fecha && (
          <button
            type="button"
            className={ACCION}
            onClick={() => onUsarFecha(detalle.fechaInicio as string)}
          >
            Usar {fmtDiaSniffs(detalle.fechaInicio)} como fecha
          </button>
        )}
        {cotejo.especie.estado === "solo-sniffs" && especieDelLibro && (
          <button type="button" className={ACCION} onClick={() => onUsarEspecie(especieDelLibro)}>
            Declarar {especieDelLibro} como especie
          </button>
        )}
        <button
          type="button"
          className={ACCION}
          disabled={anotado}
          onClick={() => {
            onAnotar(lineaObservacionSniffs(detalle, cotejo));
            setAnotado(true);
          }}
        >
          <NotebookPen className="h-3.5 w-3.5" aria-hidden />
          {anotado ? "Anotado" : "Anotarlo en observaciones"}
        </button>
        <button
          type="button"
          onClick={onDescartar}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--text-secondary)] underline-offset-2 hover:underline"
        >
          <X className="h-3.5 w-3.5" aria-hidden /> Descartar
        </button>
      </div>

      {cotejo.avisos.length > 0 && (
        <ul className="space-y-1 px-3 pt-2">
          {cotejo.avisos.map((a) => (
            <li
              key={a.texto}
              className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm font-bold ${
                a.tono === "error"
                  ? "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                  : "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              }`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{a.texto}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-3 p-3">
        {miniatura && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={miniatura}
            alt="La captura que se leyó"
            className="hidden h-24 w-36 shrink-0 rounded-lg border border-[var(--rule-base)] object-cover object-left-top sm:block"
          />
        )}
        <div className="min-w-0 flex-1">
          {cotejo.filas.length === 0 ? (
            <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-4 text-sm text-[var(--text-tertiary)]">
              Sin la tabla de productos de la captura no hay nada que comparar contra lo cubicado.
              Lo que sí se leyó —especie, fechas y consumido— está arriba.
            </p>
          ) : (
            <TablaCtp altoMax="max-h-[26vh]">
              <TheadCtp>
                <tr>
                  <th scope="col" className="px-3 py-2 font-bold">
                    Producto (catálogo LO-CTP)
                  </th>
                  <th scope="col" className="w-28 px-3 py-2 text-right font-bold">
                    SNIFFS m³
                  </th>
                  <th scope="col" className="w-28 px-3 py-2 text-right font-bold">
                    Cubicado m³
                  </th>
                  <th scope="col" className="w-28 px-3 py-2 text-right font-bold">
                    Diferencia
                  </th>
                  <th scope="col" className="w-28 px-3 py-2 font-bold">
                    Cotejo
                  </th>
                </tr>
              </TheadCtp>
              <TbodyCtp>
                {cotejo.filas.map((f) => (
                  <tr
                    key={f.producto}
                    className={f.estado === "cuadra" ? "" : "bg-[var(--data-warning-500)]/10"}
                  >
                    <td className="px-3 py-1.5 text-[var(--text-primary)]">
                      {f.producto}
                      {f.crudo && (
                        <span className="block font-mono text-xs text-[var(--text-tertiary)]">
                          leído: {f.crudo}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {f.sniffsM3 == null ? "—" : fmtM3(f.sniffsM3)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {f.cubicadoM3 == null ? "—" : fmtM3(f.cubicadoM3)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-primary)]">
                      {f.diferenciaM3 == null
                        ? "—"
                        : `${f.diferenciaM3 > 0 ? "+" : f.diferenciaM3 < 0 ? "−" : ""}${fmtM3(Math.abs(f.diferenciaM3))}`}
                    </td>
                    <td className={`px-3 py-1.5 text-sm font-bold ${ESTADOS[f.estado].clase}`}>
                      <span className="inline-flex items-center gap-1">
                        {f.estado === "cuadra" ? (
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {ESTADOS[f.estado].texto}
                      </span>
                    </td>
                  </tr>
                ))}
              </TbodyCtp>
              <tfoot>
                <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <th scope="row" className="px-3 py-2 text-left">
                    Total
                  </th>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {fmtM3(cotejo.totales.sniffsM3)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {fmtM3(cotejo.totales.cubicadoM3)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {cotejo.totales.diferenciaM3 > 0
                      ? "+"
                      : cotejo.totales.diferenciaM3 < 0
                        ? "−"
                        : ""}
                    {fmtM3(Math.abs(cotejo.totales.diferenciaM3))}
                  </td>
                  <td className="px-3 py-2">{cotejo.totales.cuadra ? "Cuadra" : ""}</td>
                </tr>
              </tfoot>
            </TablaCtp>
          )}
        </div>
      </div>

      <p className="border-t border-[var(--rule-soft)] px-3 py-2 text-xs leading-snug text-[var(--text-secondary)]">
        Se registra <b>lo cubicado</b>: la captura no agrega paquetes ni corrige números — el
        resumen del SNIFFS es por producto y no trae piezas ni medidas, y acá los m³ salen del pie
        tablar de cada una.{" "}
        {cotejo.rendimiento ? (
          <>
            Rendimiento declarado: <b>{cotejo.rendimiento.pct} %</b> sobre los{" "}
            {fmtM3(cotejo.rendimiento.consumidoM3)} m³ consumidos <b>que dice la captura</b> —bajo
            el tope del 56 % entrarían {fmtM3(cotejo.rendimiento.topeM3)} m³—. Ese consumido no
            tiene contra qué cotejarse en el Libro: esta corrida nace sin consumos, así que el
            número sale de la captura y no del patio.
          </>
        ) : (
          <>La captura no trae el volumen consumido, así que no hay rendimiento que calcular.</>
        )}
      </p>
    </div>
  );
}
