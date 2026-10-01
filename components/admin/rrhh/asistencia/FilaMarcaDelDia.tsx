"use client";

/**
 * FilaMarcaDelDia — una persona, un día (ADR-414 §7, «Hoja del día»).
 *
 * Botones segmentados con letra; el estado elegido se nombra además en
 * palabras bajo el nombre: el color nunca va solo. Entrada y salida son
 * opcionales — sólo importan para PRESENTE/TARDANZA/MEDIO_DIA
 * (`horas_en_estado_sin_trabajo` del servidor si se manda para otro estado).
 *
 * Layout por contenedor, no por viewport: con el sidebar abierto, una
 * pantalla de 1280 deja ~960 px para la lista.
 *
 * Tardanza (ADR-417): si el puesto tiene hora de entrada, al tipear la hora se
 * SUGIERE la tardanza —se ve el estado sugerido y se acepta de un clic—, pero
 * nunca se pisa lo que ya eligió el encargado: con la marca ya en TARDANZA, o
 * en cualquier otro estado puesto a propósito, sólo se informa.
 */

import { useState } from "react";
import { AlertTriangle, Clock, History, Loader2, StickyNote } from "@buleje/design-system/icons";
import { tardanzaDe } from "@/lib/rrhh/asistencia";
import { cn } from "@/lib/utils";
import { BOTON, CLASE_CAMPO, CLASE_CHIP } from "../rrhh-form";
import { ESTADO_ASISTENCIA_META, ORDEN_ESTADOS_ASISTENCIA } from "../rrhh-ui";
import type { AsistenciaDTO, ColaboradorMinDTO, EstadoAsistencia, FechaKey } from "@/lib/rrhh/tipos";

const LLEVA_HORAS: ReadonlySet<EstadoAsistencia> = new Set(["PRESENTE", "TARDANZA", "MEDIO_DIA"]);

/** 8rem: el `type="time"` en es-PE pinta «07:00 a. m.»; con 5.5rem se cortaba y «04:00» (p. m.) parecía de madrugada. */
const CLASE_HORA =
  "h-10 w-[8rem] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] disabled:cursor-not-allowed disabled:opacity-50 @min-[58rem]:h-9";

interface Props {
  colaborador: ColaboradorMinDTO;
  fecha: FechaKey;
  marca: AsistenciaDTO | undefined;
  pendiente: boolean;
  errorMsg: string | undefined;
  /** Fuera de la ventana de corrección del rol — se ve, no se toca (el historial sigue disponible). */
  soloLectura?: boolean;
  /** Horario del puesto (ADR-417). `null` = sin hora de entrada: la tardanza no se juzga sola. */
  horario?: { horaEntrada: string; toleranciaMin: number } | null;
  onMarcar: (input: { estado: EstadoAsistencia | null; entrada?: string | null; salida?: string | null; nota?: string | null }) => void;
  onVerHistorial: () => void;
}

