"use client";

/**
 * La fila de arriba del Control del permiso (ley de la vista, rule
 * `ui-components`): el título con las cifras que contesta, el permiso que se
 * mira y el menú «Opciones», en UNA fila.
 */

import { SectionTitle } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { nombreDelPlan, type PlanTablero } from "@/lib/forestal/loth-tablero-permiso";
import { PLAN_SIN_PLAN, UMBRAL_PATIO_DIAS, type ResumenEstado, type ResumenViejas } from "@/lib/forestal/loth-tablero-trozas";

export default function LothTableroCabecera({
  resumen,
  viejas,
  planes,
  planSel,
  haySinPlan,
  onElegirPlan,
  acciones,
}: {
  resumen: readonly ResumenEstado[];
  viejas: ResumenViejas;
  planes: readonly PlanTablero[];
  planSel: string | null;
  haySinPlan: boolean;
  onElegirPlan: (id: string | null) => void;
  acciones: MenuAccion[];
}) {
  const disp = resumen.find((r) => r.estado === "disponible");
  const desp = resumen.find((r) => r.estado === "despachada");
  const elegido = planes.find((p) => p.id === planSel) ?? null;

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="inline-flex items-center gap-1.5">
          <SectionTitle className="text-[var(--text-primary)]">Control del permiso</SectionTitle>
          <InfoTip
            title="Control del permiso"
            what="Qué pasó con cada troza del permiso: la que sigue en el patio, la que salió con GTF y la que se consumió adentro."
            affects="Elige el permiso para ver cuánto volumen le queda; marca trozas del patio para despacharlas con guía o imprimir sus etiquetas."
            example="Pasa la pistola por la etiqueta de la troza: queda resaltada y elegida."
            side="bottom"
          />
        </span>
        <p className="text-sm tabular-nums text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">{disp?.n ?? 0}</b> en patio ·{" "}
          <b className="text-[var(--text-primary)]">{fmtM3(disp?.m3 ?? 0)}</b> m³
          {viejas.n > 0 && (
            <>
              {" "}·{" "}
              <b className={viejas.criticas > 0 ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}>
                {viejas.n}
              </b>{" "}
              con más de {UMBRAL_PATIO_DIAS.atencion} días
            </>
          )}{" "}
          · <b className="text-[var(--text-primary)]">{desp?.n ?? 0}</b> {desp?.n === 1 ? "despachada" : "despachadas"}
        </p>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="tablero-permiso">
          Permiso
        </label>
        <select
          id="tablero-permiso"
          value={planSel ?? ""}
          onChange={(e) => onElegirPlan(e.target.value || null)}
          title={elegido ? `${nombreDelPlan(elegido)} · ${elegido.titularName ?? ""}` : "Las trozas de todos los permisos del libro"}
          className={`h-10 w-48 rounded-xl border-2 bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none ${
            planSel ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
          }`}
        >
          <option value="">Todos los permisos</option>
          {planes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.titularName && p.titularName !== nombreDelPlan(p) ? `${nombreDelPlan(p)} · ${p.titularName}` : nombreDelPlan(p)}
            </option>
          ))}
          {(haySinPlan || planSel === PLAN_SIN_PLAN) && <option value={PLAN_SIN_PLAN}>Sin plan</option>}
        </select>
        <ActionMenu label="Opciones del control" actions={acciones} size="sm" soloIcono />
      </div>
    </header>
  );
}
