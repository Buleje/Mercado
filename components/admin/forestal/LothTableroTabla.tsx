"use client";

/**
 * La lista de trozas del Control del permiso, con sus filtros pegados, el
 * lector de etiquetas en el buscador y la casilla de la tanda (ADR-459).
 *
 * A 400 px la tabla hace scroll propio dentro de su marco: la página no se
 * ensancha.
 */

import { useEffect, useRef } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { AlertTriangle, FileText, ScanLine, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatDateShort } from "@/lib/format";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { ESTADOS_META, antiguedadEnPatio, sumaM3, type TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import type { LothTableroTabla } from "./hooks/use-loth-tablero-tabla";
import { HOJA_MOVIL, TONO_ESTADO } from "./loth-tablero-estilos";

const TH = "px-3 py-2.5 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] whitespace-nowrap";
const TD = "px-3 py-2.5 align-middle";
const CASILLA = "h-5 w-5 cursor-pointer rounded accent-[var(--accent)]";
const TONO_LECTURA = {
  ok: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  aviso: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  error: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
} as const;
const TONO_DIAS = {
  critico: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
  atencion: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]",
} as const;

export interface NavTablero {
  onVerCadena?: (code: string) => void;
  onVerGtf?: (gtf: string) => void;
  onIrAlPlan?: () => void;
}

export default function LothTableroTabla({
  t,
  total,
  especies,
  nav,
  permisoDe,
  tanda,
  vacio = "Todavía no hay trozas registradas en el libro.",
}: {
  t: LothTableroTabla;
  /** Cuántas trozas tiene el permiso (sin filtros). */
  total: number;
  especies: readonly string[];
  nav?: NavTablero;
  /** Con «Todos»: el nombre del permiso de cada troza (columna extra). */
  permisoDe?: (planId: string | null) => string;
  /** La barra de la tanda, entre los filtros y la tabla. */
  tanda?: React.ReactNode;
  /** Lo que dice la tabla sin ninguna troza («en este permiso» / «en el libro»). */
  vacio?: string;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const columnas = 8 + (permisoDe ? 1 : 0);

  /* La troza leída se trae a la vista: con 200 filas, resaltarla abajo no sirve. */
  useEffect(() => {
    if (!t.resaltada || !marco.current) return;
    const fila = marco.current.querySelector<HTMLElement>(`[data-troza="${CSS.escape(t.resaltada)}"]`);
    fila?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [t.resaltada]);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Trozas{" "}
          <span className="font-normal text-[var(--text-tertiary)]">
            {t.visibles.length} de {total} · {fmtM3(sumaM3(t.visibles))} m³
          </span>
        </CardTitle>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <ScanLine className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
            <input
              type="search"
              value={t.texto}
              onChange={(e) => t.setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  t.alLeer();
                }
              }}
              placeholder="Buscar o escanear la etiqueta"
              aria-label="Buscar trozas o escanear su etiqueta"
              aria-describedby="tablero-lectura"
              className="h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-8 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] sm:w-72"
            />
          </div>
          <InfoTip
            title="Escanear la etiqueta"
            what="Pasa la pistola por el QR de la etiqueta (o tipea el código y Enter): la troza se resalta y, si está en el patio, queda elegida."
            example="Lee TROZA 85-TOR-C… → fila resaltada y elegida para la guía."
          />
          <select
            value={t.especie ?? ""}
            onChange={(e) => t.setEspecie(e.target.value || null)}
            aria-label="Filtrar por especie"
            className="h-10 rounded-xl border border-[var(--rule-base)] max-sm:basis-full bg-[var(--surface-raised)] px-2 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="">Todas las especies</option>
            {especies.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
      </div>

      <div id="tablero-lectura" aria-live="polite" className="min-h-0">
        {t.lectura && (
          <p className={`flex items-center gap-2 text-sm font-semibold ${TONO_LECTURA[t.lectura.tono]}`}>
            {t.lectura.texto}
            <button type="button" onClick={t.cerrarLectura} aria-label="Cerrar el aviso de la lectura" className="rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </p>
        )}
      </div>

      {tanda}

      {/* `hoja-grilla`: a menos de 640 px el panel vuelve tarjetas toda tabla
          (`useMobileTableCards`); una lista de patio de 80 trozas en tarjetas
          son metros de scroll. Sigue siendo tabla, con scroll propio en su caja
          (la caja la pone `DataTable`). */}
      <div ref={marco} className="min-w-0">
        <DataTable
          className={`w-full text-sm ${HOJA_MOVIL}`}
          wrapperClassName="max-w-full rounded-2xl bg-[var(--surface-raised)]"
        >
          <thead className="bg-[var(--surface-sunken)]">
            <tr>
              <th className={`${TH} w-10`} data-label="Elegir">
                <input
                  type="checkbox"
                  className={CASILLA}
                  checked={t.todasVisiblesElegidas}
                  ref={(el) => {
                    if (el) el.indeterminate = t.algunaVisibleElegida && !t.todasVisiblesElegidas;
                  }}
                  disabled={!t.hayElegibles}
                  onChange={(e) => t.elegirVisibles(e.target.checked)}
                  aria-label="Elegir todas las trozas del patio que se ven"
                  title="Elegir todas las del patio que se ven"
                />
              </th>
              <th className={TH}>Cód. troza</th>
              <th className={TH}>Árbol</th>
              <th className={TH}>Especie</th>
              <th className={`${TH} text-right`}>Vol. m³</th>
              <th className={TH}>Trozada el</th>
              <th className={TH}>Estado</th>
              <th className={TH}>GTF / salida</th>
              {permisoDe && <th className={TH}>Permiso</th>}
            </tr>
          </thead>
          <tbody>
            {t.visibles.length === 0 && (
              <tr>
                <td colSpan={columnas} className="px-3 py-8 text-center text-sm text-[var(--text-tertiary)]">
                  {total === 0 ? vacio : "Ninguna troza coincide con el filtro."}
                </td>
              </tr>
            )}
            {t.visibles.map((f) => (
              <Fila
                key={f.code}
                f={f}
                nav={nav}
                elegida={t.elegidas.has(f.code)}
                resaltada={t.resaltada === f.code}
                onElegir={() => t.alternarElegida(f.code)}
                permiso={permisoDe?.(f.planId)}
              />
            ))}
          </tbody>
        </DataTable>
      </div>
    </section>
  );
}

