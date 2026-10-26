"use client";

/**
 * Las piezas del «Chequeo del libro» (Cumplimiento del Libro TH): el puntaje,
 * el veredicto en una línea, la tarjeta de cada problema y lo que está en
 * orden. Salieron de `LothCompliancePanel` (17-10) cuando la vista se partió en
 * «Chequeo» y «Cerrar el mes»; las forma `LothCumplimientoChequeo`.
 *
 * El veredicto era una caja de 72 px (título + una línea de detalle) y debajo,
 * en otra fila, los tres contadores (bloqueos · advertencias · en orden) que
 * repetían ese detalle con otras palabras. Ahora es UNA línea: el veredicto,
 * los tres contadores y el ⓘ con la frase entera.
 *
 * 26-10: cada problema trae sus casos (cuál guía, cuál árbol) y la norma en el
 * ⓘ; lo que está en orden se mudó a `LothChequeoSecciones`, por sección.
 */

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  ShieldAlert,
  ShieldCheck,
} from "@buleje/design-system/icons";
import { useState } from "react";
import { ErrorAlert, WarningAlert } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { normaDe } from "@/lib/forestal/loth-chequeo-secciones";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BulejeGaugeChart } from "@/components/ui-system/charts";
import type { LothCheck, LothComplianceResult, LothComplianceTone, LothNavTarget } from "@/lib/forestal/loth-compliance";
import { Btn } from "./ctp-shared";
import { SERIE } from "@/components/admin/shared/chart-palette";

