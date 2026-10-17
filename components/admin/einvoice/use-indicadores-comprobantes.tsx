"use client";

/**
 * Las cifras de Facturas y boletas (F38) en UN panel plegable
 * (`useKpisPlegables`). Salen del MISMO alcance que la tabla y el Excel (F36):
 * período, búsqueda, tipo, estado y origen, contadas en la base. Cada cifra
 * dice su período, cuántos documentos suma y su fórmula (ⓘ), y abre los
 * documentos que la forman. Una tasa sin muestra dice «Sin datos». Emitido,
 * aceptado y cobrado van separados: lo cobrado no vive acá (Caja/Conciliación).
 */
import type { ReactNode } from "react";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { textoRango, type Rango } from "@/lib/comprobantes/periodo";
import type { ResumenComprobantes } from "@/lib/comprobantes/resumen";
import { cn } from "@/lib/utils";
import type { FiltrosComprobantes } from "./filtros-comprobantes";
import { fmt, type DocStatus, type DocType } from "./tipos";

type Tono = "neutral" | "warning" | "danger";
type Alcance = Pick<FiltrosComprobantes, "tipos" | "estados">;

interface Tarjeta {
  rotulo: string;
  valor: string;
  /** Cuántos documentos suma la cifra (`null` = no aplica). */
  documentos: number | null;
  formula: string;
  ejemplo?: string;
  tono?: Tono;
  /** El alcance que muestra los documentos detrás de la cifra. */
  abre?: Alcance;
}

