"use client";

/**
 * Una tarjeta de la grilla «Varios» del Plan de manejo: un plan entero de un
 * vistazo — qué es, de quién, dónde, cuánto lleva y cuánto le queda de plazo.
 *
 * Toda la tarjeta es el botón que abre el plan (lo mismo que elegirlo en el
 * selector). El color del estado va SIEMPRE con su palabra (la franja de la
 * izquierda y la pastilla dicen lo mismo, la segunda en texto).
 *
 * Las cifras cambian con el tipo, igual que la cabecera del plan abierto:
 *   · bosque     → autorizado · aprovechado (movilizado ÷ autorizado) · saldo;
 *   · plantación → registrado · talado · en pie (ADR-459).
 */

import { ArrowRight, Building2, MapPin } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { formatNumber } from "@/lib/format";
import type { PlanConFicha } from "@/lib/forestal/loth-planes-varios";
import type { Plan } from "./loth-plan-shared";
import { ETIQUETA_FICHA, TONO_FICHA } from "./LothFichaPermiso";
import type { ResumenPlan } from "./hooks/use-loth-planes-varios";

const m3 = (v: number) => `${formatNumber(v, Math.abs(v) < 10 ? 2 : Math.abs(v) < 1000 ? 1 : 0)} m³`;

/** «PASCO» → «Pasco»; lo que ya viene en mayúsculas y minúsculas se respeta. */
function nombrePropio(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()) : t;
}

