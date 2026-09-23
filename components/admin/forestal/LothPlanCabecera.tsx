"use client";

/**
 * La cabecera del Plan de manejo: el ÚNICO título de la vista, el plan que se
 * está mirando, sus datos de carátula en una línea y los indicadores.
 *
 * Antes el titular del plan era un h3 más entre ocho títulos al mismo peso, la
 * carátula ocupaba una tarjeta de dos filas y los cinco indicadores otra fila
 * entera, siempre abiertos. Ahora:
 *
 *   · un `SectionTitle` («Plan de manejo») con el selector del plan al lado;
 *   · los botones de uso ocasional (informe, anexo, importar, nuevo plan)
 *     dentro de «Opciones»;
 *   · los indicadores se muestran como tarjetas, como una línea de cifras o no
 *     se muestran, y la preferencia se RECUERDA en el navegador.
 *
 * El control de los indicadores vivía acá arriba, en la esquina opuesta y
 * llamándose «Indicadores» al lado de «Opciones»: había que adivinar que ese
 * botón mandaba sobre unos números que estaban dos bloques más abajo. Ahora va
 * pegado a ellos (`LothPlanIndicadores`), que es donde se lo busca.
 */

import { SectionTitle } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { type Plan } from "./loth-plan-shared";
import LothPlanIdentidad from "./LothPlanIdentidad";
import { CifraLinea } from "./loth-plan-ui";
import {
  ControlIndicadores,
  PREF_INDICADORES_DEFAULT,
  TarjetasIndicadores,
  ent,
  fx,
  normalizarPref,
  pctTxt,
  tonoPct,
  vistaDe,
  type KpisPlan,
  type PrefIndicadores,
} from "./LothPlanIndicadores";

/**
 * Clave de la preferencia. Exportada: la prueba en navegador la lee.
 *
 * `-v2` porque lo guardado cambió de forma: antes era un booleano (abierto /
 * plegado) y ahora son dos cosas —qué forma y si está oculto—. Leer el valor
 * viejo con el tipo nuevo daría un estado sin sentido en el primer render.
 */
export const CLAVE_INDICADORES_PLAN = "loth:plan:indicadores-v2";

export type { KpisPlan };

const PANEL_ID = "loth-plan-indicadores";

export default function LothPlanCabecera({ plans, planId, onPlan, plan, kpis, opciones }: {
  plans: Plan[];
  planId: string | null;
  onPlan: (id: string | null) => void;
  plan: Plan | null;
  kpis: KpisPlan | null;
  opciones: MenuAccion[];
}) {
  const [guardada, setPref] = useLocalStorage<PrefIndicadores>(CLAVE_INDICADORES_PLAN, PREF_INDICADORES_DEFAULT);
  const pref = normalizarPref(guardada);
  const vista = vistaDe(pref);

  return (
    <section aria-labelledby="loth-plan-titulo" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SectionTitle id="loth-plan-titulo">Plan de manejo</SectionTitle>
        <select
          value={planId ?? ""}
          onChange={(e) => onPlan(e.target.value || null)}
          aria-label="Elegir plan de manejo"
          className="h-10 min-w-0 max-w-full truncate rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 max-sm:basis-full sm:max-w-[26rem]"
        >
          {plans.length === 0 && <option value="">Sin planes</option>}
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.planType} {p.planNumber ?? ""} — {p.titularName}
            </option>
          ))}
        </select>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ActionMenu
            label="Opciones"
            title="Informe de ejecución, anexo del POA, importar censo y nuevo plan"
            actions={opciones}
            size="sm"
            compactoEnMovil
          />
        </div>
      </div>

      {/* Los mismos datos, agrupados por la pregunta que contestan. Sueltos en
          una línea había que leerla entera para encontrar uno. */}
      {plan && <LothPlanIdentidad plan={plan} />}

      {kpis && (
        <div className="space-y-2">
          <ControlIndicadores pref={pref} onPref={setPref} panel={PANEL_ID} />
          {/* Oculto sigue existiendo en el DOM —`hidden`, no desmontado—: así
              el `aria-controls` de los botones apunta a algo que existe. */}
          <div id={PANEL_ID} hidden={vista === "oculto"}>
            {vista === "detalle"
              ? <TarjetasIndicadores k={kpis} plan={plan} />
              : <ResumenEnLinea k={kpis} />}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Estado `cifras`: las mismas cinco de las tarjetas, en el mismo orden y con
 * las mismas cuentas. Cada una en su casilla —etiqueta arriba, número abajo—:
 * ocupa una línea y se encuentra sin leer las otras cuatro.
 */
function ResumenEnLinea({ k }: { k: KpisPlan }) {
  const pct = k.aprovechamientoPct;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <Casilla etiqueta="Autorizado" valor={`${fx(k.autorizadoTotal, 0)} m³`} nota={`${k.especies} ${k.especies === 1 ? "especie" : "especies"}`} />
      <Casilla etiqueta="Aprovechado" valor={pctTxt(pct)} nota={`${fx(k.movilizadoTotal, 1)} m³ movilizados`} tono={tonoPct(pct)} />
      <Casilla etiqueta="Saldo" valor={`${fx(k.saldoTotal, 1)} m³`} nota={pct == null ? "sin volumen autorizado" : `${Math.max(0, 100 - pct).toFixed(0)}% del POA`} />
      <Casilla
        etiqueta="Censo"
        valor={ent(k.censoTotal)}
        nota={k.censoTruncado ? `calculando sobre ${ent(k.cargados)}` : `${k.georrefPct}% con GPS`}
        tono={k.censoTruncado ? "warn" : undefined}
      />
      <Casilla
        etiqueta="Especies en regla"
        valor={`${k.okCount}/${k.controlCount}`}
        nota={k.fueraDelPlan > 0 ? `${k.fueraDelPlan} fuera del plan` : "todo autorizado"}
        tono={k.fueraDelPlan > 0 ? "danger" : undefined}
      />
    </div>
  );
}

/** Una cifra con su etiqueta: lo mínimo para que se pueda encontrar. */
function Casilla({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: string; nota?: string; tono?: "ok" | "warn" | "danger" }) {
  const borde =
    tono === "danger" ? "border-[var(--data-error-500)]/50"
      : tono === "warn" ? "border-[var(--data-warning-500)]/50"
        : "border-[var(--rule-base)]";
  return (
    <div className={`min-w-0 rounded-xl border bg-[var(--surface-raised)] px-3 py-2 ${borde}`}>
      <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {etiqueta}
      </span>
      <CifraLinea valor={valor} tono={tono} />
      {nota && <span className="mt-0.5 block truncate text-xs text-[var(--text-tertiary)]" title={nota}>{nota}</span>}
    </div>
  );
}
