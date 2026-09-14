"use client";

/**
 * FilaGanado — una persona, un período (ADR-414 §5). «Cómo sale» despliega
 * `explicarGanado()` — MISMO cálculo puro que usó el servidor, nunca una
 * cuenta aparte hecha en el cliente (lección ADR-412: la vista previa se
 * desalineó del servidor por llamar la función con argumentos distintos).
 *
 * El chevron de expandir ahora es SIEMPRE visible junto al nombre: antes sólo
 * aparecía si había avisos, pero la fila se puede abrir siempre (haya o no
 * avisos) y no había ninguna pista de que fuera clicable.
 */

import { useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { explicarGanado } from "@/lib/rrhh/ganado";
import { CLASE_CHIP } from "../rrhh-form";
import { CLASE_FOCUS_FILA, etiquetaModalidad, filaClicableProps, formatearPEN, pluralizar } from "../rrhh-ui";
import { cn } from "@/lib/utils";
import type { GanadoDTO } from "@/lib/rrhh/tipos";

export default function FilaGanado({ persona }: { persona: GanadoDTO["personas"][number] }) {
  const [abierto, setAbierto] = useState(false);
  // Días que SUMAN (el factor de cada tramo), no días de calendario: la
  // columna decía 14 a todos en un período de 14 días, trabajaran 6 o 14.
  const dias = persona.tramos.reduce((s, t) => (t.modalidad === "SIN_PAGO" ? s : s + t.factor), 0);
  const horas = persona.tramos.reduce((s, t) => s + t.horas, 0);
  // Mismo texto sólo si modalidad Y monto son iguales en todos los tramos —
  // 2 tramos de la misma modalidad con distinto monto (la tarifa cambió a
  // mitad del período) NO son "una sola tarifa", aunque el Set de modalidades
  // dé 1.
  const unaSolaTarifa = persona.tramos.length > 0
    && new Set(persona.tramos.map((t) => t.modalidad)).size === 1
    && new Set(persona.tramos.map((t) => t.monto)).size === 1;
  const tarifaTexto = persona.tramos.length === 0
    ? "Sin tarifa"
    : unaSolaTarifa
      ? `${formatearPEN(persona.tramos[0].monto)} (${etiquetaModalidad(persona.tramos[0].modalidad)})`
      : pluralizar(persona.tramos.length, "tarifa", "tarifas");

  const avisos = [
    ...persona.sinMarcar.length > 0 ? [`${pluralizar(persona.sinMarcar.length, "día", "días")} sin marcar`] : [],
    // «N días sin tarifa» ya viene en `persona.avisos` desde el servidor; sumarlo acá lo mostraba dos veces.
    ...persona.avisos,
  ];

  return (
    <>
      <tr
        className={cn("cursor-pointer", CLASE_FOCUS_FILA)}
        onClick={() => setAbierto((v) => !v)}
        {...filaClicableProps(() => setAbierto((v) => !v))}
        aria-expanded={abierto}
        aria-label={`${persona.nombre}: ${abierto ? "ocultar" : "ver"} cómo sale el cálculo`}
      >
        <td className="font-semibold text-[var(--text-primary)]">
          <span className="inline-flex items-start gap-1.5">
            <ChevronDown aria-hidden="true" className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform", abierto && "rotate-180")} />
            <span>
              {persona.nombre}
              {persona.puesto && <span className="block text-xs font-normal text-[var(--text-tertiary)]">{persona.puesto}</span>}
            </span>
          </span>
        </td>
        <td className="text-right tabular-nums">{dias.toLocaleString("es-PE", { maximumFractionDigits: 2 })}</td>
        <td className="text-right tabular-nums">{horas > 0 ? horas.toFixed(1) : "—"}</td>
        <td>{tarifaTexto}</td>
        <td className="text-right font-bold tabular-nums text-[var(--text-primary)]">{formatearPEN(persona.total)}</td>
        <td className="text-right tabular-nums">{persona.adelantos ? formatearPEN(persona.adelantos.abiertosPen) : "—"}</td>
        <td>
          {avisos.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {avisos.map((a, i) => (
                <span key={i} className={cn(CLASE_CHIP, "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]")}>{a}</span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-[var(--text-tertiary)]">—</span>
          )}
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={7} className="bg-[var(--surface-sunken)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            <ul className="list-inside list-disc space-y-1 leading-relaxed">
              {explicarGanado(persona).map((linea, i) => <li key={i}>{linea}</li>)}
            </ul>
            {persona.beneficiarioId == null && <p className="mt-2 text-xs text-[var(--text-tertiary)]">Sin cuenta vinculada — sin adelantos que mostrar al lado.</p>}
          </td>
        </tr>
      )}
    </>
  );
}
