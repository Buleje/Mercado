"use client";

/**
 * Análisis y conciliación documental (N08): por período, lo vendido frente a lo
 * facturado — pedidos sin comprobante, comprobantes sin pedido, notas por
 * motivo y el mostrador — con emitido, aceptado y cobrado por separado. Sólo
 * lectura; los totales los arma el servidor.
 */
import { useRef, useState } from "react";
import { LoadingState } from "@buleje/design-system";
import { RefreshCw } from "@buleje/design-system/icons";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { button } from "@/components/ui-system/button-variants";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { esPeriodo, textoRango, type PeriodoClave } from "@/lib/comprobantes/periodo";
import type { TipoDiferencia } from "@/lib/comprobantes/conciliacion";
import { SelectorPeriodo } from "../SelectorPeriodo";
import { ConciliacionCifras } from "./ConciliacionCifras";
import { ConciliacionDiferencias } from "./ConciliacionDiferencias";
import { useConciliacion } from "./use-conciliacion";

/** Estado de la conciliación → filtro de Estado de Facturas y boletas (`?estado=` en csv). */
const ESTADO_EN_FACTURAS: Record<string, string> = {
  vigentes: "aceptado,pendiente",
  aceptado: "aceptado",
  pendiente: "pendiente",
  rechazado: "rechazado",
  anulado: "anulado",
};

export function ConciliacionDocumental() {
  const [guardado, setPeriodo] = useLocalStorage<string>("comprobantes-conciliacion-periodo", "mes");
  const periodo: PeriodoClave = esPeriodo(guardado) ? guardado : "mes";
  const { carga, recargar } = useConciliacion(periodo);
  const [tipo, setTipo] = useState<TipoDiferencia | null>(null);
  const refDiferencias = useRef<HTMLDivElement>(null);

  const verComprobantes = (estado: string) =>
    irAEnlace(hrefDeDestino({ tab: "facturacion", params: { vista: "facturas", estado: ESTADO_EN_FACTURAS[estado] ?? estado, periodo } }));
  const verNotas = () => irAEnlace(hrefDeDestino({ tab: "facturacion", params: { vista: "notas" } }));
  const verDiferencias = (t: TipoDiferencia) => {
    setTipo(t);
    requestAnimationFrame(() => refDiferencias.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const c = carga.fase === "listo" ? carga.conciliacion : null;
  const vacio = c != null && c.pedidos.todos.cantidad === 0 && c.comprobantes.emitido.cantidad === 0 && c.comprobantes.rechazado.cantidad === 0 && c.notas.emitidas.cantidad === 0 && c.mostrador.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SelectorPeriodo valor={periodo} onCambiar={(p) => { setTipo(null); setPeriodo(p); }} qa="conciliacion-periodo" />
        {c && <span className="text-sm text-[var(--text-secondary)]">{textoRango(c.rango)}</span>}
        <button
          type="button"
          onClick={recargar}
          disabled={carga.fase === "cargando"}
          aria-label="Actualizar la conciliación"
          title="Actualizar"
          className={button({ variant: "ghost", size: "icon", className: "ml-auto rounded-xl" })}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {carga.fase === "cargando" ? (
        <LoadingState message="Cruzando pedidos, comprobantes y notas…" />
      ) : carga.fase === "error" ? (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
          {carga.mensaje}
        </p>
      ) : vacio ? (
        <div className="flex flex-wrap items-center gap-3 py-6 text-sm text-[var(--text-secondary)]">
          Sin pedidos, comprobantes ni notas en este período.
          {periodo !== "todo" && (
            <button type="button" onClick={() => setPeriodo("todo")} className={button({ variant: "secondary", className: "rounded-xl" })}>
              Ver todo
            </button>
          )}
        </div>
      ) : (
        c && (
          <>
            <ConciliacionCifras c={c} onVerComprobantes={verComprobantes} onVerDiferencias={verDiferencias} onVerNotas={verNotas} />
            <div ref={refDiferencias} className="scroll-mt-24">
              <ConciliacionDiferencias c={c} tipo={tipo} onTipo={setTipo} />
            </div>
          </>
        )
      )}
    </div>
  );
}
