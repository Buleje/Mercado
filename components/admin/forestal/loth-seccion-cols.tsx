/**
 * Las columnas de cada sección del Libro TH (`COLS_SECCION`) y las celdas que
 * dibujan. Salieron de `LothLibroOperaciones` (08-10) cuando Despacho de
 * trozas ganó sus medidas: el módulo pasaba de 1.800 líneas.
 *
 * Despacho de trozas (Brandon 08-10): especie, D1, D2, Largo y m³ leídos del
 * Trozado de esa troza (`lib/forestal/loth-despacho-medidas`); «Cód. despacho»
 * arranca oculta (vacío en 22 de 22 líneas de Blas).
 */

import type { ReactNode } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { LothEntryDTO, LothSection } from "@/lib/forestal/loth-constants";
import { medidasDeLinea } from "@/lib/forestal/loth-despacho-medidas";
import type { ColDef } from "./loth-seccion-celdas";
import { etiquetaUnidad as unitLabel } from "./loth-seccion-filtros";
import { GtfConCtp } from "./LothGtfCtp";

type LothEntry = LothEntryDTO;
type Col = ColDef;

const num = (v: string | null, dp = 4) => (v == null ? "—" : Number(v).toFixed(dp));

/** Una medida del despacho: la del trozado de su troza; sin trozado encontrado, «—». */
const medida = (e: LothEntry, campo: "d1" | "d2" | "largo" | "m3", dp: number) => num(medidasDeLinea(e)[campo], dp);

export const COLS_SECCION: Record<LothSection, Col[]> = {
  tala: [
    { key: "tree", label: "Cód. árbol", orden: "codigo", render: (e) => <Code v={e.treeCode} rama={e.isRama} marcado={estadoMarcadoDe(e)} /> },
    { key: "esp", label: "Especie", orden: "especie", render: (e) => <Species e={e} /> },
    { key: "dM", label: "Ø may", align: "right", render: (e) => <Mono v={num(e.diamMayorM, 2)} /> },
    { key: "dm", label: "Ø men", align: "right", render: (e) => <Mono v={num(e.diamMenorM, 2)} /> },
    { key: "L", label: "Long.", align: "right", render: (e) => <Mono v={num(e.lengthM, 2)} /> },
    { key: "vol", label: "Vol. m³", align: "right", orden: "volumen", render: (e) => <Mono v={num(e.volumeM3)} bold /> },
  ],
  trozado: [
    { key: "troza", label: "Cód. troza", orden: "codigo", render: (e) => <Code v={e.trozaCode} rama={e.isRama} /> },
    { key: "esp", label: "Especie", orden: "especie", render: (e) => <Species e={e} /> },
    { key: "dM", label: "Ø may", align: "right", render: (e) => <Mono v={num(e.diamMayorM, 2)} /> },
    { key: "dm", label: "Ø men", align: "right", render: (e) => <Mono v={num(e.diamMenorM, 2)} /> },
    { key: "L", label: "Long.", align: "right", render: (e) => <Mono v={num(e.lengthM, 2)} /> },
    { key: "vol", label: "Vol. m³", align: "right", orden: "volumen", render: (e) => <Mono v={num(e.volumeM3)} bold /> },
  ],
  despacho_troza: [
    { key: "troza", label: "Cód. troza", orden: "codigo", render: (e) => <Code v={e.trozaCode} /> },
    { key: "esp", label: "Especie", orden: "especie", render: (e) => <SpeciesDelDespacho e={e} /> },
    { key: "dM", label: "D1", align: "right", render: (e) => <Mono v={medida(e, "d1", 2)} /> },
    { key: "dm", label: "D2", align: "right", render: (e) => <Mono v={medida(e, "d2", 2)} /> },
    { key: "L", label: "Largo", align: "right", render: (e) => <Mono v={medida(e, "largo", 2)} /> },
    { key: "vol", label: "m³", align: "right", orden: "volumen", render: (e) => <Mono v={medida(e, "m3", 4)} bold /> },
    { key: "desp", label: "Cód. despacho", ocultaPorDefecto: true, render: (e) => <span className="text-[var(--text-secondary)]">{e.despachoCode ?? "—"}</span> },
    // La guía es el puente al Libro CTP: la celda dice si ya entró a la planta.
    { key: "gtf", label: "N° GTF", render: (e) => <GtfConCtp gtf={e.gtfNumber} /> },
  ],
  consumo_troza: [
    { key: "troza", label: "Cód. troza", orden: "codigo", render: (e) => <Code v={e.trozaCode} /> },
    { key: "esp", label: "Especie", orden: "especie", render: (e) => <Species e={e} /> },
    { key: "vol", label: "Vol. m³", align: "right", orden: "volumen", render: (e) => <Mono v={num(e.volumeM3)} bold /> },
    { key: "ci", label: "", render: (e) => (e.consumoInterno ? <Tag>consumo interno</Tag> : null) },
  ],
  producto_terminado: [
    { key: "prod", label: "Producto", render: (e) => <span className="font-medium text-[var(--text-primary)]">{e.productType ?? "—"}</span> },
    { key: "esp", label: "Especie", orden: "especie", render: (e) => <Species e={e} /> },
    { key: "qty", label: "Cantidad", align: "right", orden: "volumen", render: (e) => <Mono v={num(e.quantity)} bold /> },
    { key: "unit", label: "Unidad", render: (e) => <span className="text-[var(--text-secondary)]">{unitLabel(e.unit)}</span> },
  ],
  despacho_producto: [
    { key: "gtf", label: "N° GTF", render: (e) => <Mono v={e.gtfNumber ?? "—"} bold /> },
    { key: "prod", label: "Producto", render: (e) => <span className="font-medium text-[var(--text-primary)]">{e.productType ?? "—"}</span> },
    { key: "esp", label: "Especie", orden: "especie", render: (e) => <Species e={e} /> },
    { key: "pcs", label: "Piezas", align: "right", render: (e) => <Mono v={e.pieces?.toString() ?? "—"} /> },
    { key: "qty", label: "Cantidad", align: "right", orden: "volumen", render: (e) => <Mono v={num(e.quantity)} bold /> },
    { key: "unit", label: "Unidad", render: (e) => <span className="text-[var(--text-secondary)]">{unitLabel(e.unit)}</span> },
  ],
};

