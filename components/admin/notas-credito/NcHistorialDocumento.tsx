"use client";

import { Loader2, RotateCcw, AlertTriangle, Link2, Undo2 } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { STATUS_META, diaYFecha, type NotaCredito } from "@/components/admin/notas-credito/nc-compartido";
import { useRemanenteDocumento } from "@/components/admin/notas-credito/hooks/use-remanente-documento";

/**
 * Todo lo que colgó del mismo documento (F16, 17-10): la venta tal como se cobró, cada nota con su estado
 * (resaltando ésta), las devoluciones de Caja con la plata que salió y lo que queda por acreditar.
 * El original no se reescribe: cada cosa suma o resta por su lado.
 */
export default function NcHistorialDocumento({ nota }: { nota: NotaCredito }) {
  const clave = nota.saleId ? "saleId" : "orderId";
  const r = useRemanenteDocumento(nota.saleId ?? nota.orderId ?? null, clave);
  if (!nota.saleId && !nota.orderId) return null;
  const d = r.datos;

  return (
    <section data-qa="nc-historial-documento" aria-label="Documento de origen" className="space-y-3 rounded-xl bg-[var(--surface-sunken)] p-4">
      <div className="flex items-center gap-1">
        <Link2 className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
        <span className="text-sm font-bold text-[var(--text-primary)]">Documento de origen</span>
        <InfoTip
          title="Nada se reescribe"
          what="La venta queda como se cobró. Cada nota y cada devolución de Caja se guardan aparte y suman o restan por su lado."
          affects="Lo que queda por acreditar = lo cobrado menos las notas que no están anuladas. La plata que salió está en las devoluciones de Caja."
          example="Venta S/ 30,00 → nota 07 S/ 10,00 y devolución en efectivo S/ 10,00 → quedan S/ 20,00 por acreditar."
        />
      </div>

      {r.cargando && !d ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo el documento…</p>
      ) : r.error ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--data-error-500)]">
          <AlertTriangle className="h-4 w-4" aria-hidden /> {r.error}
          <button type="button" onClick={r.recargar} className="inline-flex min-h-12 items-center gap-1 rounded-xl px-3 font-bold hover:bg-[var(--data-error-50)]">
            <RotateCcw className="h-4 w-4" aria-hidden /> Reintentar
          </button>
        </div>
      ) : d ? (
        <>
          <p className="text-sm text-[var(--text-secondary)]">
            {d.documento.tipo === "pedido" ? "Pedido" : "Venta"} del {diaYFecha(d.documento.fecha)} · cobró <strong className="text-[var(--text-primary)]">{formatCurrency(d.documento.total)}</strong>
            {" · "}queda <strong className="text-[var(--text-primary)]">{formatCurrency(d.remanente.disponibleConIgv)}</strong> por acreditar
          </p>

          <ul className="space-y-1" aria-label="Notas del documento">
            {d.notas.map((n) => {
              const meta = STATUS_META[n.status];
              const esta = n.id === nota.id;
              return (
                <li key={n.id} className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-2 py-1.5 text-sm", esta ? "bg-primary/10 ring-1 ring-primary/30" : "bg-[var(--surface-raised)]")}>
                  <span className="font-mono font-bold text-[var(--text-primary)]">{n.numero}</span>
                  <span className="text-[var(--text-secondary)]">{n.motivoCodigo} · {diaYFecha(n.createdAt)}</span>
                  {esta && <span className="text-[var(--text-tertiary)]">(ésta)</span>}
                  <div className="flex-1" />
                  <span className={cn("rounded-lg px-2 py-0.5 font-bold", meta.bg, meta.color)}>{meta.label}</span>
                  <span className={cn("w-20 text-right font-bold", n.status === "ANULADA" ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-primary)]")}>{formatCurrency(n.total)}</span>
                </li>
              );
            })}
          </ul>

          {d.devoluciones.length > 0 ? (
            <ul className="space-y-1 border-t border-[var(--rule-base)] pt-2" aria-label="Devoluciones de Caja">
              {d.devoluciones.map((dv) => (
                <li key={dv.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <Undo2 className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
                  <span className="text-[var(--text-secondary)]">
                    Devolución en Caja del {diaYFecha(dv.createdAt)} · {dv.creditApplied ? "a cuenta del cliente" : "en efectivo"}
                    {dv.items.length > 0 && ` · ${dv.items.map((it) => `${it.quantity} × ${it.name}`).join(", ")}`}
                  </span>
                  <div className="flex-1" />
                  <span className="font-bold text-[var(--text-primary)]">{formatCurrency(dv.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            d.documento.tipo === "venta" && <p className="border-t border-[var(--rule-base)] pt-2 text-sm text-[var(--text-tertiary)]">Sin devoluciones en Caja: no salió plata ni volvió producto.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
