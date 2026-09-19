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
import { fmtRange, type Plan } from "./loth-plan-shared";
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

      {/* La carátula del plan en una línea: los mismos ocho datos que antes
          ocupaban una tarjeta de dos filas con el titular como título. */}
      {plan && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Dato k="N° plan" v={plan.planNumber} />
          <Dato k="Título hab." v={plan.tituloHabilitante} mono />
          <Dato k="Resolución" v={plan.resolucionNumber} />
          <Dato k="Parcela" v={plan.parcelaCorta} />
          <Dato k="Región" v={plan.region} />
          <Dato k="Área" v={plan.areaHa ? `${Number(plan.areaHa).toFixed(2)} ha` : null} mono />
          <Dato k="Vigencia" v={fmtRange(plan.vigenciaDesde, plan.vigenciaHasta)} />
          <Dato k="Estado" v={plan.estado} />
        </dl>
      )}

      {kpis && !abierto && <ResumenEnLinea k={kpis} />}
      {kpis && (
        <div id={PANEL_ID} hidden={!abierto} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tarjetas k={kpis} />
        </div>
      )}
    </section>
  );
}

function Dato({ k, v, mono = false }: { k: string; v: string | null; mono?: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="shrink-0 text-[var(--text-tertiary)]">{k}</dt>
      <dd className={`min-w-0 font-medium text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`}>{v || "—"}</dd>
    </div>
  );
}

const pctTxt = (p: number | null) => (p == null ? "—" : `${p.toFixed(0)}%`);
/** Número con `dp` decimales (mismo formato que las tarjetas de antes). */
const fx = (v: number, dp: number) => v.toFixed(dp);
const tonoPct = (p: number | null) => (p == null ? undefined : p > 100 ? "danger" : p >= 85 ? "warn" : undefined);

/** Plegado: las cinco cifras de las tarjetas, en el mismo orden, en una línea. */
function ResumenEnLinea({ k }: { k: KpisPlan }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <CifraLinea valor={`${fx(k.autorizadoTotal, 0)} m³`} label={`autorizados · ${k.especies} ${k.especies === 1 ? "especie" : "especies"}`} />
      <span aria-hidden="true" className="text-[var(--text-tertiary)]">·</span>
      <CifraLinea valor={pctTxt(k.aprovechamientoPct)} label={`aprovechado (${fx(k.movilizadoTotal, 1)} m³ movilizados)`} tono={tonoPct(k.aprovechamientoPct)} />
      <span aria-hidden="true" className="text-[var(--text-tertiary)]">·</span>
      <CifraLinea valor={`${fx(k.saldoTotal, 1)} m³`} label="de saldo" />
      <span aria-hidden="true" className="text-[var(--text-tertiary)]">·</span>
      <CifraLinea valor={k.censoTotal.toLocaleString("es-PE")} label={k.censoTotal === 1 ? "árbol censado" : "árboles censados"} tono={k.censoTruncado ? "warn" : undefined} />
      <span aria-hidden="true" className="text-[var(--text-tertiary)]">·</span>
      <CifraLinea
        valor={`${k.okCount}/${k.controlCount}`}
        label={k.fueraDelPlan > 0 ? `especies en regla · ${k.fueraDelPlan} fuera del plan` : "especies en regla"}
        tono={k.fueraDelPlan > 0 ? "danger" : undefined}
      />
    </p>
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
