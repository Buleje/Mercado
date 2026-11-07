"use client";

import { formatCurrency } from "@/lib/format";
import { Plus, Loader2, FileText } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { DOC_STYLE, MOTIVOS_SUNAT } from "@/components/admin/notas-credito/nc-compartido";
import { AmountBreakdown } from "@/components/admin/notas-credito/NcWizardPiezas";
import NcEfectos from "@/components/admin/notas-credito/NcEfectos";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

/**
 * Asistente, paso 3: revisar y crear (F13, 17-10). Muestra el texto que irá en la nota, las unidades
 * elegidas, el desglose con la tasa del negocio y qué cambia (y qué no) al crearla.
 * Pieza de NotasCreditoModule: recibe `useNotasCredito` entero.
 */
export default function NcPasoConfirmar({ nc }: { nc: NotasCreditoVista }) {
  const {
    wizardStep, setWizardStep, creating, createError, form, selectedVenta, handleCreate,
    importe, tasa, remanente, lineas, cantidades, descripcionFinal, devueltoEnCaja,
  } = nc;
  if (wizardStep !== 2) return null;
  const estilo = selectedVenta ? DOC_STYLE[selectedVenta.comprobanteTipo] || DOC_STYLE.ticket : null;
  const IconoMotivo = MOTIVOS_SUNAT.find((x) => x.code === form.codigoMotivo)?.icon || FileText;
  const usaLineas = importe.forma === "lineas" || importe.forma === "descripcion";
  const elegidas = usaLineas ? lineas.map((l, i) => ({ l, i, q: cantidades[i] ?? 0 })).filter((x) => x.q > 0) : [];
  const datos = remanente.datos;

  return (
    <div className="space-y-5">
      {selectedVenta && estilo ? (
        <div className={cn("rounded-xl border-2 p-4", estilo.border, estilo.bg)}>
          <div className="flex flex-wrap items-center gap-2">
            <estilo.icon className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />
            <span className={cn("rounded-lg px-2 py-0.5 text-sm font-bold uppercase", estilo.badge)}>{estilo.label}</span>
            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{selectedVenta.comprobanteNumero || `#${selectedVenta.número}`}</span>
            <span className="min-w-0 truncate text-sm text-[var(--text-secondary)]">· {selectedVenta.clienteNombre}</span>
            <div className="flex-1" />
            <span className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(selectedVenta.total)}</span>
          </div>
          {elegidas.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-[var(--rule-base)] pt-3">
              {elegidas.map(({ l, i, q }) => (
                <li key={`${l.productId}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-[var(--text-secondary)]">{l.nombre} × {q}{q < l.vendidas ? ` (de ${l.vendidas})` : ""}</span>
                  <span className="font-bold text-[var(--text-primary)]">{formatCurrency(q * l.precioCobrado)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p role="note" className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
          Ajuste interno: sin documento de origen, no queda vinculada a ninguna boleta ni factura.
        </p>
      )}

      <div className="rounded-xl bg-[var(--surface-sunken)] p-4">
        <div className="flex items-start gap-2">
          <IconoMotivo className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-secondary)]" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)]">{form.codigoMotivo} · {descripcionFinal}</p>
            {form.notasText && <p className="mt-0.5 text-sm italic text-[var(--text-tertiary)]">Nota interna: {form.notasText}</p>}
          </div>
        </div>
      </div>

      <AmountBreakdown monto={importe.desglose.monto} igv={importe.desglose.igv} total={importe.desglose.total} originalTotal={datos?.remanente.totalDocumento} tasa={tasa} />

      <NcEfectos codigo={form.codigoMotivo} total={importe.desglose.total} remanente={datos?.remanente ?? null}
        reembolsadoEnCaja={datos?.reembolsadoEnCaja ?? 0} devueltoEnCaja={devueltoEnCaja} />

      {(createError || importe.problema) && (
        <p role="alert" className="rounded-xl bg-[var(--data-error-50)] p-3 text-sm font-semibold text-[var(--data-error-500)]">{createError || importe.problema}</p>
      )}

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={() => setWizardStep(1)} className="min-h-12 flex-1 rounded-xl bg-[var(--surface-sunken)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--rule-soft)]">
          ← Atrás
        </button>
        <button type="button" data-qa="nc-crear" onClick={handleCreate} disabled={creating || !!importe.problema}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-all hover:bg-primary-dark disabled:opacity-50">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          Crear nota de crédito
        </button>
      </div>
    </div>
  );
}
