/**
 * Las columnas de la tabla GTF del Libro TH: el tipo de la guía, la fila
 * derivada (origen, tipo de plan, permiso, estados CTP), el autofiltro de cada
 * columna y las celdas de cabecera y cuerpo. La tabla vive en `LothGtfTabla`.
 */

import type { ReactNode } from "react";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatDateNumeric } from "@/lib/format";
import { ETIQUETA_ORIGEN, origenDeGuia, type OrigenDeGuia } from "@/lib/forestal/gtf-origen";
import {
  ETIQUETA_ESTADO_GTF,
  estadosDeGuia,
  resolucionDeGuia,
  tipoPlanDeGuia,
  type EstadoCtpGuia,
  type EstadoGtf,
  type PlanDeLaGuia,
} from "@/lib/forestal/gtf-columnas";
import type { ColumnaElegible } from "@/components/admin/shared/columnas-ordenables";
import { FiltroEnCabecera, type ColumnaFiltro, type FiltrosTabla } from "./filtros-tabla-forestal";
import GtfOrigenChip from "./GtfOrigenChip";
import ChipPapelesGtf from "./ChipPapelesGtf"; // ADR-482

export interface GtfItem {
  /** `code` = código único del libro; `codigoGuia` = el impreso en la guía si difiere (ADR-474). */
  code?: string | null; codigoGuia?: string | null; species?: string | null; scientific?: string | null; cites?: boolean;
  diamMayorM?: number | null; diamMenorM?: number | null; lengthM?: number | null; volumeM3?: number | null;
}
export interface Gtf {
  id: string; gtfNumber: string; gtfDate: string | null; tipo: string;
  titularName: string | null; tituloHabilitante: string | null; parcelaCorta: string | null;
  transportista: string | null; transportistaDoc: string | null; conductor: string | null;
  conductorLicencia: string | null; placaVehiculo: string | null; origen: string | null; destino: string | null;
  items: GtfItem[] | null; volumenTotalM3: string | null; piezasTotal: number | null;
  observations: string | null; status: string; annulledReason: string | null;
  /** Casilleros completos (2)–(38): sólo las guías hechas con «Despachar con guía». */
  gtfDatos?: unknown;
  /** El plan de manejo al que está atada (de él salen el tipo de plan y la resolución). */
  planId?: string | null;
  /** Dónde está en el Libro CTP (`?conCtp=1`); sólo guías de trozas vivas. */
  ctp?: EstadoCtpGuia | null;
  /** Borrada del libro (sólo llega con `?estado=bajas`). */
  deletedAt?: string | null;
  /** Última modificación: en una anulada, la fecha de la baja. */
  updatedAt?: string;
}

/** Una guía con lo que la tabla deriva de ella, calculado una vez por carga. */
export interface FilaGtf {
  g: Gtf;
  origen: OrigenDeGuia;
  tipoPlan: string | null;
  resolucion: string | null;
  estados: EstadoGtf[];
}

export function filasGtf(gtfs: readonly Gtf[], planes: ReadonlyMap<string, PlanDeLaGuia>): FilaGtf[] {
  return gtfs.map((g) => {
    const plan = g.planId ? planes.get(g.planId) : null;
    return {
      g,
      origen: origenDeGuia(g.observations),
      tipoPlan: tipoPlanDeGuia(plan, g.gtfDatos, g.tituloHabilitante),
      resolucion: resolucionDeGuia(plan, g.gtfDatos),
      estados: estadosDeGuia(g),
    };
  });
}

/** Las columnas movibles, en su orden de fábrica. «Acciones» queda fija al final. */
export const ORDEN_GTF_DEFECTO = [
  "gtf", "origen", "registro", "fecha", "tipoPlan", "permiso", "tipo", "titular", "destino", "volumen", "estado",
] as const;

/* «permiso» arranca oculta: es la columna más ancha (código de 20+ letras y su
   resolución debajo) y, con un permiso elegido en el libro, repite el mismo
   valor en todas las filas. «registro» va visible: ya se veía bajo el Origen. */
export const COLUMNAS_GTF: readonly ColumnaElegible[] = [
  { id: "gtf", label: "N° GTF" },
  { id: "origen", label: "Origen" },
  { id: "registro", label: "N° de registro" },
  { id: "fecha", label: "Fecha" },
  { id: "tipoPlan", label: "Tipo de plan" },
  { id: "permiso", label: "N° de permiso / resolución", ocultaPorDefecto: true },
  { id: "tipo", label: "Tipo" },
  { id: "titular", label: "Titular" },
  { id: "destino", label: "Destino" },
  { id: "volumen", label: "Vol. m³" },
  { id: "estado", label: "Estado" },
];

const fmtDate = (iso: string | null) => (iso ? formatDateNumeric(iso, { soloFecha: true }) : "—");
const ddmm = (v: number | string) => (typeof v === "string" && v.length >= 10 ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : String(v));

