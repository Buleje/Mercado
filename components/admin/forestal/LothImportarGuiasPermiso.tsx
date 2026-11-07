"use client";

/**
 * El permiso de un grupo de guías en «Importar guías despachadas» (ADR-461):
 * UNA decisión por título habilitante, no una por guía.
 *
 *   · existente → las trozas van a ese plan (se dice cuál).
 *   · nuevo     → se creará con los datos de la guía; se pueden corregir
 *                 (tipo, código, titular, resolución) antes de importar.
 *   · ambiguo   → hay más de un plan con ese código: la persona elige uno y
 *                 la vista previa del grupo se rehace contra él. (Crear otro
 *                 no se ofrece: el servidor lo rechaza con dos planes del mismo código.)
 *
 * Y el interruptor de la tala referencial: prendido en DEMA/PMFI/PO, apagado
 * en plantación (ADR-459: allí la tala no es obligatoria, sólo las trozas).
 */

import { useId, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, Plus, TreePine } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { siglaDePlan, TIPOS_PLAN_META } from "@/lib/forestal/loth-tipos-plan";
import type {
  PermisoDetectado,
  PlanNuevoPropuesto,
  TipoPlanImportado,
} from "@/lib/forestal/loth-importar-guia-tipos";
import type { DecisionGrupo, GrupoVista } from "./hooks/importar-guias-pantalla";

const TIPOS: readonly TipoPlanImportado[] = ["PLANTACION", "DEMA", "PMFI", "PO"];
const CAMPO =
  "h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] sm:text-sm";

/** El chip corto: en el libro / se creará / elegir. */
export function ChipPermiso({ permiso }: { permiso: PermisoDetectado | null }) {
  if (!permiso) return null;
  const base =
    "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold";
  if (permiso.estado === "existente")
    return (
      <span className={`${base} bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]`}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {siglaDePlan(permiso.plan.planType)} en
        el libro
      </span>
    );
  if (permiso.estado === "nuevo")
    return (
      <span
        className={`${base} bg-[var(--data-info-500)]/12 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]`}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Se creará{" "}
        {siglaDePlan(permiso.propuesta.planType)}
      </span>
    );
  return (
    <span className={`${base} bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]`}>
      Elige entre {permiso.candidatos.length} permisos
    </span>
  );
}

/** El código del plan nuevo: el registro en plantación, el título en los demás. */
const codigoDe = (p: PlanNuevoPropuesto) =>
  (p.planType === "PLANTACION" ? p.planNumber : p.tituloHabilitante) ??
  p.tituloHabilitante ??
  p.planNumber ??
  "";

function conCodigo(
  p: PlanNuevoPropuesto,
  tipo: TipoPlanImportado,
  codigo: string,
): PlanNuevoPropuesto {
  return tipo === "PLANTACION"
    ? { ...p, planType: tipo, planNumber: codigo, tituloHabilitante: null }
    : { ...p, planType: tipo, planNumber: null, tituloHabilitante: codigo };
}

/** El tipo de plan al que va el grupo, según lo decidido (para el interruptor de la tala). */
function tipoDecidido(grupo: GrupoVista, d: DecisionGrupo | undefined): string | null {
  const destino = d?.destino;
  if (!destino) return null;
  if (destino.tipo === "nuevo") return destino.plan.planType;
  const p = grupo.permiso;
  if (p?.estado === "existente") return p.plan.planType;
  if (p?.estado === "ambiguo")
    return p.candidatos.find((c) => c.planId === destino.planId)?.planType ?? null;
  return null;
}

