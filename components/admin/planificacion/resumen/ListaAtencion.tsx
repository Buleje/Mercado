"use client";

/**
 * «Lo que necesita atención» del Resumen (ADR-497): una línea por aviso, con
 * su ⓘ de cómo se arregla y el botón que lleva a donde se arregla.
 */
import { useState } from "react";
import { BlockTitle } from "@buleje/design-system";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Info } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { AvisoPlan, TonoAviso } from "./avisos";

const ICONO: Record<TonoAviso, typeof AlertTriangle> = { error: AlertTriangle, aviso: Clock, info: Info };
const COLOR: Record<TonoAviso, string> = {
  error: "text-[var(--data-error-ink)]",
  aviso: "text-[var(--data-warning-ink)]",
  info: "text-[var(--data-info-ink)]",
};
const VISIBLES = 6;

interface Props {
  avisos: readonly AvisoPlan[];
  onIr: (a: AvisoPlan) => void;
}

export function ListaAtencion({ avisos, onIr }: Props) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? avisos : avisos.slice(0, VISIBLES);

  return (
    <section className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4" aria-label="Lo que necesita atención">
      <BlockTitle as="h3">Lo que necesita atención</BlockTitle>
      {avisos.length === 0 ? (
        <span className="flex items-center gap-2 text-sm text-[var(--data-success-ink)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Nada pendiente: licencias al día, objetivos a tiempo y socios en 100 %.
        </span>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)]">
          {lista.map((a) => {
            const Icono = ICONO[a.tono];
            return (
              <li key={a.id} className="flex items-center gap-2 py-1.5">
                <Icono className={cn("h-4 w-4 shrink-0", COLOR[a.tono])} aria-hidden />
                <span className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">{a.texto}</span>
                <InfoTip what={a.arreglo} />
                <button
                  type="button"
                  className="flex h-10 shrink-0 items-center gap-0.5 rounded-lg px-2.5 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                  onClick={() => onIr(a)}
                >
                  Ver
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {avisos.length > VISIBLES ? (
        <button
          type="button"
          className="text-sm font-medium text-[var(--accent-ink)] hover:underline"
          onClick={() => setTodos((v) => !v)}
        >
          {todos ? "Ver menos" : `Ver los ${avisos.length}`}
        </button>
      ) : null}
    </section>
  );
}
