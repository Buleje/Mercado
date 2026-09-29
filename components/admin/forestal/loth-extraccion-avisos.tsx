"use client";

/**
 * Los avisos de «Extracción»: una línea cada uno, con su cifra y el detalle en
 * ⓘ (el texto entero del servidor + qué significa y qué afecta), rojo primero.
 * Se ven tres; el resto se abre con «N más» (ADR-454 §6).
 */

import { useState } from "react";
import { AlertCircle, AlertTriangle, ChevronDown, Info } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { AvisoExtraccion } from "@/lib/forestal/loth-extraccion-tipos";
import { AYUDA_AVISO } from "./loth-extraccion-ayuda";
import { fm3, ordenarAvisos } from "./loth-extraccion-shared";

const VISIBLES = 3;

const ESTILO: Record<AvisoExtraccion["nivel"], { icono: typeof AlertCircle; caja: string; icon: string; nombre: string }> = {
  error: {
    icono: AlertCircle,
    caja: "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/8",
    icon: "text-[var(--data-error-ink)]",
    nombre: "Rojo",
  },
  warning: {
    icono: AlertTriangle,
    caja: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/8",
    icon: "text-[var(--data-warning-ink)]",
    nombre: "Ámbar",
  },
  info: {
    icono: Info,
    caja: "border-[var(--rule-base)] bg-[var(--surface-raised)]",
    icon: "text-[var(--text-tertiary)]",
    nombre: "Para saber",
  },
};

export default function LothExtraccionAvisos({ avisos }: { avisos: readonly AvisoExtraccion[] }) {
  const [todos, setTodos] = useState(false);
  if (avisos.length === 0) return null;
  const orden = ordenarAvisos(avisos);
  const vista = todos ? orden : orden.slice(0, VISIBLES);
  const ocultos = orden.length - vista.length;

  return (
    <section aria-label="Avisos de la extracción" className="space-y-1.5">
      <ul className="space-y-1.5">
        {vista.map((a, i) => {
          const e = ESTILO[a.nivel];
          const Icono = e.icono;
          const ayuda = AYUDA_AVISO[a.tipo];
          return (
            <li
              key={`${a.tipo}-${a.planId ?? "todo"}-${a.especie ?? ""}-${i}`}
              className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${e.caja}`}
            >
              <Icono className={`h-4 w-4 shrink-0 ${e.icon}`} aria-hidden />
              <span className="sr-only">{e.nombre}: </span>
              <span className="line-clamp-2 min-w-0 flex-1 text-[var(--text-primary)] sm:line-clamp-1" title={a.texto}>
                {a.texto}
              </span>
              {a.cifraM3 != null && (
                <span className="shrink-0 font-bold tabular-nums text-[var(--text-primary)]">{fm3(a.cifraM3)} m³</span>
              )}
              {/* La línea se corta; el ⓘ lleva el texto entero y qué significa. */}
              <InfoTip
                title={a.especie ?? "Detalle del aviso"}
                body={a.texto}
                what={ayuda?.what}
                affects={ayuda?.affects}
                side="left"
                ancho="w-80"
              />
            </li>
          );
        })}
      </ul>
      {(ocultos > 0 || todos) && orden.length > VISIBLES && (
        <button
          type="button"
          onClick={() => setTodos((v) => !v)}
          aria-expanded={todos}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${todos ? "rotate-180" : ""}`} aria-hidden />
          {todos ? "Ver menos avisos" : `${ocultos} ${ocultos === 1 ? "aviso más" : "avisos más"}`}
        </button>
      )}
    </section>
  );
}
