"use client";

/**
 * Indicadores del Plan de manejo: las cinco cifras del POA, en tres estados y
 * diciendo cada una contra qué se compara.
 *
 * 1. SE PUEDEN OCULTAR. La ley de la casa dice que plegar no es esconder —un
 *    grupo plegado sigue diciendo sus cifras en una línea—, pero el control
 *    vivía arriba a la derecha, lejos de los números, y «plegado» igual se
 *    comía una fila entera. Brandon pidió poder sacarlas de la pantalla. Ahora
 *    son tres estados, con el control PEGADO al bloque que manda: `detalle`
 *    (las tarjetas), `cifras` (la línea compacta de siempre, el arranque) y
 *    `oculto` (nada, salvo el botón «Ver indicadores» que las trae de vuelta).
 *    La forma y el estar oculto se guardan por SEPARADO en la misma clave: al
 *    volver de «oculto» el bloque aparece como estaba, no en un default.
 *
 * 2. CADA TARJETA DICE CONTRA QUÉ SE COMPARA. Un «1 %» de aprovechamiento no
 *    significa nada solo: significa algo contra el plazo que ya corrió. El
 *    ritmo sale de `analizarZafra` —la MISMA función que dibuja el panel de
 *    Zafra más abajo— y los días que faltan, de `estadoVigencia`, que es de
 *    donde los toma la carátula que está tres centímetros más arriba. Dos
 *    lecturas del mismo dato con dos cuentas distintas se pelean por un día, y
 *    entonces no se le cree a ninguna.
 *
 * Lo que todavía NO se puede decir: CUÁLES especies están fuera del plan (acá
 * sólo llega el conteo) y los m³/ha de lo autorizado —el POA ya publica una
 * intensidad calculada sobre el volumen APROVECHABLE del censo
 * (`LothPoaPanel`); otra cifra con la misma unidad y otro numerador al lado
 * sería una contradicción, no un dato—.
 */

import { useMemo } from "react";
import { StatCard } from "@buleje/design-system";
import {
  BarChart3, Eye, EyeOff, FileText, LayoutGrid, Rows3, Scale,
  ShieldAlert, ShieldCheck, TreePine, TrendingUp, type LucideIcon,
} from "@buleje/design-system/icons";
import { estadoVigencia, type EstadoVigencia } from "@/lib/forestal/loth-plan-vigencia";
import { ZAFRA_ESTADO_LABEL, analizarZafra, type ZafraAnalisis } from "@/lib/forestal/loth-zafra";
import type { Plan } from "./loth-plan-shared";

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

/** Los tres estados que pidió el dueño. `oculto` es el que antes no existía. */
export type VistaIndicadores = "detalle" | "cifras" | "oculto";
export type FormaIndicadores = "detalle" | "cifras";

/** Lo que se recuerda en el navegador: la forma, y si está escondido. */
export interface PrefIndicadores {
  forma: FormaIndicadores;
  oculto: boolean;
}

export const PREF_INDICADORES_DEFAULT: PrefIndicadores = { forma: "cifras", oculto: false };

/** Un valor viejo —o tocado a mano— no deja el bloque sin estado válido. */
export function normalizarPref(v: unknown): PrefIndicadores {
  if (!v || typeof v !== "object") return PREF_INDICADORES_DEFAULT;
  const o = v as Partial<PrefIndicadores>;
  return { forma: o.forma === "detalle" ? "detalle" : "cifras", oculto: o.oculto === true };
}

export const vistaDe = (p: PrefIndicadores): VistaIndicadores => (p.oculto ? "oculto" : p.forma);

const FORMAS: { id: FormaIndicadores; label: string; icon: LucideIcon; titulo: string }[] = [
  { id: "detalle", label: "Tarjetas", icon: LayoutGrid, titulo: "Una tarjeta por indicador, con contra qué se compara cada cifra" },
  { id: "cifras", label: "Cifras", icon: Rows3, titulo: "Las mismas cinco cifras, en una sola línea" },
];

const BTN = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";

