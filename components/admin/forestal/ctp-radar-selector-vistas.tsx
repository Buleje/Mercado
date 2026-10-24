"use client";

/**
 * Las lecturas del Radar (Cadena · Cronología) y el enlace a Rendimiento.
 *
 * Rendimiento vive en Tablero › Rendimiento, con su rango por especie, la
 * plata por PT y el simulador (Brandon 17-10: «unificar pestañas que tienen
 * casi la misma función»): acá queda un enlace con las alertas contadas, para
 * que la merma rara no deje de verse desde el Radar. Quien no ve el Tablero ›
 * Rendimiento (permiso de Herramientas) conserva la pestaña de siempre.
 */

import { ArrowUpRight } from "@buleje/design-system/icons";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { HREF_RENDIMIENTO } from "./herramientas-grupos";
import { VISTAS, type Vista } from "./ctp-radar-tipos";

const CHIP_ALERTA_ACTIVA = "bg-white/25 text-white";
const CHIP_ALERTA =
  "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/20 dark:text-[var(--data-warning-500)]";

function ChipAlertas({ n, activa }: { n: number; activa: boolean }) {
  if (n <= 0) return null;
  return (
    <span
      className={`ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[length:var(--ts-2xs)] font-bold tabular-nums ${activa ? CHIP_ALERTA_ACTIVA : CHIP_ALERTA}`}
    >
      {n}
    </span>
  );
}

export default function CtpRadarSelectorVistas({
  vista,
  onVista,
  rendimientoPropio,
  rendimientoEnTablero,
  alertasCronologia,
  alertasRendimiento,
}: {
  vista: Vista;
  onVista: (v: Vista) => void;
  /** La pestaña Rendimiento sigue acá (sin permiso para el Tablero › Rendimiento). */
  rendimientoPropio: boolean;
  /** El enlace al Tablero › Rendimiento. */
  rendimientoEnTablero: boolean;
  alertasCronologia: number;
  alertasRendimiento: number;
}) {
  const items = rendimientoPropio ? VISTAS : VISTAS.filter((v) => v.key !== "rendimiento");
  return (
    <>
      <div className="inline-flex h-11 items-center overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {items.map((v) => {
          const Icon = v.icon;
          const activa = vista === v.key;
          const alertas = v.key === "cronologia" ? alertasCronologia : v.key === "rendimiento" ? alertasRendimiento : 0;
          return (
            <button
              key={v.key}
              type="button"
              title={v.hint}
              onClick={() => onVista(v.key)}
              aria-pressed={activa}
              className={`flex h-full items-center gap-1.5 px-3.5 text-sm font-semibold transition ${activa ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {v.label}
              <ChipAlertas n={alertas} activa={activa} />
            </button>
          );
        })}
      </div>
      {rendimientoEnTablero && (
        <button
          type="button"
          onClick={() => irAEnlace(HREF_RENDIMIENTO)}
          title="Producto por m³ de troza y mermas anómalas, por especie y por corrida: Tablero › Rendimiento"
          className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
        >
          Rendimiento
          <ChipAlertas n={alertasRendimiento} activa={false} />
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </>
  );
}
