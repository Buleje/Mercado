"use client";

/**
 * HistorialMarcaModal — las versiones de la marca de UN día (ADR-414 §4).
 *
 * Corregir una marca da de baja la viva y crea otra: esto es la línea de
 * tiempo completa, más nueva primero. Útil para saber quién tocó qué y por
 * qué («11/09: FALTA → PRESENTE»).
 */

import { useEffect, useState } from "react";
import { History } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { LoadingState } from "@buleje/design-system";
import { ESTADO_ASISTENCIA_META } from "../rrhh-ui";
import { etiquetaDia } from "@/lib/rrhh/fechas";
import type { AsistenciaDTO, ColaboradorMinDTO, FechaKey } from "@/lib/rrhh/tipos";

interface Props {
  open: boolean;
  onClose: () => void;
  colaborador: ColaboradorMinDTO;
  fecha: FechaKey;
  /** Este modal se abrió DESDE otro modal (ej. la ficha). */
  aboveModals?: boolean;
}

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
        console.error("[rrhh] historial falló", err);
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
      {versiones === null && !error && <LoadingState message="Cargando historial..." />}
      {error && <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
      {versiones && versiones.length === 0 && (
        <p className="text-sm text-[var(--text-tertiary)]">Sin correcciones — es la marca original.</p>
      )}
      {versiones && versiones.length > 0 && (
        <ol className="space-y-2">
          {versiones.map((v) => {
            const meta = ESTADO_ASISTENCIA_META[v.estado];
            return (
              <li key={v.id} className="rounded-xl border border-[var(--rule-base)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-bold ${meta.claseTexto}`}>{meta.letra} {meta.label}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">{new Date(v.marcadoEn).toLocaleString("es-PE")}</span>
                </div>
                {(v.entrada || v.salida) && (
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{v.entrada ?? "—"} – {v.salida ?? "—"}</p>
                )}
                {v.nota && <p className="mt-1 text-xs text-[var(--text-secondary)]">«{v.nota}»</p>}
                <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Marcado por {v.marcadoPor} · {v.origen === "masivo" ? "acción masiva" : "manual"}</p>
                {v.reemplazada && (
                  <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    Reemplazada el {new Date(v.reemplazada.en).toLocaleString("es-PE")}
                    {v.reemplazada.motivo && <> — {v.reemplazada.motivo}</>}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </AdminModal>
  );
}
