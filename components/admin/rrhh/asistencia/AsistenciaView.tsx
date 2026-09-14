"use client";

/**
 * AsistenciaView — switch Día / Mes de la asistencia (ADR-414 §7).
 *
 * Vista por defecto del hub: es lo de todos los días. El día y el mes son dos
 * pantallas de una misma hoja (ADR §4) — comparten `use-rrhh-asistencia`, sólo
 * cambia el rango que se le pide al servidor. El switch se pinta en la misma
 * barra que el navegador de fechas de cada hoja.
 */

import { useState } from "react";
import { CalendarDays, Grid3x3 } from "@buleje/design-system/icons";
import { cn, limaDateKey } from "@/lib/utils";
import { diasDelMes, mesDe } from "@/lib/rrhh/fechas";
import HojaDelDia from "./HojaDelDia";
import HojaDelMes from "./HojaDelMes";
import type { NivelRrhh } from "@/lib/rrhh/tipos";

type Modo = "dia" | "mes";

const MODOS = [
  ["dia", "Día", CalendarDays],
  ["mes", "Mes", Grid3x3],
] as const;

export default function AsistenciaView({ nivel, onCambioPersonal }: { nivel: NivelRrhh; onCambioPersonal?: () => void }) {
  const [modo, setModo] = useState<Modo>("dia");
  const [fecha, setFecha] = useState<string>(() => limaDateKey());
  const [mes, setMes] = useState<string>(() => mesDe(limaDateKey()));

  const primerDiaDelMes = `${mes}-01`;
  const ultimoDiaDelMes = `${mes}-${String(diasDelMes(primerDiaDelMes)).padStart(2, "0")}`;

  const elegirModo = (m: Modo) => {
    // Pasar al mes muestra el mes del día que se estaba mirando, no siempre el actual.
    if (m === "mes" && modo === "dia") setMes(mesDe(fecha));
    setModo(m);
  };

  const selectorModo = (
    <div role="group" aria-label="Ver la asistencia por" className="inline-flex rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-1">
      {MODOS.map(([valor, texto, Icono]) => {
        const activo = modo === valor;
        return (
          <button
            key={valor}
            type="button"
            aria-pressed={activo}
            onClick={() => elegirModo(valor)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
              activo ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <Icono className="h-4 w-4" /> {texto}
          </button>
        );
      })}
    </div>
  );

  return modo === "dia" ? (
    <HojaDelDia fecha={fecha} onCambiarFecha={setFecha} nivel={nivel} onCambioPersonal={onCambioPersonal} selectorModo={selectorModo} />
  ) : (
    <HojaDelMes mes={mes} desde={primerDiaDelMes} hasta={ultimoDiaDelMes} onCambiarMes={setMes} selectorModo={selectorModo} />
  );
}
