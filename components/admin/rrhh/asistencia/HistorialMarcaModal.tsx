"use client";

/**
 * HistorialMarcaModal — las versiones de la marca de UN día (ADR-414 §4).
 *
 * Corregir una marca da de baja la viva y crea otra: esto es la línea de
 * tiempo completa, más nueva primero. Útil para saber quién tocó qué y por
 * qué («11/09: FALTA → PRESENTE»).
 */

import { useEffect, useState } from "react";
import { Clock, History, PencilLine, StickyNote } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { LoadingState } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { CLASE_CHIP, AvisoRrhh } from "../rrhh-form";
import { ESTADO_ASISTENCIA_META } from "../rrhh-ui";
import { etiquetaDia } from "@/lib/rrhh/fechas";
import type { AsistenciaDTO, ColaboradorMinDTO, FechaKey } from "@/lib/rrhh/tipos";
import { sinDato } from "@/lib/errores/sin-dato";

interface Props {
  open: boolean;
  onClose: () => void;
  colaborador: ColaboradorMinDTO;
  fecha: FechaKey;
  /** Este modal se abrió DESDE otro modal (ej. la ficha). */
  aboveModals?: boolean;
}

const FECHA_HORA: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };

export default function HistorialMarcaModal({ open, onClose, colaborador, fecha, aboveModals }: Props) {
  const [versiones, setVersiones] = useState<AsistenciaDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let vigente = true;
    setVersiones(null);
    setError(null);
    fetch(`/api/rrhh/asistencia/historial?colaboradorId=${colaborador.id}&fecha=${fecha}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar el historial");
        return r.json() as Promise<{ versiones: AsistenciaDTO[] }>;
      })
      .then((data) => {
        if (vigente) setVersiones(data.versiones);
      })
      .catch((err) => {
        sinDato("RRHH historial de la marca")(err);
        if (vigente) setError(err instanceof Error ? err.message : "No se pudo cargar el historial");
      });
    return () => {
      vigente = false;
    };
  }, [open, colaborador.id, fecha]);

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={`Historial · ${colaborador.nombre}`}
      description={etiquetaDia(fecha)}
      icon={History}
      aboveModals={aboveModals}
    >
      <div className={MODAL_BODY}>
        {versiones === null && !error && <LoadingState message="Cargando historial..." />}
        {error && <AvisoRrhh tono="error">{error}</AvisoRrhh>}
        {versiones && versiones.length === 0 && (
          <AvisoRrhh tono="neutro" icono={History}>Nadie marcó este día todavía.</AvisoRrhh>
        )}
        {versiones && versiones.length > 0 && (
          <ol className="relative space-y-3 border-l-2 border-[var(--rule-soft)] pl-5">
            {/* La consulta llega de la más vieja a la más nueva; se muestra al revés, la vigente arriba. */}
            {[...versiones].reverse().map((v) => {
              const meta = ESTADO_ASISTENCIA_META[v.estado];
              const vigente = !v.reemplazada;
              return (
                <li key={v.id} className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -left-[1.6rem] top-4 h-3 w-3 rounded-full border-2 border-[var(--surface-raised)]",
                      vigente ? "bg-primary" : "bg-[var(--rule-base)]",
                    )}
                  />
                  <div className={cn("rounded-xl border p-3.5", vigente ? "border-[var(--rule-base)] bg-[var(--surface-raised)]" : "border-[var(--rule-soft)] bg-[var(--surface-sunken)]")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className={cn(CLASE_CHIP, meta.claseChip)}>{meta.letra} · {meta.label}</span>
                        {vigente && <span className="text-xs font-semibold text-[var(--text-secondary)]">Vigente</span>}
                      </span>
                      <time className="text-xs tabular-nums text-[var(--text-tertiary)]" dateTime={v.marcadoEn}>
                        {new Date(v.marcadoEn).toLocaleString("es-PE", FECHA_HORA)}
                      </time>
                    </div>
                    {(v.entrada || v.salida) && (
                      <p className="mt-2 flex items-center gap-1.5 text-sm tabular-nums text-[var(--text-primary)]">
                        <Clock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /> {v.entrada ?? "—"} a {v.salida ?? "—"}
                      </p>
                    )}
                    {v.nota && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-sm text-[var(--text-secondary)]">
                        <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" /> {v.nota}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                      Marcado por {v.marcadoPor} · {v.origen === "masivo" ? "acción masiva" : "a mano"}
                    </p>
                    {v.reemplazada && (
                      <div className="mt-2 border-t border-[var(--rule-soft)] pt-2">
                        <p className="text-xs text-[var(--text-tertiary)]">
                          Reemplazada el {new Date(v.reemplazada.en).toLocaleString("es-PE", FECHA_HORA)}
                        </p>
                        {/* El motivo es lo que se mira en una fiscalización: línea propia,
                            y si no está, se dice — hasta el 2026-09-15 ninguna corrección
                            lo traía porque la pantalla nunca lo preguntaba (ADR-417). */}
                        <p
                          className={cn(
                            "mt-1 flex items-start gap-1.5 text-sm",
                            v.reemplazada.motivo
                              ? "text-[var(--text-secondary)]"
                              : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
                          )}
                        >
                          <PencilLine className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {v.reemplazada.motivo ?? "Se corrigió sin anotar el motivo."}
                        </p>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </AdminModal>
  );
}
