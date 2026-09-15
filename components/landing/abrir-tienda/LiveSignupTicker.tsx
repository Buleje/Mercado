"use client";

/**
 * LiveSignupTicker — chip de proof point regional honesto.
 *
 * Mayo 2026 (designer audit): el counter dinámico "247 negocios activos
 * esta semana" auto-incrementing creaba 2 problemas:
 *   1. Mostraba números distintos en hero y final CTA en la misma sesión
 *      → el usuario lo notaba y desconfiaba
 *   2. "esta semana" implicaba alta actividad constante difícil de creer
 *      con el tamaño actual del negocio
 *
 * Reemplazado por una claim regional cualitativa que no envejece mal:
 * "Primeros negocios en Pucallpa y Ciudad Constitución".
 */

import { m } from "framer-motion";
import { MapPin } from "@buleje/design-system/icons";

export default function LiveSignupTicker(_props?: { start?: number }) {
  // Prop `start` mantenida en signature para back-compat con call sites
  // que la pasaban (hero usa default, final CTA pasaba 251). Se ignora.
  void _props;

  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
      className="inline-flex items-center gap-2.5 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] pl-2 pr-4 py-1.5 shadow-sm"
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
        <MapPin className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--data-success-500)] opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--data-success-500)]" />
      </span>
      <span className="text-sm font-bold text-[var(--text-secondary)]">
        Primeros negocios en{" "}
        <span className="font-black text-[var(--text-primary)]">
          Pucallpa y Ciudad Constitución
        </span>
      </span>
    </m.div>
  );
}