export default function LothImportarGuiasPermiso({
  grupo,
  decision,
  onDecidir,
  onElegirPlan,
  recalculando,
}: {
  grupo: GrupoVista;
  decision: DecisionGrupo | undefined;
  onDecidir: (cambio: Partial<DecisionGrupo>) => void;
  /** Ambiguo: el plan elegido (y la tala que le corresponde si la persona no la tocó). Rehace la vista previa del grupo. */
  onElegirPlan: (planId: string, crearTala: boolean | undefined) => void;
  /** La vista previa del grupo se está rehaciendo contra el plan elegido. */
  recalculando: boolean;
}) {
  const p = grupo.permiso;
  if (!p) return null;
  const tipo = tipoDecidido(grupo, decision);
  const hayTalas = grupo.guias.some((g) => g.talas.length > 0);

  /* Cambiar el tipo de un plan nuevo mueve la tala por defecto, mientras la persona no la haya tocado. */
  const alPlanNuevo = (plan: PlanNuevoPropuesto) =>
    onDecidir({
      destino: { tipo: "nuevo", plan },
      ...(decision?.talaTocada ? {} : { crearTala: plan.planType !== "PLANTACION" }),
    });

  return (
    <div className="space-y-2">
      {p.estado === "existente" && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-primary)]">
          <TreePine className="h-4 w-4 shrink-0 text-[var(--data-success-ink)]" aria-hidden />
          Va al permiso <b>{siglaDePlan(p.plan.planType)}</b>
          <span className="font-mono [overflow-wrap:anywhere]">{p.plan.codigo ?? "—"}</span>
          <span className="text-[var(--text-secondary)]">· {p.plan.titularName}</span>
        </p>
      )}
      {p.estado === "nuevo" && decision?.destino?.tipo === "nuevo" && (
        <PlanNuevo plan={decision.destino.plan} onPlan={alPlanNuevo} />
      )}
      {p.estado === "ambiguo" && (
        <ElegirPermiso
          grupo={grupo}
          decision={decision}
          recalculando={recalculando}
          onExistente={(planId, planType) =>
            onElegirPlan(planId, decision?.talaTocada ? undefined : planType !== "PLANTACION")
          }
        />
      )}
      {hayTalas && decision && (
        <InterruptorTala
          prendido={decision.crearTala}
          plantacion={tipo === "PLANTACION"}
          onCambiar={(v) => onDecidir({ crearTala: v, talaTocada: true })}
        />
      )}
    </div>
  );
}

