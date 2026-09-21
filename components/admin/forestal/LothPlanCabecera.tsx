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
 *   · los indicadores se pliegan y la preferencia se RECUERDA en el navegador,
 *     con el mismo patrón que las secciones del libro (`LothSeccionKpis`).
 *     Arrancan plegados y, plegados, dicen sus cifras en una línea: las
 *     mismas cuentas que las tarjetas, nunca otras.
 */

import { SectionTitle, StatCard } from "@buleje/design-system";
import { BarChart3, FileText, Scale, ShieldAlert, ShieldCheck, TreePine, TrendingUp } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { type Plan } from "./loth-plan-shared";
import LothPlanIdentidad from "./LothPlanIdentidad";
import { BotonPlegar, CifraLinea } from "./loth-plan-ui";

/** Clave de la preferencia. Exportada: la prueba en navegador la lee. */
export const CLAVE_INDICADORES_PLAN = "loth:plan:indicadores-abiertos";

export interface KpisPlan {
  autorizadoTotal: number;
  especies: number;
  /** `null` sin volumen autorizado: un porcentaje de cero no se puede calcular. */
  aprovechamientoPct: number | null;
  movilizadoTotal: number;
  saldoTotal: number;
  censoTotal: number;
  censoTruncado: boolean;
  /** Árboles que se trajeron del censo (menos que el total si vino cortado). */
  cargados: number;
  georrefPct: number;
  okCount: number;
  controlCount: number;
  fueraDelPlan: number;
}

const PANEL_ID = "loth-plan-indicadores";

export default function LothPlanCabecera({ plans, planId, onPlan, plan, kpis, opciones }: {
  plans: Plan[];
  planId: string | null;
  onPlan: (id: string | null) => void;
  plan: Plan | null;
  kpis: KpisPlan | null;
  opciones: MenuAccion[];
}) {
  const [abierto, setAbierto] = useLocalStorage<boolean>(CLAVE_INDICADORES_PLAN, false);

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
          {kpis && (
            <BotonPlegar
              abierto={abierto}
              onClick={() => setAbierto(!abierto)}
              controla={PANEL_ID}
              label="Indicadores"
              icon={BarChart3}
              compacto
              titulo={abierto ? "Oculta los indicadores. Se recuerda en este navegador." : "Muestra los indicadores del plan"}
            />
          )}
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

      {kpis && !abierto && <ResumenEnLinea k={kpis} />}
      {kpis && (
        <div id={PANEL_ID} hidden={!abierto} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tarjetas k={kpis} />
        </div>
      )}
    </section>
  );
}

const pctTxt = (p: number | null) => (p == null ? "—" : `${p.toFixed(0)}%`);
/** Número con `dp` decimales (mismo formato que las tarjetas de antes). */
const fx = (v: number, dp: number) => v.toFixed(dp);
const tonoPct = (p: number | null) => (p == null ? undefined : p > 100 ? "danger" : p >= 85 ? "warn" : undefined);

/**
 * Plegado: las mismas cinco cifras de las tarjetas, en el mismo orden.
 *
 * Antes iban en un párrafo separadas por puntos medios: «320 m³ autorizados · 1
 * especie · 1% aprovechado (4.1 m³ movilizados) · 315.9 m³ de saldo · …». Una
 * fila de texto donde ninguna cifra se podía encontrar sin leerlas todas.
 * Ahora cada una tiene su casilla, con la etiqueta arriba y el número abajo:
 * ocupa lo mismo y se lee de un vistazo.
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
        valor={k.censoTotal.toLocaleString("es-PE")}
        nota={k.censoTruncado ? `calculando sobre ${k.cargados}` : `${k.georrefPct}% con GPS`}
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

function Tarjetas({ k }: { k: KpisPlan }) {
  const pct = k.aprovechamientoPct;
  return (
    <>
      <StatCard density="compact" label="Vol. autorizado" value={`${fx(k.autorizadoTotal, 0)} m³`} subValue={`${k.especies} especie${k.especies === 1 ? "" : "s"}`} icon={FileText} emphasis="neutral" />
      <StatCard density="compact" label="Aprovechamiento POA" value={pctTxt(pct)} subValue={`${fx(k.movilizadoTotal, 1)} m³ movilizados`} icon={TrendingUp} emphasis={pct == null ? "neutral" : pct > 100 ? "error" : pct >= 85 ? "warning" : "success"} />
      <StatCard density="compact" label="Saldo disponible" value={`${fx(k.saldoTotal, 1)} m³`} subValue={pct == null ? "sin volumen autorizado" : `${Math.max(0, 100 - pct).toFixed(0)}% del POA`} icon={Scale} emphasis="success" />
      <StatCard density="compact" label="Árboles censados" value={k.censoTotal.toString()} subValue={k.censoTruncado ? `calculando sobre ${k.cargados}` : `${k.georrefPct}% con GPS`} icon={TreePine} emphasis={k.censoTruncado ? "warning" : "neutral"} />
      <StatCard density="compact" label="Control de especies" value={`${k.okCount}/${k.controlCount}`} subValue={k.fueraDelPlan > 0 ? `${k.fueraDelPlan} fuera del plan` : "todo autorizado"} icon={k.fueraDelPlan > 0 ? ShieldAlert : ShieldCheck} emphasis={k.fueraDelPlan > 0 ? "error" : "success"} />
    </>
  );
}
