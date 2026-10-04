"use client";

/**
 * La tabla del tablero de trozas: las columnas que el usuario eligió, cada
 * cabecera ordena (asc → desc → sin orden).
 *
 * Merge 2026-10-04 (dos sesiones construyeron el Control del permiso): suma lo
 * de ADR-459 — la casilla de la tanda (sólo las del patio), la fila leída con
 * la pistola resaltada, la columna «Permiso» con «Todos» y los días en patio
 * en ámbar (≥ 15) / rojo (≥ 30). La casilla va DENTRO de la primera columna,
 * no en una propia: así las columnas siguen siendo las que el usuario eligió.
 *
 * A 400 px sigue siendo tabla (`hoja-grilla`, scroll propio en su caja): una
 * lista de patio de 80 trozas en tarjetas son metros de scroll. Cada `<th>`
 * lleva `data-label` con su nombre igual, para que el botón de orden no se
 * cuele en el rótulo si algún día vuelve a tarjetas.
 */

import type { ReactNode } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, FileText } from "@buleje/design-system/icons";
import {
  COLUMNAS_TABLERO,
  diasEnPatioDe,
  type ColumnaKey,
  type ColumnaTablero,
  type OrdenTablero,
} from "@/lib/forestal/loth-tablero-columnas";
import { ESTADOS_META, antiguedadEnPatio, type TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { fechaCelda } from "./loth-tablero-partes";
import { HOJA_MOVIL, TONO_ESTADO } from "./loth-tablero-estilos";

export type NavTablero = {
  onVerCadena?: (code: string) => void;
  onVerGtf?: (gtf: string) => void;
  /** «Ir al Plan de manejo» del menú Opciones y del volumen del permiso. */
  onIrAlPlan?: () => void;
  /** «Árbol en el mapa» del escáner. Sin esto, navega por la URL (`?vista=mapa&arbol=`). */
  onVerArbol?: (treeCode: string) => void;
  /** «Registrar su despacho» del escáner. Sin esto, va a la sección Despacho por la URL. */
  onRegistrarDespacho?: (code: string) => void;
};

const TH = "px-3 py-2.5 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const TD = "px-3 py-2.5 align-middle";
const DERECHA = new Set(["numero", "m3", "metros", "dias"]);

const CASILLA = "h-5 w-5 shrink-0 cursor-pointer rounded accent-[var(--accent)]";
/** Lo que lleva demasiado en el patio: la madera rolliza se mancha (mancha azul). */
const TONO_DIAS = {
  critico: "rounded-md bg-[var(--data-error-50)] px-1.5 py-0.5 font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
  atencion: "rounded-md bg-[var(--data-warning-50)] px-1.5 py-0.5 font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]",
} as const;
const TITULO_VIEJA = "Lleva demasiado en el patio: la madera rolliza se mancha (mancha azul)";

const VACIO = <span className="text-xs text-[var(--text-tertiary)]">—</span>;
const metros = (n: number) => formatNumber(n, { min: 2, max: 3 });

/** La tanda (ADR-459): sólo las trozas DISPONIBLES se eligen. */
export interface SeleccionTabla {
  elegidas: ReadonlySet<string>;
  onElegir: (code: string) => void;
  /** Casilla de la cabecera: todas las del patio que se ven. */
  todasVisibles: boolean;
  algunaVisible: boolean;
  hayElegibles: boolean;
  onElegirVisibles: (si: boolean) => void;
}

export default function LothTableroTrozasTabla({
  filas,
  hayTrozas,
  visibles,
  orden,
  onOrdenar,
  nav,
  seleccion,
  resaltada = null,
  permisoDe,
  vacio = "Todavía no hay trozas registradas en el libro.",
}: {
  filas: readonly TrozaTablero[];
  /** ¿Hay alguna troza en el libro? Distingue «vacío» de «el filtro no deja nada». */
  hayTrozas: boolean;
  visibles: readonly ColumnaKey[];
  orden: OrdenTablero | null;
  onOrdenar: (k: ColumnaKey) => void;
  nav?: NavTablero;
  /** Con esto, la primera columna lleva la casilla de la tanda. */
  seleccion?: SeleccionTabla;
  /** La troza que se acaba de leer con la pistola. */
  resaltada?: string | null;
  /** Con «Todos»: el nombre del permiso de cada troza (columna extra). */
  permisoDe?: (planId: string | null) => string;
  /** Lo que dice la tabla sin ninguna troza («en este permiso» / «en el libro»). */
  vacio?: string;
}) {
  const cols = COLUMNAS_TABLERO.filter((c) => visibles.includes(c.key));
  const conDiasAparte = !visibles.includes("diasPatio");
  const nCols = cols.length + (permisoDe ? 1 : 0);

  const casillaTodas = seleccion ? (
    <input
      type="checkbox"
      className={CASILLA}
      checked={seleccion.todasVisibles}
      ref={(el) => {
        if (el) el.indeterminate = seleccion.algunaVisible && !seleccion.todasVisibles;
      }}
      disabled={!seleccion.hayElegibles}
      onChange={(e) => seleccion.onElegirVisibles(e.target.checked)}
      aria-label="Elegir todas las trozas del patio que se ven"
      title="Elegir todas las del patio que se ven"
    />
  ) : null;

  return (
    <DataTable className={`w-full text-sm ${HOJA_MOVIL}`} wrapperClassName="max-w-full rounded-2xl bg-[var(--surface-raised)]">
      <thead className="bg-[var(--surface-sunken)]">
        <tr>
          {cols.map((c, i) => (
            <Cabecera key={c.key} col={c} orden={orden} onOrdenar={onOrdenar} antes={i === 0 ? casillaTodas : null} />
          ))}
          {permisoDe && (
            <th data-label="Permiso" className={TH}>
              Permiso
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 && (
          <tr>
            <td colSpan={nCols} className="px-3 py-8 text-center text-sm text-[var(--text-tertiary)]">
              {hayTrozas ? "Ninguna troza coincide con el filtro." : vacio}
            </td>
          </tr>
        )}
        {filas.map((f) => {
          const elegida = seleccion?.elegidas.has(f.code) ?? false;
          return (
            <tr
              key={f.code}
              data-troza={f.code}
              aria-selected={elegida || undefined}
              className={`border-t border-[var(--rule-soft)] ${
                resaltada === f.code
                  ? "bg-[var(--accent-soft)] outline outline-2 -outline-offset-2 outline-[var(--accent)]"
                  : elegida
                    ? "bg-[var(--accent-soft)]"
                    : "hover:bg-[var(--surface-sunken)]"
              }`}
            >
              {cols.map((c, i) => (
                <td key={c.key} className={`${TD} ${DERECHA.has(c.tipo) ? "text-right" : ""}`}>
                  {i === 0 && seleccion ? (
                    <span className="inline-flex items-center gap-2">
                      {f.estado === "disponible" ? (
                        <input
                          type="checkbox"
                          className={CASILLA}
                          checked={elegida}
                          onChange={() => seleccion.onElegir(f.code)}
                          aria-label={`Elegir la troza ${f.code}`}
                        />
                      ) : (
                        <span className="inline-block h-5 w-5 shrink-0" aria-hidden="true" />
                      )}
                      {celda(c.key, f, nav, conDiasAparte)}
                    </span>
                  ) : (
                    celda(c.key, f, nav, conDiasAparte)
                  )}
                </td>
              ))}
              {permisoDe && (
                <td className={`${TD} whitespace-nowrap text-xs text-[var(--text-secondary)]`}>{permisoDe(f.planId)}</td>
              )}
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

function Cabecera({
  col,
  orden,
  onOrdenar,
  antes,
}: {
  col: ColumnaTablero;
  orden: OrdenTablero | null;
  onOrdenar: (k: ColumnaKey) => void;
  /** La casilla «elegir todas», si la tabla tiene tanda (va en la primera columna). */
  antes?: ReactNode;
}) {
  const activa = orden?.key === col.key;
  const Icono = !activa ? ArrowUpDown : orden.dir === "asc" ? ArrowUp : ArrowDown;
  const boton = (
    <button
      type="button"
      onClick={() => onOrdenar(col.key)}
      title={`Ordenar por ${col.label.toLowerCase()}`}
      className={`inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-[var(--text-primary)] ${
        activa ? "text-[var(--text-primary)]" : ""
      }`}
    >
      {col.label}
      <Icono className={`h-3 w-3 ${activa ? "" : "opacity-40"}`} aria-hidden="true" />
    </button>
  );
  return (
    <th
      data-label={col.label}
      aria-sort={activa ? (orden.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`${TH} ${DERECHA.has(col.tipo) ? "text-right" : ""}`}
    >
      {antes ? (
        <span className="inline-flex items-center gap-2">
          {antes}
          {boton}
        </span>
      ) : (
        boton
      )}
    </th>
  );
}

const texto = (v: string | null, clase = "text-[var(--text-secondary)]"): ReactNode =>
  v ? <span className={clase}>{v}</span> : VACIO;

function celda(key: ColumnaKey, f: TrozaTablero, nav: NavTablero | undefined, conDiasAparte: boolean): ReactNode {
  switch (key) {
    case "code":
      return (
        <span className="whitespace-nowrap">
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
        </span>
      );
    case "arbol":
      return texto(f.treeCode, "font-mono text-[var(--text-secondary)]");
    case "especie":
      return texto(f.especie);
    case "cientifico":
      return texto(f.especieCientifica, "italic text-[var(--text-secondary)]");
    case "volumen":
      return f.volumenM3 != null ? (
        <span className="font-mono tabular-nums text-[var(--text-primary)]">{fmtM3(f.volumenM3)}</span>
      ) : (
        <span className="text-[var(--text-tertiary)]">sin medir</span>
      );
    case "estado":
      return (
        <span className="whitespace-nowrap">
          <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-bold ${TONO_ESTADO[f.estado].chip}`}>
            {f.estado === "fantasma" && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
            {ESTADOS_META[f.estado].label}
          </span>
          {conDiasAparte && f.estado === "disponible" && f.diasEnPatio != null && f.diasEnPatio > 0 && (
            <DiasEnPatio f={f} className="ml-1.5 text-xs" normal="text-[var(--text-tertiary)]">
              {f.diasEnPatio} d en patio
            </DiasEnPatio>
          )}
        </span>
      );
    case "gtf":
      return f.gtf ? (
        <button
          type="button"
          onClick={() => nav?.onVerGtf?.(f.gtf as string)}
          className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-xs font-bold text-[var(--data-info-700)] underline-offset-2 hover:underline dark:text-[var(--data-info-500)]"
        >
          <FileText className="h-3 w-3" aria-hidden="true" />
          {f.gtf}
        </button>
      ) : (
        VACIO
      );
    case "diasPatio": {
      const d = diasEnPatioDe(f);
      if (d == null) return VACIO;
      const sigue = f.estado === "disponible";
      return sigue ? (
        <DiasEnPatio f={f} className="font-mono tabular-nums font-bold" titulo="Sigue en el patio: días hasta hoy">
          {d} d
        </DiasEnPatio>
      ) : (
        <span title="Ya salió: días del trozado a la salida" className="font-mono tabular-nums text-[var(--text-secondary)]">
          {d} d
        </span>
      );
    }
    case "placa":
      return f.placa ? (
        <span className="whitespace-nowrap rounded-md border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-xs font-bold text-[var(--text-primary)]">
          {f.placa}
        </span>
      ) : (
        VACIO
      );
    case "fechaTrozado":
      // El día de Pucallpa (una línea con hora a las 20:00 ya es «mañana» en UTC).
      return texto(fechaCelda(f.diaTrozado ?? f.fecha), "font-mono tabular-nums text-[var(--text-secondary)]");
    case "fechaSalida":
      return texto(fechaCelda(f.fechaSalida), "font-mono tabular-nums text-[var(--text-secondary)]");
    case "fechaTala":
      return texto(fechaCelda(f.fechaTala), "font-mono tabular-nums text-[var(--text-secondary)]");
    case "transportista":
      return texto(f.transportista);
    case "conductor":
      return texto(f.conductor);
    case "destino":
      return texto(f.destino);
    case "diamMayor":
      return f.diamMayorM != null ? <span className="font-mono tabular-nums">{metros(f.diamMayorM)}</span> : VACIO;
    case "diamMenor":
      return f.diamMenorM != null ? <span className="font-mono tabular-nums">{metros(f.diamMenorM)}</span> : VACIO;
    case "largo":
      return f.largoM != null ? <span className="font-mono tabular-nums">{metros(f.largoM)}</span> : VACIO;
    case "plan":
      return texto(f.plan, "font-mono text-[var(--text-secondary)]");
    case "parcela":
      return texto(f.parcela);
    case "diasTalaSalida":
      return f.diasTalaASalida != null ? (
        <span className="font-mono tabular-nums text-[var(--text-secondary)]">{f.diasTalaASalida} d</span>
      ) : (
        VACIO
      );
    case "foto":
      return f.conFoto ? (
        <span className="text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">Sí</span>
      ) : (
        <span className="text-xs text-[var(--text-tertiary)]">No</span>
      );
    case "codDespacho":
      return texto(f.codigoDespacho, "font-mono text-[var(--text-secondary)]");
    case "linea":
      return f.lineNo != null ? <span className="font-mono tabular-nums text-[var(--text-tertiary)]">{f.lineNo}</span> : VACIO;
  }
}

/** Los días de una troza que sigue en el patio: ámbar desde 15, rojo desde 30. */
function DiasEnPatio({
  f,
  className,
  titulo,
  normal = "text-[var(--text-primary)]",
  children,
}: {
  f: TrozaTablero;
  className: string;
  titulo?: string;
  /** El color cuando todavía no preocupa. */
  normal?: string;
  children: ReactNode;
}) {
  const vieja = antiguedadEnPatio(f);
  return (
    <span
      title={vieja ? TITULO_VIEJA : titulo}
      className={`${className} ${vieja ? TONO_DIAS[vieja] : normal}`}
    >
      {children}
    </span>
  );
}
