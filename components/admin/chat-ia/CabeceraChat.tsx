"use client";

import { useId } from "react";
import { Maximize2, Minimize2, ShieldCheck, Trash2 } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { cn } from "@/lib/utils";
import type { Tono } from "./tipos";

const TONOS: { value: Tono; label: string }[] = [
  { value: "feynman", label: "Simple" },
  { value: "ejecutivo", label: "Ejecutivo" },
  { value: "tecnico", label: "Técnico" },
];

/** Donde se juntan las aprobaciones de todos los canales (chat, WhatsApp, Telegram). */
const HREF_PENDIENTES = "/admin?tab=asistente-ia&vista=comandos&sub=historial";

const BOTON =
  "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--rule-soft)] text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--rule-base)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

/**
 * La única fila de arriba del chat: tono de las respuestas (lo único que el
 * servidor usa de los viejos ajustes), cuántas acciones esperan tu OK, borrar la
 * conversación y pantalla completa.
 */
export function CabeceraChat({
  tono,
  onTono,
  pendientes,
  hayMensajes,
  ocupado,
  onBorrar,
  maximizado,
  onMaximizar,
}: {
  tono: Tono;
  onTono: (t: Tono) => void;
  pendientes: number;
  hayMensajes: boolean;
  ocupado: boolean;
  onBorrar: () => void;
  maximizado: boolean;
  onMaximizar: () => void;
}) {
  const idTono = useId();
  const textoPendientes = `${pendientes} ${pendientes === 1 ? "espera" : "esperan"} tu OK`;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--rule-soft)] px-3 py-2 sm:px-4">
      <label
        htmlFor={idTono}
        className="text-sm font-semibold text-[var(--text-secondary)] max-sm:sr-only"
      >
        Tono
      </label>
      <select
        id={idTono}
        value={tono}
        onChange={(e) => onTono(e.target.value as Tono)}
        title="Simple: con ejemplos del día a día · Ejecutivo: directo, con números · Técnico: con la jerga completa"
        className="h-12 shrink-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] dark:bg-[var(--surface-raised)]"
      >
        {TONOS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {pendientes > 0 && (
        <EnlacePanel
          href={HREF_PENDIENTES}
          apariencia="heredada"
          aria-label={`${textoPendientes}: ver en Lo que hizo la IA`}
          title="Ver en Comandos IA › Lo que hizo la IA (también lo que llegó por WhatsApp y Telegram)"
          className="inline-flex h-12 min-w-0 items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-3 text-sm font-semibold text-[var(--data-warning-ink)] hover:bg-[var(--data-warning-500)]/20"
        >
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          <span className="tabular-nums sm:hidden">{pendientes}</span>
          <span className="truncate max-sm:hidden">{textoPendientes}</span>
        </EnlacePanel>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {hayMensajes && (
          <button
            type="button"
            onClick={onBorrar}
            disabled={ocupado}
            title="Borrar conversación"
            className={cn(BOTON, "px-3 max-sm:w-12 max-sm:px-0")}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Borrar conversación</span>
          </button>
        )}
        <button
          type="button"
          onClick={onMaximizar}
          aria-label={maximizado ? "Salir de pantalla completa" : "Pantalla completa"}
          title={maximizado ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
          className={cn(BOTON, "w-12")}
        >
          {maximizado ? (
            <Minimize2 className="h-4 w-4" aria-hidden />
          ) : (
            <Maximize2 className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
