"use client";

/**
 * Por qué lo que te adelantó no se cruza entero (ADR-449), en una línea.
 *
 * Sin esto, «Dejar en cero» aparecía apagado sin decir por qué: le faltaba el
 * vínculo, no te debía nada en la cuenta forestal, o lo recibido pasaba de lo
 * que te debe. Cuando todo cabe, no dice nada: la tarjeta «Solo cruzar» ya lo
 * muestra con su máximo.
 */

import { totalRecibidos, type PartidasDePersona } from "@/lib/cuentas/liquidacion";
import { fmtMon } from "../../shared";

const EPS = 0.005;

export function motivoRecibidoSinCruzar(partidas: PartidasDePersona, maxCruceRecibido: number): string | null {
  const total = totalRecibidos(partidas);
  if (total > EPS) {
    if (!partidas.cruzable) {
      return `Lo que te adelantó (${fmtMon(total)}) se cruza con sus aserríos cuando confirmes que es la misma persona.`;
    }
    if (maxCruceRecibido <= EPS) {
      return `Lo que te adelantó (${fmtMon(total)}) no se cruza: no te debe nada en la cuenta forestal.`;
    }
    if (total - maxCruceRecibido > EPS) {
      return `Después de cruzar, todavía le debes ${fmtMon(Math.round((total - maxCruceRecibido) * 100) / 100)} de lo que te adelantó.`;
    }
  }
  if (partidas.fuera.some((f) => f.direccion === "RECIBIDO" && (f.moneda || "PEN") === "PEN")) {
    return "Parte de lo que te dio no se cruza acá: queda fuera, con su motivo.";
  }
  return null;
}

export default function AvisoRecibidos({ partidas, maxCruceRecibido }: { partidas: PartidasDePersona; maxCruceRecibido: number }) {
  const texto = motivoRecibidoSinCruzar(partidas, maxCruceRecibido);
  if (!texto) return null;
  return <p className="text-sm font-semibold text-[var(--data-info-ink)]">{texto}</p>;
}