/**
 * El control, en la misma fila que los indicadores. Dos preguntas distintas,
 * dos controles: CÓMO se ven (tarjetas o cifras) y SI se ven. Un solo botón
 * que cicla obliga a pasar por el estado que no querés para llegar al que sí.
 */
export function ControlIndicadores({ pref, onPref, panel }: {
  pref: PrefIndicadores;
  onPref: (p: PrefIndicadores) => void;
  /** id del bloque que se muestra u oculta (`aria-controls`). */
  panel: string;
}) {
  const oculto = pref.oculto;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!oculto && (
        <>
          <span
            id={`${panel}-label`}
            className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
          >
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            Indicadores
          </span>
          <div
            role="group"
            aria-labelledby={`${panel}-label`}
            className="inline-flex items-center gap-0.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-0.5"
          >
            {FORMAS.map(({ id, label, icon: Icono, titulo }) => {
              const activo = pref.forma === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onPref({ forma: id, oculto: false })}
                  aria-pressed={activo}
                  aria-controls={panel}
                  title={titulo}
                  className={`${BTN} ${activo
                    ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}
                >
                  <Icono className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Este botón NO se desmonta al ocultar: cambia de cara. Si desapareciera,
          quien lo apretó con el teclado se quedaría sin foco en ninguna parte. */}
      <button
        type="button"
        onClick={() => onPref({ ...pref, oculto: !oculto })}
        aria-expanded={!oculto}
        aria-controls={panel}
        title={oculto
          ? "Vuelve a mostrar los indicadores del plan, como los tenías"
          : "Saca los indicadores de la pantalla. Se recuerda en este navegador."}
        className={`${BTN} border px-3 ${oculto
          ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"}`}
      >
        {oculto ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
        {oculto ? "Ver indicadores" : "Ocultar"}
      </button>
    </div>
  );
}

/** Estado `detalle`: una tarjeta por indicador, con su comparación al pie. */
export function TarjetasIndicadores({ k, plan }: { k: KpisPlan; plan: Plan | null }) {
  const ctx = useContexto(plan, k);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Tarjetas k={k} ctx={ctx} />
    </div>
  );
}

interface Contexto { vig: EstadoVigencia; zafra: ZafraAnalisis }

/** El plazo: lo único que convierte un porcentaje suelto en una noticia. */
function useContexto(plan: Plan | null, k: KpisPlan): Contexto {
  return useMemo(() => {
    const hoy = new Date();
    return {
      vig: estadoVigencia(plan?.vigenciaHasta, plan?.estado, hoy),
      zafra: analizarZafra({
        vigenciaDesde: plan?.vigenciaDesde ?? null,
        vigenciaHasta: plan?.vigenciaHasta ?? null,
        autorizadoM3: k.autorizadoTotal,
        movilizadoM3: k.movilizadoTotal,
        hoy,
      }),
    };
  }, [plan, k.autorizadoTotal, k.movilizadoTotal]);
}

export const pctTxt = (p: number | null) => (p == null ? "—" : `${p.toFixed(0)}%`);
/** Número con `dp` decimales (mismo formato que las tarjetas de antes). */
export const fx = (v: number, dp: number) => v.toFixed(dp);
export const ent = (v: number) => v.toLocaleString("es-PE");
export const tonoPct = (p: number | null) => (p == null ? undefined : p > 100 ? "danger" : p >= 85 ? "warn" : undefined);

/** Volumen movilizado contra plazo corrido: el desfase que ya calcula la zafra. */
function ritmoDelPoa(z: ZafraAnalisis): { delta: number | null; label: string } {
  if (z.estado === "sin_vigencia") return { delta: null, label: "sin vigencia: nada contra qué medirlo" };
  if (z.estado === "no_iniciada") return { delta: null, label: "la zafra todavía no arranca" };
  return { delta: z.desfasePct, label: `vs ${fx(z.avanceTiempoPct, 0)}% del plazo corrido` };
}

/** El saldo se mide en días: al vencer la autorización, lo que sobra se pierde. */
function saldoContra(k: KpisPlan, z: ZafraAnalisis, vig: EstadoVigencia): string {
  if (z.estado === "vencida" || vig.nivel === "vencido") {
    return k.saldoTotal > 0 ? "vigencia vencida: este saldo se pierde" : "zafra cerrada, sin saldo";
  }
  if (k.autorizadoTotal > 0 && k.saldoTotal <= 0) return "no queda saldo por movilizar";
  const dias = vig.diasRestantes;
  if (dias == null) return "sin fecha de vencimiento cargada";
  const ritmo = z.estado === "sin_vigencia" || z.estado === "no_iniciada" ? null : ZAFRA_ESTADO_LABEL[z.estado].toLowerCase();
  return ritmo ? `${ent(dias)} días · ${ritmo}` : `${ent(dias)} días por delante`;
}

/** Qué tanto del censo entra en las cuentas del POA. */
function censoContra(k: KpisPlan): string {
  if (k.censoTotal === 0) return "sin censo: importalo desde Opciones";
  if (k.censoTruncado) return `el POA se calcula sobre ${ent(k.cargados)}`;
  return "todos entran en el cálculo del POA";
}

function especiesContra(k: KpisPlan): string {
  if (k.controlCount === 0) return "todavía no hay especies que cruzar";
  if (k.fueraDelPlan > 0) return `${ent(k.fueraDelPlan)} fuera del plan aprobado`;
  const conAviso = k.controlCount - k.okCount;
  if (conAviso > 0) return `${ent(conAviso)} con aviso por revisar`;
  return "sin excesos ni especies fuera";
}

function Tarjetas({ k, ctx }: { k: KpisPlan; ctx: Contexto }) {
  const pct = k.aprovechamientoPct;
  const ritmo = ritmoDelPoa(ctx.zafra);
  const plural = k.especies === 1 ? "" : "s";
  return (
    <>
      <StatCard
        density="compact" icon={FileText} emphasis="neutral"
        label="Vol. autorizado" value={`${fx(k.autorizadoTotal, 0)} m³`}
        subValue={`${ent(k.especies)} especie${plural} autorizada${plural}`}
        deltaLabel="techo del POA: no se acumula al vencer"
      />
      <StatCard
        density="compact" icon={TrendingUp}
        emphasis={pct == null ? "neutral" : pct > 100 ? "error" : pct >= 85 ? "warning" : "success"}
        label="Aprovechamiento POA" value={pctTxt(pct)}
        subValue={`${fx(k.movilizadoTotal, 1)} de ${fx(k.autorizadoTotal, 0)} m³ movilizados`}
        /* Adelantarse al plazo es buena noticia: el saldo que no sale a tiempo
           se pierde. El exceso sobre lo autorizado ya lo grita el color. */
        delta={ritmo.delta} deltaLabel={ritmo.label} deltaPolarity="normal"
      />
      <StatCard
        density="compact" icon={Scale}
        emphasis={ctx.zafra.estado === "vencida" && k.saldoTotal > 0 ? "error" : "success"}
        label="Saldo disponible" value={`${fx(k.saldoTotal, 1)} m³`}
        subValue={pct == null ? "sin volumen autorizado" : `${Math.max(0, 100 - pct).toFixed(0)}% del POA sin usar`}
        deltaLabel={saldoContra(k, ctx.zafra, ctx.vig)}
      />
      <StatCard
        density="compact" icon={TreePine} emphasis={k.censoTruncado ? "warning" : "neutral"}
        label="Árboles censados" value={ent(k.censoTotal)}
        /* El % de GPS se mide sobre los árboles CARGADOS, que es lo que el pie
           aclara cuando el censo vino cortado. */
        subValue={`${k.georrefPct}% con coordenadas UTM`}
        deltaLabel={censoContra(k)}
      />
      <StatCard
        density="compact" icon={k.fueraDelPlan > 0 ? ShieldAlert : ShieldCheck}
        emphasis={k.fueraDelPlan > 0 ? "error" : "success"}
        label="Control de especies" value={`${ent(k.okCount)}/${ent(k.controlCount)}`}
        subValue="cruce censo ↔ autorizado ↔ movilizado"
        deltaLabel={especiesContra(k)}
      />
    </>
  );
}
