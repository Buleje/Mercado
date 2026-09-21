"use client";

/**
 * La identidad del plan de manejo, con forma.
 *
 * Antes eran ocho datos en una sola línea que envolvía: «N° plan PO-2026-001
 * Título hab. 17-CPO/C-J-045-26 Resolución RDF N° 045-2026-GRU-GERFOR Parcela
 * PC-12 Región Ucayali Área 850.00 ha Vigencia…». Todo cierto y todo al mismo
 * peso: para encontrar la resolución había que leer la línea entera, porque
 * nada indicaba dónde empezaba cada dato.
 *
 * Ahora van en tres grupos que responden tres preguntas distintas —qué
 * documento es, dónde queda, hasta cuándo sirve— y la vigencia deja de ser dos
 * fechas sueltas: dice **cuánto falta** y se pinta según urgencia
 * (`lib/forestal/loth-plan-vigencia.ts`).
 *
 * De paso entran dos datos que el plan ya guardaba y la pantalla no mostraba:
 * la **ARFFS** que lo aprobó y la **fecha** de la resolución.
 */

import { CardTitle } from "@buleje/design-system";
import { CalendarClock, FileText, MapPin } from "@buleje/design-system/icons";
import { estadoVigencia } from "@/lib/forestal/loth-plan-vigencia";
import { fmtFecha, type Plan } from "./loth-plan-shared";

const TONO_TEXTO = {
  ok: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  warn: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  danger: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  neutral: "text-[var(--text-secondary)]",
} as const;

const TONO_PUNTO = {
  ok: "bg-[var(--data-success-500)]",
  warn: "bg-[var(--data-warning-500)]",
  danger: "bg-[var(--data-error-500)]",
  neutral: "bg-[var(--text-tertiary)]",
} as const;

export default function LothPlanIdentidad({ plan }: { plan: Plan }) {
  const vig = estadoVigencia(plan.vigenciaHasta, plan.estado);

  return (
    <div className="grid gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 lg:grid-cols-3">
      <Grupo titulo="Documento" icon={FileText}>
        <Campo k="Tipo" v={plan.planType} />
        <Campo k="N° de plan" v={plan.planNumber} mono />
        <Campo k="Título habilitante" v={plan.tituloHabilitante} mono />
        <Campo
          k="Resolución"
          v={plan.resolucionNumber}
          nota={plan.resolucionDate ? fmtFecha(plan.resolucionDate) : null}
        />
        <Campo k="ARFFS" v={plan.arffs} />
      </Grupo>

      <Grupo titulo="Dónde" icon={MapPin}>
        <Campo k="Titular" v={plan.titularName} />
        <Campo k="Parcela de corta" v={plan.parcelaCorta} mono />
        <Campo k="Región" v={plan.region} />
        <Campo k="Área" v={plan.areaHa ? `${Number(plan.areaHa).toFixed(2)} ha` : null} mono />
      </Grupo>

      <Grupo titulo="Hasta cuándo" icon={CalendarClock}>
        <Campo k="Desde" v={plan.vigenciaDesde ? fmtFecha(plan.vigenciaDesde) : null} />
        <Campo k="Hasta" v={plan.vigenciaHasta ? fmtFecha(plan.vigenciaHasta) : null} />

        <p className={`flex items-center gap-1.5 pt-0.5 text-sm font-bold ${TONO_TEXTO[vig.tono]}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${TONO_PUNTO[vig.tono]}`} />
          {vig.texto}
        </p>
      </Grupo>
    </div>
  );
}

function Grupo({
  titulo,
  icon: Icon,
  children,
}: {
  titulo: string;
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-1.5 border-[var(--rule-soft)] max-lg:border-b max-lg:pb-3 lg:border-l lg:pl-4 lg:first:border-l-0 lg:first:pl-0 max-lg:last:border-b-0 max-lg:last:pb-0">
      <CardTitle
        as="h3"
        className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        {titulo}
      </CardTitle>
      <dl className="space-y-1">{children}</dl>
    </section>
  );
}

function Campo({ k, v, mono, nota }: { k: string; v?: string | null; mono?: boolean; nota?: string | null }) {
  const vacio = !v || !v.trim();
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-[var(--text-tertiary)]">{k}</dt>
      {/* Sin `truncate`: un N° de resolución cortado a la mitad no sirve para
          buscarlo en un expediente. Que baje de línea. */}
      <dd
        className={`min-w-0 break-words text-right text-sm font-semibold ${
          vacio ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"
        } ${mono && !vacio ? "font-mono" : ""}`}
        title={v ?? undefined}
      >
        {vacio ? "—" : v}
        {nota && <span className="ml-1.5 font-sans text-xs font-normal text-[var(--text-tertiary)]">{nota}</span>}
      </dd>
    </div>
  );
}
