"use client";

/**
 * FilaMarcaDelDia — una persona, un día (ADR-414 §7, «Hoja del día»).
 *
 * Botones segmentados con letra + palabra: el color nunca va solo. Entrada y
 * salida son opcionales — sólo importan para PRESENTE/TARDANZA/MEDIO_DIA
 * (`horas_en_estado_sin_trabajo` del servidor si se manda para otro estado).
 */

import { useState } from "react";
import { AlertTriangle, Clock, History, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { ESTADO_ASISTENCIA_META, ORDEN_ESTADOS_ASISTENCIA } from "../rrhh-ui";
import type { AsistenciaDTO, ColaboradorMinDTO, EstadoAsistencia, FechaKey } from "@/lib/rrhh/tipos";

const LLEVA_HORAS: ReadonlySet<EstadoAsistencia> = new Set(["PRESENTE", "TARDANZA", "MEDIO_DIA"]);

interface Props {
  colaborador: ColaboradorMinDTO;
  fecha: FechaKey;
  marca: AsistenciaDTO | undefined;
  pendiente: boolean;
  errorMsg: string | undefined;
  /** Fuera de la ventana de corrección del rol — se ve, no se toca (el historial sigue disponible). */
  soloLectura?: boolean;
  onMarcar: (input: { estado: EstadoAsistencia | null; entrada?: string | null; salida?: string | null; nota?: string | null }) => void;
  onVerHistorial: () => void;
}

export default function FilaMarcaDelDia({ colaborador, fecha, marca, pendiente, errorMsg, soloLectura, onMarcar, onVerHistorial }: Props) {
  const [notaAbierta, setNotaAbierta] = useState(false);
  const estadoActual = marca?.estado ?? null;
  const muestraHoras = estadoActual && LLEVA_HORAS.has(estadoActual);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--rule-base)] p-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
          {colaborador.nombre}
          {colaborador.apodo && <span className="ml-1 font-normal text-[var(--text-tertiary)]">«{colaborador.apodo}»</span>}
        </p>
        {colaborador.puesto && <p className="truncate text-xs text-[var(--text-tertiary)]">{colaborador.puesto.nombre}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`Estado del ${fecha} para ${colaborador.nombre}`}>
        {ORDEN_ESTADOS_ASISTENCIA.map((estado) => {
          const meta = ESTADO_ASISTENCIA_META[estado];
          const activo = estadoActual === estado;
          return (
            <button
              key={estado}
              type="button"
              disabled={soloLectura}
              aria-pressed={activo}
              title={meta.label}
              onClick={() => onMarcar({ estado: activo ? null : estado })}
              className={cn(
                "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg border-2 px-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                activo
                  ? cn("border-transparent", meta.claseChip)
                  : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-[var(--rule-strong)]",
              )}
            >
              {meta.letra}
            </button>
          );
        })}
      </div>

      {muestraHoras && (
        <div className="flex items-center gap-1.5 text-xs">
          <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
          <input
            type="time"
            disabled={soloLectura}
            value={marca?.entrada ?? ""}
            onChange={(e) => onMarcar({ estado: estadoActual, entrada: e.target.value || null })}
            aria-label={`Entrada de ${colaborador.nombre}`}
            className="w-[5.5rem] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-1.5 py-1 text-[var(--text-primary)] disabled:opacity-40"
          />
          <span className="text-[var(--text-tertiary)]">–</span>
          <input
            type="time"
            disabled={soloLectura}
            value={marca?.salida ?? ""}
            onChange={(e) => onMarcar({ estado: estadoActual, salida: e.target.value || null })}
            aria-label={`Salida de ${colaborador.nombre}`}
            className="w-[5.5rem] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-1.5 py-1 text-[var(--text-primary)] disabled:opacity-40"
          />
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1.5">
        {pendiente && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]" aria-label="Guardando" />}
        {errorMsg && <AlertTriangle className="h-3.5 w-3.5 text-[var(--data-error-500)]" aria-label={errorMsg} />}
        {/* Sin estado todavía no hay marca que anotar: `Asistencia.estado` no
            admite null — una nota sin estado no tiene dónde vivir. */}
        {estadoActual && !soloLectura && (
          <button
            type="button"
            onClick={() => setNotaAbierta((v) => !v)}
            className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            title="Nota del día"
          >
            {marca?.nota ? "Nota ✓" : "+ Nota"}
          </button>
        )}
        <button
          type="button"
          onClick={onVerHistorial}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          title="Historial de correcciones del día"
          aria-label={`Ver historial de ${colaborador.nombre} del ${fecha}`}
        >
          <History className="h-3.5 w-3.5" />
        </button>
      </div>

      {estadoActual && notaAbierta && (
        <input
          value={marca?.nota ?? ""}
          onChange={(e) => onMarcar({ estado: estadoActual, nota: e.target.value || null })}
          placeholder="Nota corta (ej. Feriado)"
          maxLength={300}
          className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] sm:w-48"
        />
      )}
      {errorMsg && <p className="w-full text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)] sm:hidden">{errorMsg}</p>}
    </div>
  );
}
