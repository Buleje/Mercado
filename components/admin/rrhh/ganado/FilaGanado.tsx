"use client";

/**
 * FilaGanado — una persona, un período (ADR-414 §5). «Cómo sale» despliega
 * `explicarGanado()` — MISMO cálculo puro que usó el servidor, nunca una
 * cuenta aparte hecha en el cliente (lección ADR-412: la vista previa se
 * desalineó del servidor por llamar la función con argumentos distintos).
 */

import { useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { explicarGanado } from "@/lib/rrhh/ganado";
import { CLASE_FOCUS_FILA, filaClicableProps, formatearPEN, pluralizar } from "../rrhh-ui";
import { cn } from "@/lib/utils";
import type { GanadoDTO } from "@/lib/rrhh/tipos";

export default function FilaGanado({ persona }: { persona: GanadoDTO["personas"][number] }) {
  const [abierto, setAbierto] = useState(false);
  const dias = persona.tramos.reduce((s, t) => s + t.dias, 0);
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
      ? `${formatearPEN(persona.tramos[0].monto)} (${persona.tramos[0].modalidad.toLowerCase()})`
      : pluralizar(persona.tramos.length, "tarifa", "tarifas");

  const avisos = [
    ...persona.sinMarcar.length > 0 ? [`${pluralizar(persona.sinMarcar.length, "día", "días")} sin marcar`] : [],
    ...persona.sinTarifa.length > 0 ? [`${pluralizar(persona.sinTarifa.length, "día", "días")} sin tarifa`] : [],
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
          {persona.nombre}
          {persona.puesto && <span className="block text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">{persona.puesto}</span>}
        </td>
        <td className="text-right tabular-nums">{dias}</td>
        <td className="text-right tabular-nums">{horas > 0 ? horas.toFixed(1) : "—"}</td>
        <td>{tarifaTexto}</td>
        <td className="text-right font-bold tabular-nums text-[var(--text-primary)]">{formatearPEN(persona.total)}</td>
        <td className="text-right tabular-nums">{persona.adelantos ? formatearPEN(persona.adelantos.abiertosPen) : "—"}</td>
        <td className="text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {avisos.length > 0 && (
            <span className="inline-flex items-center gap-1">
              {avisos.join(" · ")}
              <ChevronDown className={cn("h-3 w-3 transition-transform", abierto && "rotate-180")} />
            </span>
          )}
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={7} className="bg-[var(--surface-sunken)] text-xs text-[var(--text-secondary)]">
            <ul className="list-inside list-disc space-y-0.5 py-1">
              {explicarGanado(persona).map((linea, i) => <li key={i}>{linea}</li>)}
            </ul>
            {persona.beneficiarioId == null && <p className="mt-1 text-[var(--text-tertiary)]">Sin cuenta vinculada — sin adelantos que mostrar al lado.</p>}
          </td>
        </tr>
      )}
    </>
  );
}