export default function FilaMarcaDelDia({ colaborador, fecha, marca, pendiente, errorMsg, soloLectura, horario, onMarcar, onVerHistorial }: Props) {
  const [notaAbierta, setNotaAbierta] = useState(false);
  const estadoActual = marca?.estado ?? null;
  const metaActual = estadoActual ? ESTADO_ASISTENCIA_META[estadoActual] : null;
  const muestraHoras = Boolean(estadoActual && LLEVA_HORAS.has(estadoActual));
  // `null` mientras no haya hora marcada u horario del puesto: sin eso no hay nada que decir.
  const tardanza = horario ? tardanzaDe(marca?.entrada ?? null, horario.horaEntrada, horario.toleranciaMin) : null;
  const minutosTarde = tardanza?.tarde ? tardanza.minutos : null;
  // Sólo se ofrece el cambio desde PRESENTE (lo que deja «Todos presentes»); con
  // otro estado elegido a mano, la fila informa y no toca nada.
  const sugerirTardanza = minutosTarde !== null && estadoActual === "PRESENTE" && !soloLectura;

  /**
   * El buffer del hook REEMPLAZA lo pendiente de la celda en vez de mezclarlo,
   * así que la marca viaja completa: mandar sólo el estado guardaría la
   * tardanza sin la hora que justamente la delató.
   */
  const aceptarTardanza = () =>
    onMarcar({ estado: "TARDANZA", entrada: marca?.entrada ?? null, salida: marca?.salida ?? null, nota: marca?.nota ?? null });

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 rounded-xl border bg-[var(--surface-raised)] px-4 py-3 @min-[58rem]:grid-cols-[minmax(9rem,1fr)_auto_19.5rem_auto]",
        errorMsg ? "border-[var(--data-error-500)]/50" : "border-[var(--rule-base)]",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
          {colaborador.nombre}
          {colaborador.apodo && <span className="ml-1 font-normal text-[var(--text-tertiary)]">«{colaborador.apodo}»</span>}
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <span className={cn(CLASE_CHIP, "py-0", metaActual ? metaActual.claseChip : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>
            {metaActual?.label ?? "Sin marcar"}
          </span>
          {colaborador.puesto && <span className="truncate">{colaborador.puesto.nombre}</span>}
        </p>
      </div>

      <div className="flex items-center justify-end gap-1 @min-[58rem]:order-4">
        {pendiente && <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" aria-label="Guardando" />}
        {errorMsg && <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)]" aria-hidden />}
        {/* Sin estado todavía no hay marca que anotar: `Asistencia.estado` no
            admite null — una nota sin estado no tiene dónde vivir. */}
        {estadoActual && !soloLectura && (
          <button
            type="button"
            onClick={() => setNotaAbierta((v) => !v)}
            aria-expanded={notaAbierta}
            className={cn(BOTON.chicoFantasma, "px-2.5", marca?.nota && "text-[var(--accent-ink)] dark:text-[var(--accent)]")}
          >
            <StickyNote className="h-4 w-4" /> Nota
          </button>
        )}
        <button type="button" onClick={onVerHistorial} className={BOTON.icono} title="Historial de correcciones del día" aria-label={`Ver historial de ${colaborador.nombre} del ${fecha}`}>
          <History className="h-4 w-4" />
        </button>
      </div>

      <div role="group" aria-label={`Asistencia de ${colaborador.nombre}`} className="col-span-2 flex flex-wrap items-center gap-1 @min-[58rem]:order-2 @min-[58rem]:col-span-1">
        {ORDEN_ESTADOS_ASISTENCIA.map((estado) => {
          const meta = ESTADO_ASISTENCIA_META[estado];
          const activo = estadoActual === estado;
          const sugerido = sugerirTardanza && estado === "TARDANZA";
          return (
            <button
              key={estado}
              type="button"
              disabled={soloLectura}
              aria-pressed={activo}
              title={sugerido ? `${meta.label} — sugerida por la hora de entrada` : meta.label}
              onClick={() => (sugerido ? aceptarTardanza() : onMarcar({ estado: activo ? null : estado }))}
              className={cn(
                "inline-flex h-10 min-w-[2.5rem] items-center justify-center rounded-lg border-2 px-1.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 @min-[58rem]:h-9 @min-[58rem]:min-w-[2.25rem]",
                activo
                  ? cn("border-current", meta.claseChip)
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                // El sugerido se VE: borde de aviso punteado, además del texto de abajo.
                sugerido && "border-dashed border-[var(--data-warning-500)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
              )}
            >
              <span aria-hidden>{meta.letra}</span>
              <span className="sr-only">{sugerido ? `${meta.label} (sugerida)` : meta.label}</span>
            </button>
          );
        })}
      </div>

      <div className={cn("col-span-2 flex flex-wrap items-center gap-2 @min-[58rem]:order-3 @min-[58rem]:col-span-1", !muestraHoras && "hidden @min-[58rem]:block")}>
        {muestraHoras && (
          <>
            <Clock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            <input
              type="time"
              disabled={soloLectura}
              value={marca?.entrada ?? ""}
              onChange={(e) => onMarcar({ estado: estadoActual, entrada: e.target.value || null })}
              aria-label={`Entrada de ${colaborador.nombre}`}
              className={CLASE_HORA}
            />
            <span className="text-sm text-[var(--text-tertiary)]">a</span>
            <input
              type="time"
              disabled={soloLectura}
              value={marca?.salida ?? ""}
              onChange={(e) => onMarcar({ estado: estadoActual, salida: e.target.value || null })}
              aria-label={`Salida de ${colaborador.nombre}`}
              className={CLASE_HORA}
            />
          </>
        )}
      </div>

      {muestraHoras && tardanza && horario && (
        <div role="status" className="col-span-2 flex flex-wrap items-center gap-2 text-sm @min-[58rem]:order-5 @min-[58rem]:col-span-4">
          {minutosTarde !== null ? (
            <>
              <span className={cn(CLASE_CHIP, "gap-1 bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]")}>
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Llegó {minutosTarde} min tarde
              </span>
              <span className="text-[var(--text-tertiary)]">
                Entra {horario.horaEntrada} · {horario.toleranciaMin} min de tolerancia
              </span>
              {sugerirTardanza && (
                <button type="button" onClick={aceptarTardanza} className={BOTON.chico}>
                  Marcar tardanza
                </button>
              )}
            </>
          ) : (
            <span className="text-[var(--text-tertiary)]">Llegó a tiempo para las {horario.horaEntrada}.</span>
          )}
        </div>
      )}

      {estadoActual && notaAbierta && !soloLectura ? (
        <input
          value={marca?.nota ?? ""}
          onChange={(e) => onMarcar({ estado: estadoActual, nota: e.target.value || null })}
          aria-label={`Nota del día de ${colaborador.nombre}`}
          placeholder="Nota corta (ej. feriado, llegó en la tarde)"
          maxLength={300}
          className={cn(CLASE_CAMPO, "col-span-2 h-10 @min-[58rem]:order-6 @min-[58rem]:col-span-4")}
        />
      ) : (
        marca?.nota && (
          <p className="col-span-2 flex items-start gap-1.5 text-sm text-[var(--text-secondary)] @min-[58rem]:order-6 @min-[58rem]:col-span-4">
            <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden /> {marca.nota}
          </p>
        )
      )}
      {errorMsg && (
        <p role="alert" className="col-span-2 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)] @min-[58rem]:order-7 @min-[58rem]:col-span-4">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