/** El autofiltro de cada columna (estable: constante de módulo). */
export const FILTROS_GTF: readonly ColumnaFiltro<FilaGtf>[] = [
  { id: "gtf", label: "N° GTF", tipo: "texto", valor: (f) => f.g.gtfNumber },
  { id: "origen", label: "Origen", tipo: "multi", valor: (f) => ETIQUETA_ORIGEN[f.origen.origen] },
  { id: "registro", label: "N° de registro", tipo: "texto", valor: (f) => f.origen.registro },
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (f) => f.g.gtfDate?.slice(0, 10) ?? null, formatearValor: ddmm },
  { id: "tipoPlan", label: "Tipo de plan", tipo: "multi", valor: (f) => f.tipoPlan ?? "Sin tipo de plan" },
  {
    id: "permiso",
    label: "N° de permiso / resolución",
    tipo: "texto",
    valor: (f) => [f.g.tituloHabilitante, f.resolucion].filter((x): x is string => !!x),
  },
  { id: "tipo", label: "Tipo", tipo: "multi", valor: (f) => (f.g.tipo === "producto" ? "Producto" : "Trozas") },
  { id: "titular", label: "Titular", tipo: "texto", valor: (f) => f.g.titularName },
  { id: "destino", label: "Destino", tipo: "texto", valor: (f) => f.g.destino },
  {
    id: "volumen",
    label: "Vol. m³",
    tipo: "rango",
    numero: (f) => (f.g.volumenTotalM3 == null ? null : Number(f.g.volumenTotalM3)),
    unidad: "m³",
    paso: 0.001,
  },
  { id: "estado", label: "Estado", tipo: "multi", valor: (f) => f.estados.map((e) => ETIQUETA_ESTADO_GTF[e]) },
];

const ESTILO_ESTADO: Record<EstadoGtf, string> = {
  emitida: "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]",
  anulada: "bg-[var(--data-error-100)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
  ingresada: "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]",
  por_ingresar: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]",
  otra_empresa: "bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
};

function EstadosGtf({ estados }: { estados: readonly EstadoGtf[] }) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {estados.map((e) => (
        <span key={e} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${ESTILO_ESTADO[e]}`}>
          {ETIQUETA_ESTADO_GTF[e]}
        </span>
      ))}
    </span>
  );
}

const TH = "px-3 py-2.5 font-bold text-[var(--text-primary)]";
const TD = "px-3 py-2.5";

function Th({ id, f, children, className = "" }: { id: string; f: FiltrosTabla<FilaGtf>; children: ReactNode; className?: string }) {
  return (
    <th data-col={id} className={`${TH} ${className}`}>
      <span className="whitespace-nowrap">
        {children}
        <FiltroEnCabecera id={id} f={f} compacto />
      </span>
    </th>
  );
}

/** Los `<th>` movibles, cada uno con su autofiltro compacto (embudo o lupa). */
export function cabecerasGtf(f: FiltrosTabla<FilaGtf>): Record<string, ReactNode> {
  return {
    gtf: <Th id="gtf" f={f}>N° GTF</Th>,
    origen: <Th id="origen" f={f}>Origen</Th>,
    registro: <Th id="registro" f={f}>N° de registro</Th>,
    fecha: <Th id="fecha" f={f}>Fecha</Th>,
    tipoPlan: <Th id="tipoPlan" f={f}>Tipo de plan</Th>,
    permiso: <Th id="permiso" f={f}>N° de permiso / resolución</Th>,
    tipo: <Th id="tipo" f={f}>Tipo</Th>,
    titular: <Th id="titular" f={f}>Titular</Th>,
    destino: <Th id="destino" f={f}>Destino</Th>,
    volumen: <Th id="volumen" f={f} className="text-right">Vol. m³</Th>,
    estado: <Th id="estado" f={f}>Estado</Th>,
  };
}

/** Las celdas movibles de una fila (las `data-label` las lee la vista en tarjetas). */
export function celdasGtf({ g, origen, tipoPlan, resolucion, estados }: FilaGtf): Record<string, ReactNode> {
  return {
    gtf: <td data-label="N° GTF" className={TD}><span className="block font-mono font-bold text-[var(--text-primary)]">{g.gtfNumber}</span><ChipPapelesGtf g={g} /></td>,
    origen: <td data-label="Origen" className={TD}><GtfOrigenChip origen={origen.origen} registro={origen.registro} /></td>,
    registro: (
      <td data-label="N° de registro" className={`${TD} whitespace-nowrap font-mono text-[var(--text-secondary)]`}>
        {origen.registro ?? "—"}
      </td>
    ),
    fecha: <td data-label="Fecha" className={`${TD} whitespace-nowrap text-[var(--text-secondary)]`}>{fmtDate(g.gtfDate)}</td>,
    tipoPlan: <td data-label="Tipo de plan" className={`${TD} whitespace-nowrap font-semibold text-[var(--text-primary)]`}>{tipoPlan ?? "—"}</td>,
    permiso: (
      <td data-label="N° de permiso / resolución" className={TD}>
        <span className="block font-mono text-[var(--text-primary)]">{g.tituloHabilitante ?? "—"}</span>
        {resolucion && <span className="block font-mono text-xs text-[var(--text-tertiary)]">Res. {resolucion}</span>}
      </td>
    ),
    tipo: (
      <td data-label="Tipo" className={TD}>
        <span className="rounded-full bg-[var(--surface-canvas)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
          {g.tipo === "producto" ? "Producto" : "Trozas"}
        </span>
      </td>
    ),
    titular: <td data-label="Titular" className={`${TD} text-[var(--text-primary)]`}>{g.titularName ?? "—"}</td>,
    destino: <td data-label="Destino" className={`${TD} text-[var(--text-secondary)]`}>{g.destino ?? "—"}</td>,
    volumen: (
      <td data-label="Vol. m³" className={`${TD} text-right`}>
        <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
          {g.volumenTotalM3 ? fmtM3(Number(g.volumenTotalM3)) : "—"}
        </span>
      </td>
    ),
    estado: <td data-label="Estado" className={TD}><EstadosGtf estados={estados} /></td>,
  };
}
