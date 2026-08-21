"use client";

/**
 * CtpFletesCandidatosBanner — la bandeja de "esto ya está en el libro, faltás
 * vos" (ADR-318 addendum, 2026-08-20).
 *
 * Guías de ingreso que ya traen transportista/placa/conductor en la GTF pero
 * todavía no tienen su viaje anotado en Fletes. Agrupadas por fletero
 * (Brandon: "si hay dos guías de pepido, que se pongan juntas") con filtro
 * cuando hay varios y un botón para anotarlas todas en cadena.
 */

import { useMemo, useState } from "react";
import { AlertCircle, Plus } from "@buleje/design-system/icons";
import { claveBusqueda, formatearPlaca } from "@/lib/forestal/directorio";
import { TIPO_TRANSPORTE_LABEL, type CandidatoFlete } from "@/lib/forestal/fletes";
import { Btn } from "./ctp-shared";

/** Fecha date-only en UTC: sin esto, un viaje del día 1 se muestra el 31 en Lima. */
const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });

interface GrupoFletero {
  nombre: string;
  items: CandidatoFlete[];
}

export default function CtpFletesCandidatosBanner({
  candidatos,
  onAnotar,
  onAnotarGrupo,
}: {
  candidatos: CandidatoFlete[];
  onAnotar: (c: CandidatoFlete) => void;
  onAnotarGrupo: (grupo: CandidatoFlete[]) => void;
}) {
  const [filtro, setFiltro] = useState("");

  const grupos = useMemo<GrupoFletero[]>(() => {
    const mapa = new Map<string, CandidatoFlete[]>();
    for (const c of candidatos) {
      const clave = c.transportistaNombre ?? "Sin transportista";
      mapa.set(clave, [...(mapa.get(clave) ?? []), c]);
    }
    return [...mapa.entries()]
      .map(([nombre, items]) => ({ nombre, items }))
      .sort((a, b) => b.items.length - a.items.length || a.nombre.localeCompare(b.nombre, "es"));
  }, [candidatos]);

  const filtrados = useMemo(() => {
    const q = claveBusqueda(filtro);
    return q ? grupos.filter((g) => claveBusqueda(g.nombre).includes(q)) : grupos;
  }, [grupos, filtro]);

  if (candidatos.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--surface-sunken)] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" />
        <span className="text-sm font-bold text-[var(--text-primary)]">
          {candidatos.length} guía{candidatos.length === 1 ? "" : "s"} sin flete anotado
        </span>
        <span className="hidden truncate text-xs text-[var(--text-tertiary)] sm:inline">
          ya traen transportista y volumen en la GTF de ingreso
        </span>
        {grupos.length > 1 && (
          <input
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por fletero…"
            className="ml-auto h-9 w-full rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] sm:w-56"
          />
        )}
      </div>
      {filtrados.length === 0 ? (
        <p className="px-1 py-2 text-sm text-[var(--text-tertiary)]">Ningún fletero coincide con &ldquo;{filtro}&rdquo;.</p>
      ) : (
        <div className="space-y-3">
          {filtrados.map((g) => (
            <div key={g.nombre}>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--text-secondary)]">{g.nombre}</span>
                <span className="rounded bg-[var(--surface-raised)] px-1.5 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                  {g.items.length}
                </span>
                {g.items.length > 1 && (
                  <Btn size="sm" variant="ghost" className="ml-auto" onClick={() => onAnotarGrupo(g.items)}>
                    Anotar las {g.items.length}
                  </Btn>
                )}
              </div>
              <ul className="space-y-1.5">
                {g.items.map((c) => (
                  <li
                    key={c.gtfNumber}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2"
                  >
                    <span className="w-16 shrink-0 font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                      {fecha(c.fecha)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                          {c.placa ? formatearPlaca(c.placa) : "sin placa"}
                        </span>
                        <span className="font-mono text-xs text-[var(--text-tertiary)]">GTF {c.gtfNumber}</span>
                      </div>
                      <span className="block truncate text-xs text-[var(--text-tertiary)]">
                        {[
                          c.proveedorNombre,
                          c.volumenM3 != null ? `${Number(c.volumenM3).toFixed(4)} m³` : null,
                          c.conductorNombre ? `conductor ${c.conductorNombre}` : null,
                          TIPO_TRANSPORTE_LABEL[c.tipoTransporte],
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <Btn size="sm" variant="secondary" onClick={() => onAnotar(c)}>
                      <Plus className="h-3.5 w-3.5" />
                      Anotar viaje
                    </Btn>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
