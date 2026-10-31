"use client";

/**
 * «Carpetas del plan», debajo de «Papeles del permiso»: el explorador de las
 * carpetas del plan en el Archivo (ADR-467) dentro de su tarjeta, con la
 * cuenta de documentos esperados en la cabecera —la que antes era una fila de
 * chips que repetía los papeles— y «Abrir en Documentos». Plegable y
 * recordado; plegado sigue diciendo cuántos faltan.
 *
 * Plegada NO se desmonta (`hidden`): lo que estés escribiendo en una carpeta
 * no se pierde por plegarla.
 */

import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown, ExternalLink } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { DIAS_VENCE_PRONTO } from "@/lib/forestal/plan-documentos-tipos";
import type { DocumentosDelPlan } from "../hooks/use-plan-documentos";
import PlanDocumentosDelPlan from "../plan-documentos/PlanDocumentosDelPlan";
import { loQueFalta } from "../plan-documentos/modelo";
import { enlaceAlDrive } from "../plan-documentos/plan-documentos-api";

/** Para llegar desde un papel («Ir a su carpeta»). */
export const ID_CARPETAS_DEL_PLAN = "loth-plan-carpetas";

export default function CarpetasDelPlan({
  planId,
  docs,
  abierta,
  onAbierta,
  elegida,
  onElegir,
}: {
  planId: string;
  docs: DocumentosDelPlan;
  abierta: boolean;
  onAbierta: (abierta: boolean) => void;
  elegida: string | null;
  onElegir: (clave: string) => void;
}) {
  const resumen = useMemo(() => loQueFalta(docs.carpetas), [docs.carpetas]);
  if (!docs.disponible) return null;

  const raiz = docs.vista?.preparada && docs.vista.carpetaRaizId ? { id: docs.vista.carpetaRaizId, ruta: docs.vista.rutaRaiz } : null;
  const cuenta = [
    resumen.faltan > 0 ? { texto: `${resumen.faltan} ${resumen.faltan === 1 ? "falta" : "faltan"}`, tinta: "text-[var(--data-warning-ink)]" } : null,
    resumen.vencidos > 0 ? { texto: `${resumen.vencidos} ${resumen.vencidos === 1 ? "vencido" : "vencidos"}`, tinta: "text-[var(--data-error-ink)]" } : null,
    resumen.vencenPronto > 0 ? { texto: `${resumen.vencenPronto} por vencer`, tinta: "text-[var(--data-warning-ink)]" } : null,
  ].filter((c): c is { texto: string; tinta: string } => c != null);
  const cuerpo = `${ID_CARPETAS_DEL_PLAN}-cuerpo`;

  return (
    <section id={ID_CARPETAS_DEL_PLAN} data-carpetas-plan aria-label="Carpetas del plan" className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* Patrón acordeón: el título contiene el botón que pliega. */}
          <CardTitle>
            <button
              type="button"
              aria-expanded={abierta}
              aria-controls={cuerpo}
              onClick={() => onAbierta(!abierta)}
              className={button({
                variant: "ghost",
                /* Con la letra del CardTitle: el botón es el título. */
                className:
                  "-ml-1 h-auto min-h-11 justify-start gap-1.5 rounded-xl px-1 text-left text-[length:var(--ts-base)] font-semibold leading-[var(--lh-snug)] text-[var(--text-primary)] active:scale-100",
              })}
            >
              <ChevronDown className={`h-5 w-5 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierta ? "" : "-rotate-90"}`} aria-hidden="true" />
              Carpetas del plan
            </button>
          </CardTitle>
          <InfoTip
            title="Carpetas del plan"
            what="Las carpetas del plan en el Archivo: en cada una, los papeles que pide la norma para este tipo de plan, los que agregaste, los archivos sueltos y los campos que se escriben. Lo que subes en «Papeles del permiso» cae acá, en su casillero."
            affects={`No impide guardar el plan. «Vence pronto» = en ${DIAS_VENCE_PRONTO} días o menos, según la fecha de vencimiento que le pongas al archivo; entra al aviso «Por vencer» de Documentos.${raiz ? ` En Documentos: ${raiz.ruta}.` : ""}`}
            example="La vigencia de poder vence el 12/10: ponle esa fecha y el 12/09 aparece en amarillo."
          />
        </div>
        {resumen.esperados > 0 && (
          <p data-carpetas-cuenta className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-semibold tabular-nums text-[var(--text-primary)]">
              {/* Alineada al tipo de plan (ADR-517): la misma cuenta que «Papeles del permiso». */}
              {resumen.porTipo
                ? [
                    resumen.porTipo.obligatorios > 0
                      ? `${resumen.porTipo.presentes} de ${resumen.porTipo.obligatorios} papeles obligatorios`
                      : null,
                    resumen.porTipo.propios > 0 ? `${resumen.porTipo.propiosCargados} de ${resumen.porTipo.propios} que agregaste` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : `${resumen.cargados} de ${resumen.esperados} documentos esperados`}
            </span>
            {cuenta.map((c) => (
              <span key={c.texto} className={`font-semibold ${c.tinta}`}>
                · {c.texto}
              </span>
            ))}
          </p>
        )}
        {raiz && (
          <a
            href={enlaceAlDrive(raiz.id)}
            target="_blank"
            rel="noopener noreferrer"
            title={raiz.ruta}
            className={button({ variant: "ghost", className: "ml-auto max-sm:w-12 max-sm:px-0" })}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span className="max-sm:sr-only">Abrir en Documentos</span>
          </a>
        )}
      </header>

      <div id={cuerpo} hidden={!abierta}>
        <PlanDocumentosDelPlan planId={planId} docs={docs} elegida={elegida} onElegir={onElegir} sinResumen />
      </div>
    </section>
  );
}
