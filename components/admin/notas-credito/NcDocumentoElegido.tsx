"use client";

import { Loader2, RotateCcw, AlertTriangle, CheckCircle2 } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { DOC_STYLE, diaYFecha, type SaleDoc } from "@/components/admin/notas-credito/nc-compartido";
import type { useRemanenteDocumento } from "@/components/admin/notas-credito/hooks/use-remanente-documento";

/**
 * El documento elegido en el paso 1 (auditoría F09, 17-10): cliente, fecha, líneas, lo ya acreditado y
 * lo que queda. Antes sólo decía «Documento seleccionado» y el tope aparecía recién al guardar.
 */
export default function NcDocumentoElegido({ venta, remanente, onQuitar }: {
  venta: SaleDoc;
  remanente: ReturnType<typeof useRemanenteDocumento>;
  onQuitar: () => void;
}) {
  const estilo = DOC_STYLE[venta.comprobanteTipo] || DOC_STYLE.ticket;
  const d = remanente.datos;
  const r = d?.remanente;
  const entera = !!r && r.disponibleConIgv <= 0;
  return (
    <div data-qa="nc-documento-elegido" className={cn("rounded-xl border-2 p-4 space-y-3", entera ? "border-[var(--data-warning-500)] bg-[var(--data-warning-50)]" : "border-primary/30 bg-primary/5")}>
      <div className="flex flex-wrap items-center gap-2">
        <estilo.icon className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />
        <span className={cn("px-2 py-0.5 rounded-lg text-sm font-bold uppercase", estilo.badge)}>{estilo.label}</span>
        <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{venta.comprobanteNumero || `#${venta.número}`}</span>
        <span className="min-w-0 truncate text-sm text-[var(--text-secondary)]">
          · {venta.clienteNombre}{venta.clienteDocumento ? ` (${venta.clienteDocumento})` : ""}
        </span>
        <div className="flex-1" />
        <button type="button" onClick={onQuitar} className="min-h-12 rounded-xl px-3 text-sm font-bold text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] hover:underline">
          Quitar
        </button>
      </div>

      <p className="text-sm text-[var(--text-secondary)]">
        {venta.fecha ? diaYFecha(venta.fecha) : "Sin fecha"} · cobró <strong className="text-[var(--text-primary)]">{formatCurrency(venta.total)}</strong>
        {venta.items.length > 0 && <> · {venta.items.slice(0, 3).map((it) => `${it.cantidad} × ${it.nombre}`).join(", ")}{venta.items.length > 3 ? ` y ${venta.items.length - 3} más` : ""}</>}
      </p>

      {remanente.cargando && !d ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo lo que queda por acreditar…
        </p>
      ) : remanente.error ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--data-error-500)]">
          <AlertTriangle className="h-4 w-4" aria-hidden /> {remanente.error}
          <button type="button" onClick={remanente.recargar} className="inline-flex min-h-12 items-center gap-1 rounded-xl px-3 font-bold hover:bg-[var(--data-error-50)]">
            <RotateCcw className="h-4 w-4" aria-hidden /> Reintentar
          </button>
        </div>
      ) : r ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {entera ? (
            <span className="inline-flex items-center gap-1 font-bold text-[var(--data-warning-ink)]">
              <AlertTriangle className="h-4 w-4" aria-hidden /> Ya está acreditada entera: no admite otra nota
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Queda {formatCurrency(r.disponibleConIgv)} por acreditar
            </span>
          )}
          <span className="text-[var(--text-secondary)]">
            {r.notasActivas === 0 ? "Sin notas antes" : `Acreditado ${formatCurrency(r.acreditadoConIgv)} en ${r.notasActivas} nota${r.notasActivas === 1 ? "" : "s"}`}
          </span>
          {d.reembolsadoEnCaja > 0 && (
            <span className="text-[var(--text-secondary)]">· devuelto en Caja {formatCurrency(d.reembolsadoEnCaja)}</span>
          )}
          <InfoTip
            title="Lo que queda por acreditar"
            what="Lo que cobró la venta menos las notas que no están anuladas (borradores y emitidas), con IGV."
            affects="Es el tope de la nota: el servidor no deja guardar más. Lo devuelto en Caja no resta aquí: la nota es el papel, Caja es la plata."
            example="Venta de S/ 20,00 con una nota de S/ 5,00 → quedan S/ 15,00."
          />
        </div>
      ) : null}
    </div>
  );
}
