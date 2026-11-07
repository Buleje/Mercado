"use client";

/**
 * El chip de la fila de una guía con un pedido de corrección (ADR-512):
 * «Corrección · Pendiente / En revisión» mientras espera y «Resuelta» o
 * «Rechazada» cuando vuelve. El ⓘ dice qué se pidió y qué respondió la
 * plataforma.
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ESTADO_CORRECCION_ETIQUETA, type EstadoCorreccion, type SolicitudCorreccionDTO } from "@/lib/soporte/correccion-guia";
import { cn } from "@/lib/utils";
import { diaDelPedido as fecha } from "./fecha";

const TONO: Record<EstadoCorreccion, string> = {
  open: "border-[var(--data-warning-500)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  in_review: "border-[var(--data-info-500)] text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
  closed: "border-[var(--data-success-500)] text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  rejected: "border-[var(--data-error-500)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
};

export default function CorreccionChip({ s, className }: { s: SolicitudCorreccionDTO; className?: string }) {
  const etiqueta = ESTADO_CORRECCION_ETIQUETA[s.estado] ?? s.estadoEtiqueta;
  const abierta = s.estado === "open" || s.estado === "in_review";
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border bg-[var(--surface-raised)] pl-2.5 pr-1 text-xs font-bold",
        TONO[s.estado],
        className,
      )}
    >
      {abierta ? `Corrección pedida · ${etiqueta}` : `Corrección ${etiqueta.toLowerCase()}`}
      <InfoTip
        title={`Pedido de corrección de la GTF ${s.guiaNumero}`}
        ariaLabel="Ver el pedido de corrección"
        ancho="w-80"
        side="left"
        what={
          <span className="block space-y-1">
            {s.cambios.map((c) => (
              <span key={`${c.donde}:${c.clave}`} className="block">
                <b>{c.etiqueta ?? c.clave}</b>: {c.dice ? `«${c.dice}»` : "vacío"} → «{c.correcto}»
              </span>
            ))}
          </span>
        }
        affects={
          s.resolucion ? (
            <span>
              {s.estado === "rejected" ? "No se corrigió: " : "Respuesta: "}
              {s.resolucion}
              {s.resolvedAt ? ` (${fecha(s.resolvedAt)})` : ""}
            </span>
          ) : (
            <span>La plataforma todavía no responde. Pedido el {fecha(s.createdAt)}.</span>
          )
        }
      />
    </span>
  );
}
