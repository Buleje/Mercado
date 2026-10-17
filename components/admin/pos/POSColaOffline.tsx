"use client";

/**
 * La cola de ventas sin conexión, una por una (auditoría 15-10, M59): antes la
 * barra decía «3 pendientes» y «Descartar»/«Vaciar cola» borraban ventas sin
 * ver cuáles. Cada fila dice hora, monto que vio el cajero, productos, medio y
 * si está pendiente, si el servidor no la aceptó (con el motivo) o si es de
 * otro negocio (se manda cuando se abra ese negocio).
 */
import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Trash2 } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { getActiveTenantSlug } from "@/lib/tenant-cache";
import { cn } from "@/lib/utils";
import { buscarVentaGuardada, filasDeCola, type EstadoEnCola, type Negocio, type VentaEnCola } from "./cola-offline";

const HORA = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });

const ESTADO: Record<EstadoEnCola, { label: string; clase: string }> = {
  pendiente: { label: "Pendiente", clase: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/20" },
  "no-paso": { label: "No pasó", clase: "bg-[var(--data-error-100)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/20" },
  "otro-negocio": { label: "De otro negocio", clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
};

interface Props {
  cola: readonly VentaEnCola[];
  /** Negocio de la sesión (revisión 17-10); sin él, el de la cookie como antes. */
  negocio?: Negocio;
  onDescartar?: (clave: string) => void;
  /** Vuelve a mandar una «No pasó» con la MISMA clave: si ya estaba guardada, no se crea otra. */
  onReintentar?: (clave: string) => void;
}

/**
 * Antes de descartar se busca la venta por su clave (revisión 17-10): un 504
 * pudo guardarla igual, y decir «vuelve a anotarla» sin revisar era cobrarla
 * dos veces.
 */
function avisoDeDescarte(monto: string, encontrada: Awaited<ReturnType<typeof buscarVentaGuardada>>) {
  if (encontrada) {
    return {
      title: "Esta venta sí está en el sistema",
      description: `${formatCurrency(encontrada.total)} guardada a las ${HORA.format(new Date(encontrada.createdAt))}. Quitarla de la cola no la borra ni la cobra otra vez; no la vuelvas a anotar.`,
      intent: "warning" as const,
      confirmLabel: "Quitar de la cola",
    };
  }
  if (encontrada === null) {
    return {
      title: "¿Descartar esta venta?",
      description: `${monto}: la buscamos por su clave y no está en el sistema. Si ya entregaste el producto y cobraste, vuelve a anotarla.`,
      intent: "danger" as const,
      confirmLabel: "Descartar",
    };
  }
  return {
    title: "¿Descartar esta venta?",
    description: `${monto}: no pudimos revisar si se guardó (sin conexión). Antes de volver a anotarla, búscala en Ventas por hora y monto, o toca «Reintentar» cuando haya conexión: con la misma clave no se cobra dos veces.`,
    intent: "danger" as const,
    confirmLabel: "Descartar",
  };
}

export default function POSColaOffline({ cola, negocio, onDescartar, onReintentar }: Props) {
  const { confirm } = useConfirm();
  const filas = useMemo(() => filasDeCola(cola, negocio?.tenantId ? negocio : getActiveTenantSlug()), [cola, negocio]);
  const [revisando, setRevisando] = useState<string | null>(null);

  const descartar = async (clave: string, monto: string) => {
    setRevisando(clave);
    const encontrada = await buscarVentaGuardada(clave);
    setRevisando(null);
    if (await confirm(avisoDeDescarte(monto, encontrada))) onDescartar?.(clave);
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
            {f.error && (
              <span className={cn("min-w-0 basis-full text-xs sm:basis-auto", f.estado === "no-paso" ? "text-[var(--data-error-ink)]" : "text-[var(--text-secondary)]")}>{f.error}</span>
            )}
            {f.estado === "no-paso" && (onReintentar || onDescartar) && (
              <span className="ml-auto flex gap-1">
                {onReintentar && (
                  <button type="button" onClick={() => onReintentar(f.clave)} className={button({ variant: "ghost", className: "gap-1.5 rounded-xl" })}>
                    <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
                  </button>
                )}
                {onDescartar && (
                  <button type="button" disabled={revisando === f.clave} onClick={() => void descartar(f.clave, monto)} className={button({ variant: "ghost", className: "gap-1.5 rounded-xl" })}>
                    {revisando === f.clave ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} Descartar
                  </button>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