function Mono({ v, bold }: { v: string; bold?: boolean }) {
  return <span className={`font-mono tabular-nums text-[var(--text-primary)] ${bold ? "font-bold" : ""}`}>{v}</span>;
}
function Code({ v, rama, marcado }: { v: string | null; rama?: boolean; marcado?: "completo" | "parcial" | "sin" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono font-bold text-[var(--text-primary)]">{v ?? "—"}</span>
      {rama && <span className="rounded bg-[var(--surface-sunken)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">R</span>}
      {marcado && marcado !== "sin" && (
        <span
          title={
            marcado === "completo"
              ? "Código marcado en el fuste y en el tocón (RDE 264-2019, item 3)"
              : "Marcado declarado a medias: falta el fuste o el tocón"
          }
          className={`rounded px-1 text-[length:var(--ts-2xs)] font-bold ${
            marcado === "completo"
              ? "bg-[var(--data-success-50)] text-[var(--data-success-700)]"
              : "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]"
          }`}
        >
          {marcado === "completo" ? "M" : "M·"}
        </span>
      )}
    </span>
  );
}

/**
 * El marcado físico del item 3 se guardaba y no se veía en ninguna parte: un
 * dato que no se puede leer no existe para quien fiscaliza. Va como pastilla
 * junto al código —no como columna nueva— para no ensanchar una tabla que ya
 * tiene seis.
 */
function estadoMarcadoDe(e: LothEntryDTO): "completo" | "parcial" | "sin" {
  const f = e.marcadoFuste === true;
  const t = e.marcadoTocon === true;
  if (f && t) return "completo";
  if (f || t) return "parcial";
  return "sin";
}
function Species({ e }: { e: LothEntry }) {
  if (!e.speciesCommon) return <span className="text-[var(--text-tertiary)]">—</span>;
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-[var(--text-primary)]">{e.speciesCommon}</span>
        {e.cites && <span className="rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
      </div>
      {e.speciesScientific && <div className="text-xs italic text-[var(--text-tertiary)]">{e.speciesScientific}</div>}
    </div>
  );
}
function Tag({ children, tone }: { children: ReactNode; tone?: "danger" }) {
  const cls = tone === "danger"
    ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]"
    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return <span className={`rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide ${cls}`}>{children}</span>;
}

/**
 * La especie de una troza despachada: la de su trozado. Si el trozado que se
 * lee está anulado (la troza se volvió a medir o se dio de baja), se avisa.
 */
function SpeciesDelDespacho({ e }: { e: LothEntry }) {
  const m = medidasDeLinea(e);
  if (!e.trozado) {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--text-tertiary)]">
        —
        <InfoTip
          title="Sin trozado"
          what="No se encontró la línea de Trozado de esta troza en el mismo permiso: sin ella no hay especie ni medidas."
          example="Asienta el trozado de la troza (o corrige su código) y la fila se completa sola."
        />
      </span>
    );
  }
  return (
    <span className="inline-flex items-start gap-1">
      <Species e={{ ...e, speciesCommon: m.especie, speciesScientific: m.cientifico, cites: m.cites }} />
      {e.trozado.anulada && (
        <InfoTip
          title="Trozado anulado"
          what={`Las medidas salen de la línea de Trozado N° ${e.trozado.lineNo}, que está anulada.`}
          example="Si la troza se volvió a medir, corrige el trozado para que el despacho lea la medida vigente."
        />
      )}
    </span>
  );
}