function lugarDe(p: Plan): string | null {
  const partes = [p.distrito, p.provincia, p.region].map(nombrePropio).filter((x): x is string => !!x);
  const unicas = partes.filter((x, i) => partes.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  const area = Number(p.areaHa);
  const ha = p.areaHa != null && Number.isFinite(area) && area > 0 ? `${formatNumber(area, Number.isInteger(area) ? 0 : 2)} ha` : null;
  return [unicas.join(", "), ha].filter(Boolean).join(" · ") || null;
}

function cuanto(dias: number | null): string | null {
  if (dias == null) return null;
  if (dias < 0) return `venció hace ${formatNumber(-dias)} ${dias === -1 ? "día" : "días"}`;
  if (dias === 0) return "vence hoy";
  return `${dias === 1 ? "queda" : "quedan"} ${formatNumber(dias)} ${dias === 1 ? "día" : "días"}`;
}

interface Cifra { etiqueta: string; valor: string; nota: string; tono?: "warn" | "danger" }

function cifrasDe(esPlantacion: boolean, r: Extract<ResumenPlan, { estado: "ok" }>): { cifras: Cifra[]; pct: number | null; pctTexto: string } {
  const t = r.total;
  const especies = `${r.especies} ${r.especies === 1 ? "especie" : "especies"}`;
  if (esPlantacion) {
    const pct = t.pctTalado;
    return {
      pct,
      pctTexto: pct == null ? "sin m³ registrados" : `${formatNumber(pct, 0)}% talado`,
      cifras: [
        { etiqueta: "Registrado", valor: m3(t.baseM3), nota: especies, tono: r.especies === 0 ? "warn" : undefined },
        { etiqueta: "Talado", valor: m3(t.taladoM3), nota: `${m3(t.despachadoM3)} despachados`, tono: t.excedido ? "danger" : undefined },
        { etiqueta: "En pie", valor: m3(t.enPieM3), nota: t.enPieM3 < 0 ? "se taló de más" : "por talar", tono: t.enPieM3 < 0 ? "danger" : undefined },
      ],
    };
  }
  const pct = t.baseM3 > 0 ? (t.despachadoM3 / t.baseM3) * 100 : null;
  return {
    pct,
    pctTexto: pct == null ? "sin volumen autorizado" : `${formatNumber(pct, 0)}% aprovechado`,
    cifras: [
      { etiqueta: "Autorizado", valor: m3(t.baseM3), nota: especies, tono: r.especies === 0 ? "warn" : undefined },
      {
        etiqueta: "Aprovechado",
        valor: pct == null ? "—" : `${formatNumber(pct, 0)}%`,
        nota: `${m3(t.despachadoM3)} movilizados`,
        tono: pct != null && pct > 100 ? "danger" : pct != null && pct >= 85 ? "warn" : undefined,
      },
      { etiqueta: "Saldo", valor: m3(Math.max(0, t.baseM3 - t.despachadoM3)), nota: "por movilizar" },
    ],
  };
}

const TONO_CIFRA = {
  warn: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  danger: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
} as const;

export default function LothPlanTarjeta({ item, resumen, elegido, onElegir }: {
  item: PlanConFicha<Plan>;
  resumen: ResumenPlan | undefined;
  /** El plan elegido en el libro: se marca para no perderlo de vista. */
  elegido: boolean;
  onElegir: (id: string) => void;
}) {
  const { plan, ficha, nombre, tipoNombre, esPlantacion } = item;
  const tono = TONO_FICHA[ficha.estado];
  const lugar = lugarDe(plan);
  const dias = cuanto(ficha.diasQuedan);
  const ok = resumen?.estado === "ok" ? cifrasDe(esPlantacion, resumen) : null;
  const barra = ok?.pct == null ? 0 : Math.min(100, Math.max(0, ok.pct));
  const colorBarra = ok?.pct != null && ok.pct > 100 ? "bg-[var(--data-error-500)]" : ok?.pct != null && ok.pct >= 85 ? "bg-[var(--data-warning-500)]" : "bg-[var(--accent)]";

  return (
    <button
      type="button"
      onClick={() => onElegir(plan.id)}
      data-plan-tarjeta={plan.id}
      className={`group relative flex h-full w-full flex-col gap-3 overflow-hidden rounded-2xl border bg-[var(--surface-raised)] p-4 pl-5 text-left shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] hover:border-[var(--accent)] hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${elegido ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/40" : "border-[var(--rule-base)]"}`}
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${tono.barra}`} />

      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <Kicker className="block">{tipoNombre}</Kicker>
          {/* El código del permiso ES el dato: se parte en dos líneas antes que cortarse. */}
          <span className="mt-0.5 block text-base font-bold [overflow-wrap:anywhere] text-[var(--text-primary)]">{nombre}</span>
          {plan.alias && plan.alias !== nombre && (
            <span className="block truncate text-sm text-[var(--text-secondary)]">{plan.alias}</span>
          )}
        </span>
        <span className={`shrink-0 rounded-full border border-current/40 px-2 py-0.5 text-xs font-bold ${tono.cifra}`}>
          {ETIQUETA_FICHA[ficha.estado]}
        </span>
      </span>

      <span className="space-y-1 text-sm text-[var(--text-secondary)]">
        <span className="flex items-start gap-1.5">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
          <span className="line-clamp-2 font-semibold text-[var(--text-primary)]">{plan.titularName}</span>
        </span>
        {lugar && (
          <span className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
            <span className="truncate" title={lugar}>{lugar}</span>
          </span>
        )}
      </span>

      <span className="block rounded-xl bg-[var(--surface-sunken)] p-2.5">
        {ok ? (
          <>
            <span className="grid grid-cols-3 gap-2">
              {ok.cifras.map((c) => (
                <span key={c.etiqueta} className="min-w-0">
                  <Kicker className="block truncate">{c.etiqueta}</Kicker>
                  <span className={`block truncate text-sm font-bold tabular-nums ${c.tono ? TONO_CIFRA[c.tono] : "text-[var(--text-primary)]"}`}>{c.valor}</span>
                  <span className="block truncate text-xs text-[var(--text-tertiary)]" title={c.nota}>{c.nota}</span>
                </span>
              ))}
            </span>
            <span className="mt-2.5 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--rule-base)]">
                <span className={`block h-full rounded-full ${colorBarra}`} style={{ width: `${barra}%` }} />
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--text-secondary)]">{ok.pctTexto}</span>
            </span>
          </>
        ) : resumen?.estado === "error" ? (
          <span className="block py-3 text-center text-xs text-[var(--text-tertiary)]">No se pudo leer el avance. Ábrelo para verlo.</span>
        ) : (
          <span className="block animate-pulse space-y-2 py-1">
            <span className="sr-only">Leyendo el avance…</span>
            <span aria-hidden="true" className="block h-3 w-3/4 rounded bg-[var(--rule-base)]" />
            <span aria-hidden="true" className="block h-3 w-1/2 rounded bg-[var(--rule-base)]" />
            <span aria-hidden="true" className="block h-1.5 w-full rounded-full bg-[var(--rule-base)]" />
          </span>
        )}
      </span>

      <span className="mt-auto flex items-end gap-2 text-xs text-[var(--text-secondary)]">
        <span className="min-w-0 flex-1">
          {dias ? (
            <>
              <span className={`font-bold tabular-nums ${tono.cifra}`}>{dias}</span>
              {ficha.vigenciaHasta && <> · hasta el {ficha.vigenciaHasta}</>}
            </>
          ) : (
            <span className="font-semibold">{ficha.estadoTexto}</span>
          )}
        </span>
        {elegido ? (
          <span className="shrink-0 rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 font-semibold text-[var(--accent-dark)] dark:text-[var(--accent)]">
            El del libro
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 font-bold text-[var(--accent-dark)] dark:text-[var(--accent)]">
            Abrir <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        )}
      </span>
    </button>
  );
}
