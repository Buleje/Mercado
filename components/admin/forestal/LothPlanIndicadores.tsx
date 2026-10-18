"use client";

/**
 * Indicadores del Plan de manejo: las cinco cifras del POA, cada una diciendo
 * contra qué se compara.
 *
 * 1. PLEGABLES COMO EN EL RESTO DEL LIBRO (Brandon 17-10: «compactar el Libro
 *    TH» como el CTP). Antes eran tres estados propios —tarjetas, cifras en una
 *    línea u ocultas— con su control en una fila aparte. Ahora son el botón
 *    «Indicadores» del riel (`useKpisPlegables`): cerrado, las cifras viajan en
 *    el `title` del botón; abierto, la banda «Aprovechamiento» y las tarjetas.
 *    Esto sólo arma las tarjetas (`useTarjetasPlan`) y el titular
 *    (`resumenPlan`); la cabecera decide dónde van.
 *
 * 2. CADA TARJETA DICE CONTRA QUÉ SE COMPARA. Un «1 %» de aprovechamiento no
 *    significa nada solo: significa algo contra el plazo que ya corrió. El
 *    ritmo sale de `analizarZafra` —la MISMA función que dibuja el panel de
 *    Zafra más abajo— y los días que faltan, de `estadoVigencia`, que es de
 *    donde los toma la carátula. Dos lecturas del mismo dato con dos cuentas
 *    distintas se pelean por un día, y entonces no se le cree a ninguna.
 *
 * Lo que todavía NO se puede decir: CUÁLES especies están fuera del plan (acá
 * sólo llega el conteo) y los m³/ha de lo autorizado —el POA ya publica una
 * intensidad calculada sobre el volumen APROVECHABLE del censo
 * (`LothPoaPanel`); otra cifra con la misma unidad y otro numerador al lado
 * sería una contradicción, no un dato—.
 */

import { useMemo, type ReactNode } from "react";
import { StatCard } from "@buleje/design-system";
import { FileText, Scale, ShieldAlert, ShieldCheck, TreePine, TrendingUp } from "@buleje/design-system/icons";
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

/**
 * Las tarjetas del plan, una por indicador. Con la banda «Aprovechamiento»
 * arriba (`conBanda`), la tarjeta «Aprovechamiento POA» sobra: la banda dice
 * el mismo % con su barra. Sin plan, ninguna.
 */
export function useTarjetasPlan(k: KpisPlan | null, plan: Plan | null, conBanda: boolean): ReactNode[] {
  const ctx = useContexto(plan, k);
  return k ? tarjetasDe(k, ctx, conBanda) : [];
}

/** El titular del botón cerrado: las cifras que se miran primero, de las mismas cuentas. */
export function resumenPlan(k: KpisPlan): string {
  return [
    `${pctTxt(k.aprovechamientoPct)} aprovechado`,
    `saldo ${fx(k.saldoTotal, 1)} m³`,
    `${ent(k.okCount)}/${ent(k.controlCount)} especies en regla`,
  ].join(" · ");
}

interface Contexto { vig: EstadoVigencia; zafra: ZafraAnalisis }

/** El plazo: lo único que convierte un porcentaje suelto en una noticia. */
function useContexto(plan: Plan | null, k: KpisPlan | null): Contexto {
  return useMemo(() => {
    const hoy = new Date();
    return {
      vig: estadoVigencia(plan?.vigenciaHasta, plan?.estado, hoy),
      zafra: analizarZafra({
        vigenciaDesde: plan?.vigenciaDesde ?? null,
        vigenciaHasta: plan?.vigenciaHasta ?? null,
        autorizadoM3: k?.autorizadoTotal ?? 0,
        movilizadoM3: k?.movilizadoTotal ?? 0,
        hoy,
      }),
    };
  }, [plan, k?.autorizadoTotal, k?.movilizadoTotal]);
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
  if (k.censoTotal === 0) return "sin censo: impórtalo desde Opciones";
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

function tarjetasDe(k: KpisPlan, ctx: Contexto, conBanda: boolean): ReactNode[] {
  const pct = k.aprovechamientoPct;
  const ritmo = ritmoDelPoa(ctx.zafra);
  const plural = k.especies === 1 ? "" : "s";
  const tarjetas: ReactNode[] = [
      <StatCard
        key="autorizado"
        density="compact" icon={FileText} emphasis="neutral"
        label="Vol. autorizado" value={`${fx(k.autorizadoTotal, 0)} m³`}
        subValue={`${ent(k.especies)} especie${plural} autorizada${plural}`}
        deltaLabel="techo del POA: no se acumula al vencer"
      />,
  ];
  if (!conBanda) {
    tarjetas.push(
      <StatCard
        key="aprovechamiento"
        density="compact" icon={TrendingUp}
        emphasis={pct == null ? "neutral" : pct > 100 ? "error" : pct >= 85 ? "warning" : "success"}
        label="Aprovechamiento POA" value={pctTxt(pct)}
        subValue={`${fx(k.movilizadoTotal, 1)} de ${fx(k.autorizadoTotal, 0)} m³ movilizados`}
        /* Adelantarse al plazo es buena noticia: el saldo que no sale a tiempo
           se pierde. El exceso sobre lo autorizado ya lo grita el color. */
        delta={ritmo.delta} deltaLabel={ritmo.label} deltaPolarity="normal"
      />,
    );
  }
  tarjetas.push(
      <StatCard
        key="saldo"
        density="compact" icon={Scale}
        emphasis={ctx.zafra.estado === "vencida" && k.saldoTotal > 0 ? "error" : "success"}
        label="Saldo disponible" value={`${fx(k.saldoTotal, 1)} m³`}
        subValue={pct == null ? "sin volumen autorizado" : `${Math.max(0, 100 - pct).toFixed(0)}% del POA sin usar`}
        deltaLabel={saldoContra(k, ctx.zafra, ctx.vig)}
      />,
      <StatCard
        key="censo"
        density="compact" icon={TreePine} emphasis={k.censoTruncado ? "warning" : "neutral"}
        label="Árboles censados" value={ent(k.censoTotal)}
        /* El % de GPS se mide sobre los árboles CARGADOS, que es lo que el pie
           aclara cuando el censo vino cortado. */
        subValue={`${k.georrefPct}% con coordenadas UTM`}
        deltaLabel={censoContra(k)}
      />,
      <StatCard
        key="especies"
        density="compact" icon={k.fueraDelPlan > 0 ? ShieldAlert : ShieldCheck}
        emphasis={k.fueraDelPlan > 0 ? "error" : "success"}
        label="Control de especies" value={`${ent(k.okCount)}/${ent(k.controlCount)}`}
        subValue="cruce censo ↔ autorizado ↔ movilizado"
        deltaLabel={especiesContra(k)}
      />,
  );
  return tarjetas;
}
