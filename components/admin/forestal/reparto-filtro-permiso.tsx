"use client";

/**
 * Chips de permiso de «Lo que entró» (Brandon, 2026-10-19: «una opción para
 * poder escoger las trozas según el permiso»). Cada chip dice cuánta rolliza
 * trae ese permiso; al tocarlo la tabla muestra sólo sus bloques y «¿Cuadran
 * las medidas?» mira sólo ese permiso. El reparto no cambia.
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { cn } from "@/lib/utils";
import { SIN_PERMISO, type GrupoPermiso, type PermisoDeRolliza } from "./hooks/use-permiso-de-rolliza";

const CHIP = "inline-flex h-12 shrink-0 flex-col items-start justify-center rounded-xl border px-3 text-left leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const ACTIVO = "border-[var(--accent-dark)] bg-[var(--accent-dark)] text-white";
const INACTIVO = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]";

function cifras(g: Pick<GrupoPermiso, "rollizaM3" | "aserradaM3" | "trozas" | "bloques">): string {
  const partes: string[] = [];
  if (g.rollizaM3 > 0 || g.aserradaM3 === 0) partes.push(`${fmtM3(g.rollizaM3)} m³ (R)`);
  if (g.aserradaM3 > 0) partes.push(`${fmtM3(g.aserradaM3)} m³ (A)`);
  partes.push(g.trozas > 0 ? `${g.trozas} ${g.trozas === 1 ? "troza" : "trozas"}` : `${g.bloques} ${g.bloques === 1 ? "bloque" : "bloques"}`);
  return partes.join(" · ");
}

export default function RepartoFiltroPermiso({ permiso }: { permiso: PermisoDeRolliza }) {
  const { grupos, elegido, elegir } = permiso;
  /* Con un solo permiso no hay nada que escoger: el chip sería ruido. */
  if (grupos.length < 2) return null;
  const todos = grupos.reduce(
    (s, g) => ({ rollizaM3: s.rollizaM3 + g.rollizaM3, aserradaM3: s.aserradaM3 + g.aserradaM3, trozas: s.trozas + g.trozas, bloques: s.bloques + g.bloques }),
    { rollizaM3: 0, aserradaM3: 0, trozas: 0, bloques: 0 },
  );
  return (
    <div className="mb-3 flex min-w-0 items-center gap-2 print:hidden">
      <div role="radiogroup" aria-label="Escoge las trozas por permiso" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
        <button type="button" role="radio" aria-checked={!elegido} onClick={() => elegir("")} className={cn(CHIP, !elegido ? ACTIVO : INACTIVO)}>
          <span className="text-sm font-bold">Todos los permisos</span>
          <span className={cn("font-mono text-xs tabular-nums", elegido && "text-[var(--text-tertiary)]")}>{cifras(todos)}</span>
        </button>
        {grupos.map((g) => {
          const activo = elegido === g.valor;
          return (
            <button
              key={g.valor}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => elegir(activo ? "" : g.valor)}
              title={g.valor === SIN_PERMISO ? "Bloques sin N° de permiso: complétalo en la tabla" : g.valor}
              className={cn(CHIP, activo ? ACTIVO : INACTIVO)}
            >
              <span className={cn("max-w-[14rem] truncate text-sm font-bold", g.valor === SIN_PERMISO && !activo && "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]")}>
                {g.valor === SIN_PERMISO ? "Sin permiso" : g.valor}
              </span>
              <span className={cn("font-mono text-xs tabular-nums", !activo && "text-[var(--text-tertiary)]")}>{cifras(g)}</span>
            </button>
          );
        })}
      </div>
      <InfoTip
        title="Escoger por permiso"
        what="Muestra sólo los bloques (y sus trozas) de un permiso. Cada chip suma la rolliza que entró con ese permiso: m³ (R) de troza y, aparte, m³ (A) si hay madera que ya vino aserrada."
        affects="Filtra lo que ves aquí y en «¿Cuadran las medidas?» (Faltante y cierre). El reparto sigue usando todos los bloques: un bloque escondido no deja de amparar lo suyo."
        example="Tocas «PLT-2025-167» → la tabla queda con sus 2 bloques y el enlace lleva ?permiso=PLT-2025-167."
      />
    </div>
  );
}
