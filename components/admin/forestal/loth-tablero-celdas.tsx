/**
 * Las celdas de la tabla del tablero de trozas (`LothTableroTrozasTabla`):
 * cómo se dibuja cada columna de `COLUMNAS_TABLERO` y los días en patio en
 * ámbar (≥ 15) / rojo (≥ 30). Separado de la tabla para que ésta quede en su
 * cabecera, su tanda y su autofiltro.
 */

import type { ReactNode } from "react";
import { AlertTriangle, FileText } from "@buleje/design-system/icons";
import { diasEnPatioDe, type ColumnaKey } from "@/lib/forestal/loth-tablero-columnas";
import { ESTADOS_META, antiguedadEnPatio, type TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { fechaCelda } from "./loth-tablero-partes";
import { TONO_ESTADO } from "./loth-tablero-estilos";
import type { NavTablero } from "./LothTableroTrozasTabla";

/** Lo que lleva demasiado en el patio: la madera rolliza se mancha (mancha azul). */
const TONO_DIAS = {
  critico: "rounded-md bg-[var(--data-error-50)] px-1.5 py-0.5 font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
  atencion: "rounded-md bg-[var(--data-warning-50)] px-1.5 py-0.5 font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]",
} as const;
const TITULO_VIEJA = "Lleva demasiado en el patio: la madera rolliza se mancha (mancha azul)";

const VACIO = <span className="text-xs text-[var(--text-tertiary)]">—</span>;
const metros = (n: number) => formatNumber(n, { min: 2, max: 3 });

const texto = (v: string | null, clase = "text-[var(--text-secondary)]"): ReactNode =>
  v ? <span className={clase}>{v}</span> : VACIO;

export function celda(key: ColumnaKey, f: TrozaTablero, nav: NavTablero | undefined, conDiasAparte: boolean): ReactNode {
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