function PlanNuevo({
  plan,
  onPlan,
}: {
  plan: PlanNuevoPropuesto;
  onPlan: (p: PlanNuevoPropuesto) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const base = useId();
  const codigo = codigoDe(plan);
  const lugar = [plan.distrito, plan.provincia, plan.region].filter(Boolean).join(", ");
  const falta = !plan.titularName.trim() || !codigo.trim();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-primary)]">
        <Plus
          className="h-4 w-4 shrink-0 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
          aria-hidden
        />
        Se creará <b>{siglaDePlan(plan.planType)}</b>
        <span className="font-mono [overflow-wrap:anywhere]">{codigo || "sin código"}</span>
        <span className="text-[var(--text-secondary)]">· {plan.titularName || "sin titular"}</span>
        <InfoTip
          title="Permiso nuevo"
          what="No hay un plan con el código de la guía: se crea con los datos que publica SERFOR (tipo por el código del título, titular, resolución, lugar de origen y ARFFS)."
          affects="Se crea sin especies: lo registrado o autorizado lo pones tú en Plan de manejo. Hasta entonces el control de especies no juzga."
          example={
            [
              lugar && `Origen: ${lugar}`,
              plan.arffs && `ARFFS: ${plan.arffs}`,
              plan.representanteLegal && `Representante: ${plan.representanteLegal}`,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        />
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)]"
        >
          Corregir datos{" "}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>
      {falta && (
        <p className="text-sm font-semibold text-[var(--data-warning-ink)]">
          Falta {!codigo.trim() ? "el código" : "el titular"} del permiso para crearlo.
        </p>
      )}
      {abierto && (
        <div className="grid grid-cols-1 gap-2 rounded-lg bg-[var(--surface-sunken)] p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor={`${base}-tipo`}
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              Tipo
            </label>
            <select
              id={`${base}-tipo`}
              className={CAMPO}
              value={plan.planType}
              onChange={(e) => onPlan(conCodigo(plan, e.target.value as TipoPlanImportado, codigo))}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {TIPOS_PLAN_META[t].sigla} · {TIPOS_PLAN_META[t].para}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor={`${base}-codigo`}
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {plan.planType === "PLANTACION"
                ? "Código del registro"
                : "Código del título habilitante"}
            </label>
            <input
              id={`${base}-codigo`}
              className={`${CAMPO} font-mono`}
              value={codigo}
              onChange={(e) => onPlan(conCodigo(plan, plan.planType, e.target.value))}
            />
          </div>
          <div>
            <label
              htmlFor={`${base}-titular`}
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              Titular
            </label>
            <input
              id={`${base}-titular`}
              className={CAMPO}
              value={plan.titularName}
              onChange={(e) => onPlan({ ...plan, titularName: e.target.value })}
            />
          </div>
          <div>
            <label
              htmlFor={`${base}-resolucion`}
              className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]"
            >
              {plan.planType === "PLANTACION" ? "Constancia" : "Resolución"}
            </label>
            <input
              id={`${base}-resolucion`}
              className={CAMPO}
              value={plan.resolucionNumber ?? ""}
              onChange={(e) => onPlan({ ...plan, resolucionNumber: e.target.value || null })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ElegirPermiso({
  grupo,
  decision,
  recalculando,
  onExistente,
}: {
  grupo: GrupoVista;
  decision: DecisionGrupo | undefined;
  recalculando: boolean;
  onExistente: (planId: string, planType: string) => void;
}) {
  const nombre = useId();
  if (grupo.permiso?.estado !== "ambiguo") return null;
  const d = decision?.destino;
  const opcion =
    "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm";
  const marca = (on: boolean) =>
    on
      ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]"
      : "border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]";
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-sm font-semibold text-[var(--data-warning-ink)]">
        Hay {grupo.permiso.candidatos.length} permisos con el código{" "}
        <span className="font-mono">{grupo.titulo}</span>: elige a cuál van estas guías
      </legend>
      {grupo.permiso.candidatos.map((c) => {
        const on = d?.tipo === "existente" && d.planId === c.planId;
        return (
          <label key={c.planId} className={`${opcion} ${marca(on)}`}>
            <input
              type="radio"
              name={nombre}
              checked={on}
              disabled={recalculando}
              onChange={() => onExistente(c.planId, c.planType)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <b>{siglaDePlan(c.planType)}</b>
            <span className="font-mono">{c.codigo ?? "—"}</span>
            <span className="min-w-0 truncate text-[var(--text-secondary)]">· {c.titularName}</span>
            {c.especies.length > 0 && (
              <span className="ml-auto shrink-0 text-xs text-[var(--text-tertiary)]">
                {c.especies.length} especies
              </span>
            )}
          </label>
        );
      })}
      {recalculando && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Revisando las guías contra ese
          permiso…
        </p>
      )}
    </fieldset>
  );
}

function InterruptorTala({
  prendido,
  plantacion,
  onCambiar,
}: {
  prendido: boolean;
  plantacion: boolean;
  onCambiar: (v: boolean) => void;
}) {
  return (
    /* Sin wrap: a 400 px el ⓘ se quedaba solo en su renglón; el rótulo se parte adentro del botón. */
    <div className="flex items-center gap-2 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={prendido}
        onClick={() => onCambiar(!prendido)}
        className="inline-flex min-h-11 min-w-0 items-center gap-2 text-left font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span
          aria-hidden
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${prendido ? "bg-[var(--accent)]" : "bg-[var(--rule-strong)]/40"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--surface-raised)] shadow-[var(--shadow-sm)] transition-transform ${prendido ? "translate-x-5" : "translate-x-0.5"}`}
          />
        </span>
        <span className="min-w-0">Armar la tala referencial de cada árbol</span>
      </button>
      <InfoTip
        title="Tala referencial"
        what="Arma la tala de cada árbol con sus trozas de la guía: largo = suma de los largos, D1 = el mayor, D2 = el menor y m³ = suma de los m³. Queda marcada como referencial, con las trozas que la forman."
        affects={
          plantacion
            ? "En una plantación la tala no es obligatoria (sólo las trozas): por eso viene apagada."
            : "En DEMA, PMFI y PO lleva el control de volumen del permiso: trozado ≤ tala cierra exacto. Si el árbol ya tiene tala en el libro, se usa ésa."
        }
        example="Trozas 12A de 6 m y 12B de 3 m (D1 50 y 45 cm) → tala del árbol 12 con 9 m, D1 0,50 y D2 0,45."
      />
    </div>
  );
}
