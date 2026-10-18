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
 *
 * COMPACTA (Brandon 17-10: «compactar el Libro TH»): la ficha de tres grupos
 * medía 200 px y empujaba las pestañas del plan a la mitad de la pantalla. A la
 * vista queda UNA línea —titular, título habilitante, resolución, parcela, área
 * y la vigencia con su punto— y «Ver ficha» abre los tres grupos enteros. A
 * 400 px la línea se queda con titular y vigencia: el resto está en la ficha.
 */

import { useState } from "react";
import { Kicker } from "@buleje/design-system";
import { CalendarClock, ChevronDown, FileText, MapPin } from "@buleje/design-system/icons";
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

/** La identidad en una línea y, a pedido, la ficha entera debajo. */
export function LothPlanIdentidadLinea({ plan }: { plan: Plan }) {
  const [abierta, setAbierta] = useState(false);
  const vig = estadoVigencia(plan.vigenciaHasta, plan.estado);
  const datos = [
    { k: "Título habilitante", v: plan.tituloHabilitante ? `TH ${plan.tituloHabilitante}` : null, mono: true },
    { k: "Resolución", v: plan.resolucionNumber, mono: false },
    { k: "Parcela de corta", v: plan.parcelaCorta ? `Parcela ${plan.parcelaCorta}` : null, mono: true },
    { k: "Área", v: plan.areaHa ? `${Number(plan.areaHa).toFixed(2)} ha` : null, mono: true },
  ].filter((d): d is { k: string; v: string; mono: boolean } => !!d.v && !!d.v.trim());
  return (
    <div className="space-y-2" data-plan-identidad>
      <div className="flex min-w-0 items-center gap-x-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-3">
        <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-sm">
          <strong className="min-w-0 truncate font-bold text-[var(--text-primary)]" title={plan.titularName}>
            {plan.alias?.trim() || plan.titularName}
          </strong>
          {datos.map((d) => (
            <span
              key={d.k}
              title={`${d.k}: ${d.v}`}
              className={`min-w-0 truncate text-[var(--text-secondary)] max-md:hidden ${d.mono ? "font-mono text-xs" : ""}`}
            >
              <span className="sr-only">{d.k}: </span>
              {d.v}
            </span>
          ))}
          <span className={`inline-flex shrink-0 items-center gap-1.5 font-bold ${TONO_TEXTO[vig.tono]}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${TONO_PUNTO[vig.tono]}`} aria-hidden="true" />
            {vig.texto}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          aria-controls="loth-plan-ficha"
          title={abierta ? "Ocultar la ficha del plan" : "Documento, dónde queda y hasta cuándo sirve: todos los datos del plan"}
          className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          {abierta ? "Ocultar ficha" : "Ver ficha"}
          <ChevronDown className={`h-4 w-4 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>
      {abierta && (
        <div id="loth-plan-ficha">
          <LothPlanIdentidad plan={plan} />
        </div>
      )}
    </div>
  );
}

export default function LothPlanIdentidad({ plan }: { plan: Plan }) {
  const vig = estadoVigencia(plan.vigenciaHasta, plan.estado);

  return (
    <div className="grid gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 lg:grid-cols-3">
      <Grupo titulo="Documento" icon={FileText}>
        {/* Los datos de identidad (ADR-426) aparecen SÓLO si se cargaron: una
            ficha llena de «—» hace buscar el dato entre huecos. */}
        <Campo k="Apodo" v={plan.alias} omitirSiVacio />
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
        {/* El dueño del predio cuando no es el titular: en un PMFI son distintos. */}
        <Campo
          k="Propietario"
          v={plan.propietarioNombre}
          nota={plan.propietarioDoc ? `${plan.propietarioDocTipo ?? "Doc"} ${plan.propietarioDoc}` : null}
          omitirSiVacio
        />
        <Campo k="Parcela de corta" v={plan.parcelaCorta} mono />
        <Campo k="Región" v={[plan.region, plan.provincia, plan.distrito].filter(Boolean).join(" · ") || plan.region} />
        <Campo k="Sector" v={plan.sector} omitirSiVacio />
        <Campo k="Cuenca" v={plan.cuenca} omitirSiVacio />
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
      <Kicker
        as="h3"
        className="libro-kicker flex items-center gap-1.5"
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        {titulo}
      </Kicker>
      <dl className="space-y-1">{children}</dl>
    </section>
  );
}

function Campo({
  k,
  v,
  mono,
  nota,
  omitirSiVacio,
}: {
  k: string;
  v?: string | null;
  mono?: boolean;
  nota?: string | null;
  /** Los datos opcionales no dejan un «—» ocupando lugar: no se pintan. */
  omitirSiVacio?: boolean;
}) {
  const vacio = !v || !v.trim();
  if (vacio && omitirSiVacio) return null;
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
