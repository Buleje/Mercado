"use client";

/**
 * «Avisos que acepta» en la ficha 360 del cliente (09-10).
 *
 * `notifOrderUpdates`, `notifPromotions` y `notifRestock` los respeta el
 * backend (pedidos, campañas, saludo de cumpleaños) pero ninguna pantalla del
 * panel los mostraba: si el cliente pedía «no me mandes promos», el cajero no
 * tenía dónde anotarlo. Ley 29733: el cliente decide; cada cambio queda en el
 * historial del cliente con quién lo hizo (PATCH /api/customers/[phone]).
 */

import { useState, type ComponentType } from "react";
import { toast } from "sonner";
import { CardTitle } from "@buleje/design-system";
import { Gift, PackageCheck, Truck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

export type CampoAviso = "notifOrderUpdates" | "notifPromotions" | "notifRestock";
export type AvisosCliente = Partial<Record<CampoAviso, boolean>>;

/** Lo que la tabla trae si la columna nunca se tocó (defaults del schema). */
const POR_DEFECTO: Record<CampoAviso, boolean> = {
  notifOrderUpdates: true,
  notifPromotions: true,
  notifRestock: false,
};

const AVISOS: { campo: CampoAviso; titulo: string; icono: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; que: string }[] = [
  {
    campo: "notifOrderUpdates",
    titulo: "Estado de sus pedidos",
    icono: Truck,
    que: "Le avisamos cuando su pedido se confirma, sale a reparto o llega. Apagado: no le llega ningún aviso del pedido.",
  },
  {
    campo: "notifPromotions",
    titulo: "Promociones y cupones",
    icono: Gift,
    que: "Ofertas, campañas por WhatsApp y el saludo de cumpleaños con su cupón. Apagado: no entra en ninguna campaña.",
  },
  {
    campo: "notifRestock",
    titulo: "Reposición de agotados",
    icono: PackageCheck,
    que: "Le avisamos cuando repones algo que buscó y estaba agotado.",
  },
];

/** PATCH de un solo aviso. Devuelve el mensaje de error o null. */
async function guardarAviso(phone: string, campo: CampoAviso, valor: boolean): Promise<string | null> {
  try {
    const res = await fetch(`/api/customers/${encodeURIComponent(phone)}`, {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ [campo]: valor }),
    });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error ?? `No se pudo guardar (${res.status}).`;
  } catch {
    return "Sin conexión: no se pudo guardar.";
  }
}

export function AvisosDelCliente({
  phone,
  avisos,
  onCambio,
}: {
  phone: string;
  avisos: AvisosCliente;
  /** Para que la ficha refleje el valor nuevo sin recargar todo. */
  onCambio?: (campo: CampoAviso, valor: boolean) => void;
}) {
  const [guardando, setGuardando] = useState<CampoAviso | null>(null);
  // Valor optimista mientras viaja el PATCH; si falla, vuelve al de la ficha.
  const [local, setLocal] = useState<AvisosCliente>({});

  const valorDe = (campo: CampoAviso): boolean => local[campo] ?? avisos[campo] ?? POR_DEFECTO[campo];

  const cambiar = async (campo: CampoAviso) => {
    if (guardando) return;
    const nuevo = !valorDe(campo);
    setLocal((prev) => ({ ...prev, [campo]: nuevo }));
    setGuardando(campo);
    const error = await guardarAviso(phone, campo, nuevo);
    setGuardando(null);
    if (error) {
      setLocal((prev) => ({ ...prev, [campo]: !nuevo }));
      toast.error(error);
      return;
    }
    onCambio?.(campo, nuevo);
    const titulo = AVISOS.find((a) => a.campo === campo)?.titulo ?? "Aviso";
    toast.success(`${titulo}: ${nuevo ? "lo recibe" : "ya no lo recibe"}.`);
  };

  return (
    <section
      aria-labelledby="avisos-cliente-titulo"
      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5"
    >
      <div className="mb-3 flex items-center gap-1.5">
        <CardTitle id="avisos-cliente-titulo" className="text-sm font-bold text-[var(--text-primary)]">
          Avisos que acepta
        </CardTitle>
        <InfoTip
          title="El cliente decide (Ley 29733)"
          what="Si te pide que no le escribas, apágalo aquí. Se guarda al tocar y queda en su historial con tu usuario."
          affects="Pedidos, campañas, saludo de cumpleaños y avisos de reposición."
        />
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {AVISOS.map(({ campo, titulo, icono: Icono, que }) => {
          const activo = valorDe(campo);
          const ocupado = guardando === campo;
          return (
            <li
              key={campo}
              className="flex items-center gap-1 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-2.5 py-1.5"
            >
              <button
                type="button"
                role="switch"
                aria-checked={activo}
                aria-busy={ocupado || undefined}
                disabled={guardando !== null}
                onClick={() => void cambiar(campo)}
                className="inline-flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md text-left text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait"
              >
                <span
                  aria-hidden
                  className={cn(
                    "relative h-6 w-10 shrink-0 rounded-full border transition-colors",
                    activo
                      ? "border-[var(--accent-600,var(--accent))] bg-[var(--accent-600,var(--accent))]"
                      : "border-[var(--rule-strong)]/40 bg-[var(--surface-raised)]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-[var(--surface-raised)] shadow-[var(--shadow-sm)] transition-[left]",
                      activo ? "left-[1.1rem]" : "left-0.5",
                      !activo && "bg-[var(--text-tertiary)]",
                    )}
                  />
                </span>
                <Icono className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                <span className="min-w-0 truncate">{titulo}</span>
              </button>
              <InfoTip title={titulo} what={que} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
