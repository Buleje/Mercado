"use client";

/**
 * AsistenciaView — switch Día / Mes de la asistencia (ADR-414 §7).
 *
 * Vista por defecto del hub: es lo de todos los días. El día y el mes son dos
 * pantallas de una misma hoja (ADR §4) — comparten `use-rrhh-asistencia`, sólo
 * cambia el rango que se le pide al servidor.
 */

import { useState } from "react";
import { CalendarDays, Grid3x3 } from "@buleje/design-system/icons";
import { limaDateKey } from "@/lib/utils";
import { diasDelMes, mesDe } from "@/lib/rrhh/fechas";
import { cn } from "@/lib/utils";
import HojaDelDia from "./HojaDelDia";
import HojaDelMes from "./HojaDelMes";
import type { NivelRrhh } from "@/lib/rrhh/tipos";

type Modo = "dia" | "mes";

export default function AsistenciaView({ nivel, onCambioPersonal }: { nivel: NivelRrhh; onCambioPersonal?: () => void }) {
  const [modo, setModo] = useState<Modo>("dia");
  const [fecha, setFecha] = useState<string>(() => limaDateKey());
  const [mes, setMes] = useState<string>(() => mesDe(limaDateKey()));

  const primerDiaDelMes = `${mes}-01`;
  const ultimoDiaDelMes = `${mes}-${String(diasDelMes(primerDiaDelMes)).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-[var(--rule-base)] p-1" role="tablist" aria-label="Día o mes">
        {([["dia", "Día", CalendarDays], ["mes", "Mes", Grid3x3]] as const).map(([v, texto, Icono]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={modo === v}
            onClick={() => setModo(v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
              modo === v
                ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <Icono className="h-4 w-4" /> {texto}
          </button>
        ))}
      </div>

      {modo === "dia" ? (
        <HojaDelDia fecha={fecha} onCambiarFecha={setFecha} nivel={nivel} onCambioPersonal={onCambioPersonal} />
      ) : (
        <HojaDelMes
          mes={mes}
          desde={primerDiaDelMes}
          hasta={ultimoDiaDelMes}
          onCambiarMes={setMes}
        />
      )}
    </div>
  );
}
