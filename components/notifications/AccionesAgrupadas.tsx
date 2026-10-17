"use client";

/**
 * Una fila de «Para atender ahora» por ACCIÓN (M08): «Cobrar 3», «Reponer 5».
 * Dice qué la originó, cómo se resuelve, a quién le toca y desde cuándo, y
 * lleva al lugar (o al registro, si es uno solo). Sin enlace cuando este rol
 * no ve esa pestaña: el aviso se ve igual, pero no se ofrece un camino cerrado.
 */
import type { ElementType } from "react";
import {
  Banknote,
  Calculator,
  CalendarClock,
  FileText,
  HandCoins,
  PackagePlus,
  Receipt,
  Truck,
} from "@buleje/design-system/icons";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { cn } from "@/lib/utils";
import type { AccionId } from "./acciones-de-avisos";
import { cuandoFue } from "./notificaciones-categorias";
import type { GrupoConEnlace } from "./use-acciones-de-avisos";

const ICONOS: Record<AccionId, ElementType> = {
  caja: Calculator,
  cobrar: HandCoins,
  pagar: Banknote,
  comprobantes: Receipt,
  documentos: FileText,
  reponer: PackagePlus,
  vencen: CalendarClock,
  pedidos: Truck,
};

function cuando(fecha: GrupoConEnlace["fecha"]): string {
  if (!fecha) return "hoy";
  const txt = cuandoFue(fecha.iso);
  if (!txt) return "hoy";
  if (fecha.es === "ultimo") return `último aviso ${txt}`;
  return txt.startsWith("hace") ? `pendiente ${txt}` : `pendiente desde ${txt}`;
}

export function FilaAccion({ grupo, onNavegar }: { grupo: GrupoConEnlace; onNavegar: () => void }) {
  const Icono = ICONOS[grupo.id];
  const { urgente, href } = grupo;
  const detalle = grupo.detalle.join(" · ");
  return (
    <div
      data-qa={`accion-${grupo.id}`}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-l-4 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2",
        urgente ? "border-l-[var(--data-error-500)]" : "border-l-[var(--data-warning-500)]",
      )}
    >
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
          urgente ? "bg-[var(--data-error-500)]/10" : "bg-[var(--data-warning-500)]/10",
        )}
        aria-hidden
      >
        <Icono className={cn("h-5 w-5", urgente ? "text-[var(--data-error-ink)]" : "text-[var(--data-warning-ink)]")} />
      </span>
      {/* `grow basis-48` (no `min-w-*`): en la columna angosta la acción baja de línea. */}
      <div className="grow basis-48">
        <p className="text-sm font-bold leading-snug text-[var(--text-primary)]">
          <span className="sr-only">{urgente ? "Urgente: " : "Atención: "}</span>
          {grupo.rotulo}
        </p>
        {detalle && <p className="text-sm text-[var(--text-secondary)]">{detalle}</p>}
        <p className="text-xs text-[var(--text-secondary)]">{grupo.como}</p>
        <p className="text-xs text-[var(--text-secondary)]">
          {grupo.quien} · {cuando(grupo.fecha)}
        </p>
      </div>
      {href && (
        <button
          type="button"
          onClick={() => {
            irAEnlace(href);
            onNavegar();
          }}
          className="ml-auto inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] dark:text-[var(--accent)]"
        >
          {grupo.registro ? "Abrir" : "Resolver"}
          <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
}