const BOL_FAC: DocType[] = ["boleta", "factura"];
const VIGENTES: DocStatus[] = ["aceptado", "pendiente"];
const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`;

function tarjetasDe(r: ResumenComprobantes): Tarjeta[] {
  const muestra = Math.max(0, r.documentos - r.pendientes - r.anulados);
  return [
    { rotulo: "Emitido vigente", valor: fmt(r.emitido), documentos: r.emitidoCantidad, formula: "Boletas y facturas aceptadas o esperando a SUNAT. No suma anuladas, rechazadas, notas ni bajas. Emitido no es cobrado.", ejemplo: "B001-12 por S/ 118 aceptada + F001-3 por S/ 59 esperando → S/ 177.", abre: { tipos: BOL_FAC, estados: VIGENTES } },
    { rotulo: "Aceptado por SUNAT", valor: fmt(r.aceptado), documentos: r.aceptadoCantidad, formula: "Boletas y facturas con constancia de SUNAT (CDR).", abre: { tipos: BOL_FAC, estados: ["aceptado"] } },
    { rotulo: "Esperando a SUNAT", valor: String(r.pendientes), documentos: r.pendientes, formula: "En cola o sin respuesta todavía. No los reemitas: consulta su estado; reemitir duplicaría el documento.", tono: r.pendientes > 0 ? "warning" : "neutral", abre: { tipos: [], estados: ["pendiente"] } },
    { rotulo: "Rechazados", valor: String(r.rechazados), documentos: r.rechazados, formula: "SUNAT los devolvió con error: corrígelos y emite de nuevo antes de la declaración mensual.", tono: r.rechazados > 0 ? "danger" : "neutral", abre: { tipos: [], estados: ["rechazado"] } },
    {
      rotulo: "Tasa de aceptación",
      valor: r.tasaAceptacion == null ? "Sin datos" : `${Math.round(r.tasaAceptacion * 1000) / 10} %`,
      documentos: muestra,
      formula: "Aceptados ÷ (aceptados + rechazados). Los que esperan respuesta y los anulados no cuentan. Sin aceptados ni rechazados en el alcance dice «Sin datos».",
      abre: { tipos: [], estados: ["aceptado", "rechazado"] },
    },
    { rotulo: "IGV de lo emitido", valor: fmt(r.igv), documentos: r.emitidoCantidad, formula: "IGV de las boletas y facturas vigentes (las mismas del «Emitido vigente»).", abre: { tipos: BOL_FAC, estados: VIGENTES } },
    { rotulo: "Notas de crédito", valor: fmt(r.notasImporte), documentos: r.notas, formula: "Importe de las notas de crédito electrónicas vigentes; la cuenta incluye todas sus situaciones. El detalle está en la pestaña Notas.", abre: { tipos: ["nota-credito"], estados: [] } },
    { rotulo: "Neto facturado", valor: fmt(r.neto), documentos: null, formula: "Emitido vigente − notas de crédito vigentes.", ejemplo: "S/ 177 emitido − S/ 18 de una nota = S/ 159." },
    { rotulo: "Boletas", valor: String(r.boletas), documentos: r.boletas, formula: "Boletas del alcance, en cualquier situación.", abre: { tipos: ["boleta"], estados: [] } },
    { rotulo: "Facturas", valor: String(r.facturas), documentos: r.facturas, formula: "Facturas del alcance, en cualquier situación.", abre: { tipos: ["factura"], estados: [] } },
  ];
}

const TONO_CIFRA: Record<Tono, string> = {
  neutral: "text-[var(--text-primary)]",
  warning: "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  danger: "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]",
};

function Cifra({ t, periodo, onAbrir }: { t: Tarjeta; periodo: string; onAbrir: (a: Alcance) => void }) {
  const cuerpo = (
    <>
      <span className={cn("block text-lg font-extrabold tabular-nums", TONO_CIFRA[t.tono ?? "neutral"])}>{t.valor}</span>
      {t.documentos != null && <span className="block text-sm text-[var(--text-secondary)]">{plural(t.documentos, "documento", "documentos")}</span>}
    </>
  );
  const abre = t.abre && t.documentos != null && t.documentos > 0 ? t.abre : null;
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{t.rotulo}</span>
        <InfoTip title={t.rotulo} what={t.formula} affects={`Período: ${periodo}.`} example={t.ejemplo} />
      </div>
      {abre ? (
        <button
          type="button"
          onClick={() => onAbrir(abre)}
          aria-label={`${t.rotulo}: ${t.valor}. Ver sus documentos`}
          title="Ver los documentos de esta cifra"
          className="-mx-1 block w-[calc(100%+0.5rem)] rounded-lg px-1 text-left hover:bg-[var(--surface-sunken)]"
        >
          {cuerpo}
        </button>
      ) : (
        cuerpo
      )}
    </div>
  );
}

interface Opciones {
  resumen: ResumenComprobantes | null;
  rango: Rango;
  sinDatosAun: boolean;
  /** Pone en la tabla el tipo/estado de la cifra (el resto del alcance queda). */
  onAbrir: (a: Alcance) => void;
}

export function useIndicadoresComprobantes({ resumen, rango, sinDatosAun, onAbrir }: Opciones) {
  const periodo = textoRango(rango);
  const r = resumen;
  const tarjetas: ReactNode[] = r ? tarjetasDe(r).map((t) => <Cifra key={t.rotulo} t={t} periodo={periodo} onAbrir={onAbrir} />) : [];
  const titular = r
    ? r.pendientes > 0
      ? `Emitido ${fmt(r.emitido)} · ${plural(r.pendientes, "esperando", "esperando")} a SUNAT`
      : `Emitido ${fmt(r.emitido)} · ${plural(r.emitidoCantidad, "documento", "documentos")}`
    : undefined;

  const encabezado = r ? (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-[var(--text-secondary)]" data-qa="kpis-comprobantes-periodo">
      <span className="font-semibold text-[var(--text-primary)]">{periodo}</span>
      <span>· {plural(r.documentos, "documento en el alcance", "documentos en el alcance")}</span>
      <span>· Emitido no es cobrado:</span>
      <button
        type="button"
        onClick={() => irAEnlace(hrefDeDestino({ tab: "facturacion", params: { vista: "seguimiento", sub: "conciliacion" } }))}
        className="min-h-12 rounded-xl px-1 font-semibold text-primary hover:underline"
      >
        ver lo cobrado en Conciliación
      </button>
    </p>
  ) : null;

  return useKpisPlegables({
    claveMemoria: "comprobantes-facturas",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun,
    resumen: titular,
    encabezado,
    tarjetas,
  });
}
