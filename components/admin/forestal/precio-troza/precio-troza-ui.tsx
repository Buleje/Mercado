/**
 * Piezas chicas de «¿Cuánto pagar por la troza?»: la insignia y la cifra con
 * tono. Texto semántico chico con `-ink` (el `-500` no llega a AA en claro) y
 * fondo hundido + borde, que se ve igual en claro y en oscuro.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tono } from "./precio-troza-formato";

export const TEXTO_TONO: Record<Tono, string> = {
  bien: "text-[var(--data-success-ink)]",
  mal: "text-[var(--data-error-ink)]",
  neutro: "text-[var(--text-secondary)]",
};

export function Insignia({ children, tono = "neutro", title }: { children: ReactNode; tono?: "info" | "neutro"; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-semibold",
        tono === "info" ? "text-[var(--data-info-ink)]" : "text-[var(--text-secondary)]",
      )}
    >
      {children}
    </span>
  );
}

/** Dato + aclaración apilados: a la derecha en la tarjeta del celular, a la izquierda en la tabla. */
export const PILA = "inline-flex flex-col items-end gap-0.5 sm:items-start";
export const PILA_DERECHA = "inline-flex flex-col items-end gap-0.5";
