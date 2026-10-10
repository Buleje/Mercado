"use client";

/**
 * Los datos de una línea del Libro TH dentro de su detalle
 * (`LothLineaDetalleModal`): la grilla de siempre y, para un despacho de
 * trozas (Brandon 08-10), lo que la fila no puede mostrar —especie y medidas
 * del trozado de esa troza, el árbol de origen, la guía (destino, placa,
 * transportista, conductor) y si ya entró al CTP— con sus acciones.
 */

import type { ReactNode } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, ClipboardCopy, FileText, Link2, QrCode } from "@buleje/design-system/icons";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { comoLineaDeTrozado, medidasDeLinea } from "@/lib/forestal/loth-despacho-medidas";
import { textoDelDespacho, type GuiaDelDespacho } from "@/lib/forestal/loth-despacho-por-guia";
import { diaCorto } from "@/lib/forestal/loth-aprovechamiento";
import { ingresarGtfAlCtp, verIngresosDelCtp } from "./LothGtfCtp";

const n = (v: string | null, dp = 4) => (v == null ? "—" : Number(v).toFixed(dp));

export const BOTON_DETALLE =
  "inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]";

const GRILLA = "grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-[var(--rule-soft)] p-3 text-sm sm:grid-cols-3";

export function Dato({ label, valor, mono }: { label: string; valor: ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</dt>
      <dd className={`text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`}>{valor}</dd>
    </div>
  );
}

/** La grilla de una línea cualquiera (tala, trozado, consumo, producto…). */
export function LineaDatos({ linea }: { linea: LothEntryDTO }) {
  return (
    <dl className={GRILLA}>
      <Dato label="Sección" valor={linea.section.replace(/_/g, " ")} />
      <Dato label="Cód. árbol" valor={linea.treeCode ?? "—"} mono />
      <Dato label="Cód. troza" valor={linea.trozaCode ?? "—"} mono />
      <Dato label="Especie" valor={linea.speciesCommon ?? "—"} />
      <Dato label="Científico" valor={linea.speciesScientific ?? "—"} />
      <Dato label="N° GTF" valor={linea.gtfNumber ?? "—"} mono />
      <Dato label="Ø mayor" valor={n(linea.diamMayorM, 2)} mono />
      <Dato label="Ø menor" valor={n(linea.diamMenorM, 2)} mono />
      <Dato label="Longitud" valor={n(linea.lengthM, 2)} mono />
      <Dato label="Volumen m³" valor={n(linea.volumeM3)} mono />
      <Dato label="Producto" valor={linea.productType ?? "—"} />
      <Dato label="Cantidad" valor={linea.quantity ? `${n(linea.quantity)} ${linea.unit ?? ""}` : "—"} mono />
      {linea.pieces != null && <Dato label="Piezas" valor={String(linea.pieces)} mono />}
      {linea.isRama && <Dato label="Origen" valor="Rama aprovechable" />}
      {linea.discarded && <Dato label="Descartado" valor="Sí" />}
      {linea.consumoInterno && <Dato label="Consumo interno" valor="Sí" />}
      {/* Item 3 de la RDE: el código va marcado en el fuste y en el tocón.
          Se muestra siempre en tala —incluso cuando falta— porque «no
          consta» es justamente lo que hay que poder ver antes de que lo
          vea un supervisor. */}
      {linea.section === "tala" && (
        <Dato
          label="Código marcado"
          valor={
            linea.marcadoFuste && linea.marcadoTocon
              ? "Fuste y tocón"
              : linea.marcadoFuste
                ? "Sólo el fuste — falta el tocón"
                : linea.marcadoTocon
                  ? "Sólo el tocón — falta el fuste"
                  : "No consta"
          }
        />
      )}
      {/* Internos: no salen en el formato SERFOR. */}
      {linea.motosierrista && <Dato label="Motosierrista · interno" valor={linea.motosierrista} />}
      {linea.horaTala && <Dato label="Hora de tala · interno" valor={linea.horaTala} mono />}
    </dl>
  );
}

const ESTADO_CTP: Record<string, string> = {
  ingresada: "Ya entró al CTP",
  por_ingresar: "Todavía no entra al CTP",
  otra_empresa: "Va a otra empresa (no a tu CTP)",
};