export const TONE_LABEL: Record<LothComplianceTone, string> = {
  success: "Libro al día",
  warning: "Hay puntos que revisar",
  error: "Requiere atención",
};
/** El tono «al día» cuando una parte del chequeo no se pudo leer: nunca se dice «al día» sin ella. */
export const TONE_A_MEDIAS = "Falta revisar una parte";
const GAUGE_COLOR: Record<LothComplianceTone, string> = {
  success: SERIE.ingresos,
  warning: SERIE.alerta,
  error: SERIE.gastos,
};
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** El puntaje y cómo se compone: la tarjeta de «Indicadores». */
export function PuntajeLoth({ result, etiqueta }: { result: LothComplianceResult; etiqueta?: string }) {
  const { breakdown, score, tone } = result;
  const totalRestado = breakdown.reduce((a, d) => a + d.puntos, 0);
  return (
    <div className="grid gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
      <div className="flex justify-center">
        <BulejeGaugeChart value={score} max={100} size={190} color={GAUGE_COLOR[tone]} sublabel="de 100" label={etiqueta ?? TONE_LABEL[tone]} />
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-[var(--text-tertiary)]" />
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Cómo se compone · 100 {totalRestado > 0 ? `− ${totalRestado} deducidos` : "· sin deducciones"}
          </p>
        </div>
        <ul className="space-y-1.5">
          {breakdown.map((d) => (
            <li key={d.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${d.puntos > 0 ? "bg-[var(--data-error-500)]" : "bg-[var(--data-success-500)]"}`} aria-hidden="true" />
                <span className="truncate text-[var(--text-secondary)]">{d.label}</span>
              </span>
              {d.puntos > 0 ? (
                <span className="shrink-0 font-mono font-bold tabular-nums text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  −{d.puntos} pts <span className="text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">({d.casos} {plural(d.casos, "caso", "casos")})</span>
                </span>
              ) : (
                <span className="shrink-0 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">sin restar</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const READINESS_META = {
  ready: { Icon: ShieldCheck, box: "border-[var(--data-success-500)]/30 bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/10", text: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", title: "El libro resiste una fiscalización" },
  warning: { Icon: AlertTriangle, box: "border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10", text: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]", title: "El libro está en pie, con advertencias" },
  error: { Icon: ShieldAlert, box: "border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10", text: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]", title: "Corrige antes de una fiscalización" },
} as const;
/** «Listo» con algo sin leer: tono de advertencia y sin prometer que resiste una fiscalización. */
const A_MEDIAS_META = { ...READINESS_META.warning, title: "Sin problemas en lo revisado — falta revisar una parte" };

/** El veredicto en una línea: qué tan listo está, los tres contadores y el detalle en el ⓘ. */
export function ReadinessBanner({
  readiness,
  aMedias = false,
  bloqueos,
  advertencias,
  enOrden,
  onNavigate,
}: {
  readiness: LothComplianceResult["readiness"];
  /** Una parte del chequeo no se pudo leer: «listo» no se afirma (ver «Sin revisar»). */
  aMedias?: boolean;
  bloqueos: number;
  advertencias: number;
  enOrden: number;
  onNavigate: (t: LothNavTarget) => void;
}) {
  const enDuda = aMedias && readiness === "ready";
  const m = enDuda ? A_MEDIAS_META : READINESS_META[readiness];
  const detail =
    readiness === "error"
      ? `${bloqueos} ${plural(bloqueos, "bloqueo debe resolverse", "bloqueos deben resolverse")}${advertencias > 0 ? ` · ${advertencias} ${plural(advertencias, "advertencia", "advertencias")} por revisar` : ""}.`
      : readiness === "warning"
        ? `Sin bloqueos · ${advertencias} ${plural(advertencias, "advertencia por revisar", "advertencias por revisar")}.`
        : enDuda
          ? "Sin bloqueos ni advertencias en lo revisado, pero una parte no se pudo revisar (mira «Sin revisar» abajo)."
          : "Sin bloqueos ni advertencias — la cadena de custodia está completa.";
  return (
    <div data-veredicto={readiness} data-a-medias={enDuda || undefined} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-1.5 ${m.box}`}>
      <span className="inline-flex min-w-0 items-center gap-2">
        <m.Icon className={`h-5 w-5 shrink-0 ${m.text}`} aria-hidden="true" />
        <strong className={`text-sm font-bold ${m.text}`}>{m.title}</strong>
        <InfoTip title={m.title} what={detail} />
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <TriageChip icon={ShieldAlert} count={bloqueos} label={plural(bloqueos, "bloqueo", "bloqueos")} tone="error" />
        <TriageChip icon={AlertTriangle} count={advertencias} label={plural(advertencias, "advertencia", "advertencias")} tone="warning" />
        <TriageChip icon={CheckCircle2} count={enOrden} label="en orden" tone="success" />
      </span>
      {readiness === "ready" && (
        <Btn variant="primary" size="sm" onClick={() => onNavigate("rentabilidad")} className="ml-auto shrink-0">
          <ShieldCheck className="h-4 w-4" /> Ver rentabilidad
        </Btn>
      )}
    </div>
  );
}

const TRIAGE_TONE = {
  error: { on: "bg-[var(--data-error-100)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]", off: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
  warning: { on: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]", off: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
  success: { on: "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]", off: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
} as const;

function TriageChip({ icon: Icon, count, label, tone }: { icon: typeof AlertCircle; count: number; label: string; tone: keyof typeof TRIAGE_TONE }) {
  const cls = count > 0 ? TRIAGE_TONE[tone].on : TRIAGE_TONE[tone].off;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold ${cls}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="tabular-nums">{count}</span> {label}
    </span>
  );
}

/** Un problema: qué hacer a la vista, cuáles son (los casos), y el porqué (la norma) en el ⓘ. */
export function ProblemCard({ check, onNavigate }: { check: LothCheck; onNavigate: () => void }) {
  const AlertComp = check.severity === "error" ? ErrorAlert : WarningAlert;
  const norma = normaDe(check);
  return (
    <AlertComp
      title={check.title}
      description={
        <>
          <strong>{check.action}</strong>{" "}
          <InfoTip title={check.title} ancho="w-80" what={check.description} affects={norma ? `Norma: ${norma}` : undefined} />
          {check.casos && check.casos.length > 0 && <CasosDelProblema casos={check.casos} total={check.count} />}
        </>
      }
      action={
        <button type="button" onClick={onNavigate} className={button({ variant: "secondary", className: "shrink-0" })}>
          {check.navigateLabel}
        </button>
      }
    />
  );
}

/** Cuántos casos se ven de entrada; el resto, con «Ver los otros». */
const CASOS_A_LA_VISTA = 3;

/** Cuáles son: la guía, el árbol o el plan de cada caso, en una frase. */
function CasosDelProblema({ casos, total }: { casos: string[]; total: number }) {
  const [todos, setTodos] = useState(false);
  const visibles = todos ? casos : casos.slice(0, CASOS_A_LA_VISTA);
  const ocultos = casos.length - visibles.length;
  /* El servidor manda hasta 50: lo que no vino se dice, no se esconde. */
  const fuera = total - casos.length;
  return (
    <>
      {/* La descripción del aviso del DS es un <p>: una <ul> adentro rompe la hidratación, por eso spans con rol de lista. */}
      <span role="list" className="mt-2 block space-y-1 text-sm font-normal">
        {visibles.map((c, i) => (
          <span role="listitem" key={`${i}-${c}`} className="flex gap-2">
            <span aria-hidden="true" className="select-none">·</span>
            <span className="min-w-0 break-words">{c}</span>
          </span>
        ))}
      </span>
      {(ocultos > 0 || (todos && fuera > 0)) && (
        <span className="mt-1 flex flex-wrap items-center gap-x-3">
          {ocultos > 0 && (
            <button type="button" onClick={() => setTodos(true)} className={button({ variant: "ghost", className: "-ml-3" })}>
              Ver los otros {ocultos}
            </button>
          )}
          {todos && fuera > 0 && <span className="text-sm text-[var(--text-tertiary)]">y {fuera} más (se listan los primeros {casos.length})</span>}
        </span>
      )}
    </>
  );
}
