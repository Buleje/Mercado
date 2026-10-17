"use client";

/**
 * La cola de ventas sin conexión, una por una (auditoría 15-10, M59): antes la
 * barra decía «3 pendientes» y «Descartar»/«Vaciar cola» borraban ventas sin
 * ver cuáles. Cada fila dice hora, monto que vio el cajero, productos, medio y
 * si está pendiente, si el servidor no la aceptó (con el motivo) o si es de
 * otro negocio (se manda cuando se abra ese negocio).
 */
import { useMemo } from "react";
import { Trash2 } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { getActiveTenantSlug } from "@/lib/tenant-cache";
import { cn } from "@/lib/utils";
import { filasDeCola, type EstadoEnCola, type VentaEnCola } from "./cola-offline";

const HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });

const ESTADO: Record<EstadoEnCola, { label: string; clase: string }> = {
  pendiente: { label: "Pendiente", clase: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/20" },
  "no-paso": { label: "No pasó", clase: "bg-[var(--data-error-100)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/20" },
  "otro-negocio": { label: "De otro negocio", clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
};

export default function POSColaOffline({ cola, onDescartar }: { cola: readonly VentaEnCola[]; onDescartar?: (clave: string) => void }) {
  const { confirm } = useConfirm();
  const filas = useMemo(() => filasDeCola(cola, getActiveTenantSlug()), [cola]);

  const descartar = async (clave: string, monto: string) => {
    const ok = await confirm({
      title: "¿Descartar esta venta?",
      description: `${monto}: no se registró en el sistema. Si ya entregaste el producto y cobraste, vuelve a anotarla cuando haya conexión.`,
      intent: "danger",
      confirmLabel: "Descartar",
    });
    if (ok) onDescartar?.(clave);
  };

  if (filas.length === 0) return null;
  return (
    <ul data-qa="pos-cola-offline" className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      {filas.map((f) => {
        const monto = f.total != null ? formatCurrency(f.total) : "Venta";
        return (
          <li key={f.clave} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <span className="tabular-nums text-[var(--text-secondary)]">{HORA.format(f.hora)}</span>
            <span className="font-semibold tabular-nums text-[var(--text-primary)]">{monto}</span>
            <span className="text-[var(--text-secondary)]">
              {f.productos} {f.productos === 1 ? "producto" : "productos"} · {f.medio}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", ESTADO[f.estado].clase)}>{ESTADO[f.estado].label}</span>
            {f.error && <span className="min-w-0 basis-full text-xs text-[var(--data-error-ink)] sm:basis-auto">{f.error}</span>}
            {onDescartar && f.estado === "no-paso" && (
              <button type="button" onClick={() => void descartar(f.clave, monto)} className={button({ variant: "ghost", className: "ml-auto gap-1.5 rounded-xl" })}>
                <Trash2 className="h-4 w-4" aria-hidden /> Descartar
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