/** Un despacho de trozas: la troza (del trozado), la guía y el CTP. */
export function DespachoDatos({ linea, guia }: { linea: LothEntryDTO; guia: GuiaDelDespacho | null }) {
  const m = medidasDeLinea(linea);
  const t = linea.trozado;
  return (
    <div className="space-y-3">
      <dl className={GRILLA}>
        <Dato label="Cód. troza" valor={linea.trozaCode ?? "—"} mono />
        <Dato label="Árbol de origen" valor={m.arbol ?? "—"} mono />
        <Dato label="Especie" valor={m.especie ? `${m.especie}${m.cites ? " · CITES" : ""}` : "—"} />
        <Dato label="D1" valor={n(m.d1, 2)} mono />
        <Dato label="D2" valor={n(m.d2, 2)} mono />
        <Dato label="Largo" valor={n(m.largo, 2)} mono />
        <Dato label="Volumen m³" valor={n(m.m3)} mono />
        <Dato
          label="Medidas de"
          valor={t ? `Trozado N° ${t.lineNo}${t.anulada ? " (anulada)" : ""}` : "Sin trozado en este permiso"}
        />
        {m.cientifico && <Dato label="Científico" valor={m.cientifico} />}
      </dl>
      <dl className={GRILLA}>
        <Dato label="N° GTF" valor={linea.gtfNumber ?? "—"} mono />
        <Dato label="Fecha de la guía" valor={guia?.gtfDate ? diaCorto(guia.gtfDate) : diaCorto(linea.entryDate)} />
        <Dato
          label="Guía"
          valor={guia?.anulada ? "Anulada" : guia?.ctp ? ESTADO_CTP[guia.ctp] : guia ? "Emitida" : "No encontrada en las guías"}
        />
        <Dato label="Destino" valor={guia?.destino ? `${guia.destino}${guia.llegada ? ` · ${guia.llegada}` : ""}` : "—"} />
        <Dato label="Placa" valor={guia?.placa ?? "—"} mono />
        <Dato label="Transportista" valor={guia?.transportista ?? "—"} />
        <Dato label="Conductor" valor={guia?.conductor ?? "—"} />
      </dl>
    </div>
  );
}

/** Las acciones del detalle de un despacho, en el pie del modal. */
export function DespachoAcciones({
  linea,
  guia,
  hayCtp,
  onVerGuia,
  onVerCadena,
  onImprimirEtiqueta,
  onClose,
}: {
  linea: LothEntryDTO;
  guia: GuiaDelDespacho | null;
  hayCtp: boolean;
  onVerGuia: (gtf: string) => void;
  onVerCadena?: (code: string) => void;
  onImprimirEtiqueta?: (linea: LothEntryDTO) => void;
  onClose: () => void;
}) {
  const m = medidasDeLinea(linea);
  const gtf = linea.gtfNumber?.trim() || null;
  const arbolOTroza = m.arbol ?? linea.trozaCode;
  const ctp = guia?.ctp ?? null;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoDelDespacho(linea, guia, m));
      toast.success("Datos del despacho copiados");
    } catch {
      toast.error("No se pudo copiar: el navegador no dio permiso al portapapeles");
    }
  };
  return (
    <>
      {gtf && (
        <button type="button" className={BOTON_DETALLE} onClick={() => { onVerGuia(gtf); onClose(); }}>
          <FileText className="h-4 w-4" aria-hidden="true" /> Ver guía
        </button>
      )}
      {arbolOTroza && onVerCadena && (
        <button
          type="button"
          className={BOTON_DETALLE}
          title="La cadena de custodia del árbol: tala, trozas, despachos y guías"
          onClick={() => { onVerCadena(arbolOTroza); onClose(); }}
        >
          <Link2 className="h-4 w-4" aria-hidden="true" /> Trazabilidad del árbol
        </button>
      )}
      {linea.trozaCode && onImprimirEtiqueta && (
        <button type="button" className={BOTON_DETALLE} onClick={() => onImprimirEtiqueta(comoLineaDeTrozado(linea))}>
          <QrCode className="h-4 w-4" aria-hidden="true" /> Imprimir etiqueta
        </button>
      )}
      {hayCtp && gtf && !guia?.anulada && linea.status !== "anulado" && ctp !== "otra_empresa" && (
        ctp === "ingresada" ? (
          <button type="button" className={BOTON_DETALLE} onClick={() => { verIngresosDelCtp(); onClose(); }}>
            <Check className="h-4 w-4" aria-hidden="true" /> Ver en el CTP
          </button>
        ) : (
          <button type="button" className={BOTON_DETALLE} onClick={() => { ingresarGtfAlCtp(gtf); onClose(); }}>
            Ingresar al CTP <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )
      )}
      <button type="button" className={BOTON_DETALLE} onClick={() => void copiar()}>
        <ClipboardCopy className="h-4 w-4" aria-hidden="true" /> Copiar datos
      </button>
    </>
  );
}
