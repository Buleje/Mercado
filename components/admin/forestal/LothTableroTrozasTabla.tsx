"use client";

/**
 * La tabla del tablero de trozas: las columnas que el usuario eligió, cada
 * cabecera ordena (asc → desc → sin orden).
 *
 * A 400 px el shell del panel la vuelve tarjetas sola (`useMobileTableCards`
 * + `.admin-mobile-cards`): cada `<th>` lleva `data-label` con su nombre, para
 * que el botón de orden no se cuele en el rótulo de la tarjeta.
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
import { ESTADOS_META, type TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { TONO, fechaCelda } from "./loth-tablero-partes";

export type NavTablero = {
  onVerCadena?: (code: string) => void;
  onVerGtf?: (gtf: string) => void;
  /** «Árbol en el mapa» del escáner. Sin esto, navega por la URL (`?vista=mapa&arbol=`). */
  onVerArbol?: (treeCode: string) => void;
  /** «Registrar su despacho» del escáner. Sin esto, va a la sección Despacho por la URL. */
  onRegistrarDespacho?: (code: string) => void;
};

const TH = "px-3 py-2.5 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const TD = "px-3 py-2.5 align-middle";
const DERECHA = new Set(["numero", "m3", "metros", "dias"]);

const VACIO = <span className="text-xs text-[var(--text-tertiary)]">—</span>;
const metros = (n: number) => formatNumber(n, { min: 2, max: 3 });

export default function LothTableroTrozasTabla({
  filas,
  hayTrozas,
  visibles,
  orden,
  onOrdenar,
  nav,
}: {
  filas: readonly TrozaTablero[];
  /** ¿Hay alguna troza en el libro? Distingue «vacío» de «el filtro no deja nada». */
  hayTrozas: boolean;
  visibles: readonly ColumnaKey[];
  orden: OrdenTablero | null;
  onOrdenar: (k: ColumnaKey) => void;
  nav?: NavTablero;
}) {
  const cols = COLUMNAS_TABLERO.filter((c) => visibles.includes(c.key));
  const conDiasAparte = !visibles.includes("diasPatio");

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <DataTable className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)]">
          <tr>
            {cols.map((c) => (
              <Cabecera key={c.key} col={c} orden={orden} onOrdenar={onOrdenar} />
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="px-3 py-8 text-center text-sm text-[var(--text-tertiary)]">
                {hayTrozas ? "Ninguna troza coincide con el filtro." : "Todavía no hay trozas registradas en el libro."}
              </td>
            </tr>
          )}
          {filas.map((f) => (
            <tr key={f.code} className="border-t border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]">
              {cols.map((c) => (
                <td key={c.key} className={`${TD} ${DERECHA.has(c.tipo) ? "text-right" : ""}`}>
                  {celda(c.key, f, nav, conDiasAparte)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

function Cabecera({
  col,
  orden,
  onOrdenar,
}: {
  col: ColumnaTablero;
  orden: OrdenTablero | null;
  onOrdenar: (k: ColumnaKey) => void;
}) {
  const activa = orden?.key === col.key;
  const Icono = !activa ? ArrowUpDown : orden.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      data-label={col.label}
      aria-sort={activa ? (orden.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`${TH} ${DERECHA.has(col.tipo) ? "text-right" : ""}`}
    >
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
            <span className="ml-1.5 rounded bg-[var(--data-info-50)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)]">
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
          <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-bold ${TONO[f.estado].chip}`}>
            {f.estado === "fantasma" && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
            {ESTADOS_META[f.estado].label}
          </span>
          {conDiasAparte && f.estado === "disponible" && f.diasEnPatio != null && f.diasEnPatio > 0 && (
            <span className="ml-1.5 text-xs text-[var(--text-tertiary)]">{f.diasEnPatio} d en patio</span>
          )}
        </span>
      );
    case "gtf":
      return f.gtf ? (
        <button
          type="button"
          onClick={() => nav?.onVerGtf?.(f.gtf as string)}
          className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-xs font-bold text-[var(--data-info-700)] underline-offset-2 hover:underline"
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
      return (
        <span
          title={sigue ? "Sigue en el patio: días hasta hoy" : "Ya salió: días del trozado a la salida"}
          className={`font-mono tabular-nums ${sigue ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
        >
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
      return texto(fechaCelda(f.fecha), "font-mono tabular-nums text-[var(--text-secondary)]");
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
        <span className="text-xs font-bold text-[var(--data-success-700)]">Sí</span>
      ) : (
        <span className="text-xs text-[var(--text-tertiary)]">No</span>
      );
    case "codDespacho":
      return texto(f.codigoDespacho, "font-mono text-[var(--text-secondary)]");
    case "linea":
      return f.lineNo != null ? <span className="font-mono tabular-nums text-[var(--text-tertiary)]">{f.lineNo}</span> : VACIO;
  }
}
