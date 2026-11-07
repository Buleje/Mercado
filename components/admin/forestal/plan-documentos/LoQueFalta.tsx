"use client";

/**
 * «Lo que falta» (ADR-467): un chip por documento esperado, arriba de la
 * sección. Primero lo que pide acción —vencido, falta, vence pronto— y al final
 * lo que ya está. Tocar un chip lleva a su carpeta y a su casillero.
 *
 * Avisa, no traba: un plan se guarda igual con papeles faltantes (regla de
 * ADR-427). La explicación de cada estado va en el ⓘ, no en un párrafo.
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { DIAS_VENCE_PRONTO } from "@/lib/forestal/plan-documentos-tipos";
import { ASPECTO_ESTADO, textoVence } from "./estados";
import type { ChipFalta, ResumenFalta } from "./modelo";

export default function LoQueFalta({
  resumen,
  onElegir,
}: {
  resumen: ResumenFalta;
  onElegir: (chip: ChipFalta) => void;
}) {
  if (resumen.esperados === 0) return null;
  const completo = resumen.faltan === 0 && resumen.vencidos === 0;
  return (
    <div data-docs-plan-falta className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-bold tabular-nums text-[var(--text-primary)]">
          {resumen.cargados} de {resumen.esperados} documentos
        </span>
        {!completo && (
          <span className="text-[var(--text-secondary)]">
            {[
              resumen.faltan > 0 ? `${resumen.faltan} ${resumen.faltan === 1 ? "falta" : "faltan"}` : null,
              resumen.vencidos > 0 ? `${resumen.vencidos} ${resumen.vencidos === 1 ? "vencido" : "vencidos"}` : null,
              resumen.vencenPronto > 0 ? `${resumen.vencenPronto} por vencer` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
        <InfoTip
          icono="ayuda"
          title="Lo que falta"
          what={`Cada documento esperado de las carpetas. «Vence pronto» = en ${DIAS_VENCE_PRONTO} días o menos, según la fecha de vencimiento que le pongas al archivo.`}
          affects="No impide guardar el plan. El vencimiento entra al aviso «Por vencer» de Documentos."
          example="La vigencia de poder vence el 12/10: ponle esa fecha y el 12/09 aparece en amarillo."
        />
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Documentos esperados del plan">
        {resumen.chips.map((c) => {
          const a = ASPECTO_ESTADO[c.estado];
          const Icono = a.icono;
          const fecha = c.estado === "vence_pronto" || c.estado === "vencido" ? textoVence(c.estado, c.vence) : null;
          const estadoTexto = c.porSubir && c.estado !== "falta" ? "por subir" : a.label.toLowerCase();
          return (
            <li key={`${c.carpetaClave}:${c.casilleroClave}`}>
              <button
                type="button"
                onClick={() => onElegir(c)}
                title={`${c.carpetaNombre} › ${c.nombre}`}
                aria-label={`${c.nombre}: ${estadoTexto}${fecha ? `, ${fecha}` : ""}. Ir a la carpeta ${c.carpetaNombre}`}
                className={`inline-flex min-h-9 max-w-[18rem] items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--rule-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${a.pastilla}`}
              >
                <Icono className={`h-3.5 w-3.5 shrink-0 ${a.tinta}`} aria-hidden="true" />
                <span className="truncate">{c.nombre}</span>
                {fecha && <span className="shrink-0 font-normal text-[var(--text-secondary)]">· {fecha}</span>}
                {c.porSubir && <span className="shrink-0 font-normal text-[var(--text-secondary)]">· por subir</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