function Fila({
  f,
  nav,
  elegida,
  resaltada,
  onElegir,
  permiso,
}: {
  f: TrozaTablero;
  nav?: NavTablero;
  elegida: boolean;
  resaltada: boolean;
  onElegir: () => void;
  permiso?: string;
}) {
  const vieja = antiguedadEnPatio(f);
  return (
    <tr
      data-troza={f.code}
      aria-selected={elegida || undefined}
      className={`border-t border-[var(--rule-soft)] ${
        resaltada ? "bg-[var(--accent-soft)] outline outline-2 -outline-offset-2 outline-[var(--accent)]" : elegida ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-sunken)]"
      }`}
    >
      <td className={TD}>
        {f.estado === "disponible" && (
          <input type="checkbox" className={CASILLA} checked={elegida} onChange={onElegir} aria-label={`Elegir la troza ${f.code}`} />
        )}
      </td>
      <td className={`${TD} whitespace-nowrap`}>
        <button
          type="button"
          onClick={() => nav?.onVerCadena?.(f.code)}
          className="font-mono font-bold text-[var(--text-primary)] underline-offset-2 hover:underline"
        >
          {f.code}
        </button>
        {f.cites && (
          <span className="ml-1.5 rounded bg-[var(--data-info-50)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]">
            CITES
          </span>
        )}
      </td>
      <td className={`${TD} whitespace-nowrap font-mono text-[var(--text-secondary)]`}>{f.treeCode ?? "—"}</td>
      <td className={`${TD} text-[var(--text-secondary)]`}>{f.especie ?? "—"}</td>
      <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-primary)]`}>
        {f.volumenM3 != null ? fmtM3(f.volumenM3) : <span className="text-[var(--text-tertiary)]">sin medir</span>}
      </td>
      <td className={`${TD} whitespace-nowrap text-[var(--text-secondary)]`}>
        {f.diaTrozado ? formatDateShort(f.diaTrozado, { soloFecha: true }) : "—"}
      </td>
      <td className={`${TD} whitespace-nowrap`}>
        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-bold ${TONO_ESTADO[f.estado].chip}`}>
          {f.estado === "fantasma" && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
          {ESTADOS_META[f.estado].label}
        </span>
        {f.estado === "disponible" && f.diasEnPatio != null && f.diasEnPatio > 0 && (
          <span
            className={`ml-1.5 rounded-md px-1.5 py-0.5 text-xs ${vieja ? `font-bold ${TONO_DIAS[vieja]}` : "text-[var(--text-tertiary)]"}`}
            title={vieja ? "Lleva demasiado en el patio: la madera rolliza se mancha (mancha azul)" : undefined}
          >
            {f.diasEnPatio} d en patio
          </span>
        )}
      </td>
      <td className={`${TD} whitespace-nowrap`}>
        {f.gtf ? (
          <button
            type="button"
            onClick={() => nav?.onVerGtf?.(f.gtf as string)}
            className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[var(--data-info-700)] underline-offset-2 hover:underline dark:text-[var(--data-info-500)]"
          >
            <FileText className="h-3 w-3" aria-hidden="true" />
            {f.gtf}
          </button>
        ) : (
          <span className="text-xs text-[var(--text-tertiary)]">—</span>
        )}
      </td>
      {permiso !== undefined && <td className={`${TD} whitespace-nowrap text-xs text-[var(--text-secondary)]`}>{permiso}</td>}
    </tr>
  );
}
