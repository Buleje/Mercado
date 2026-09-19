/** Croquis de la parcela: los árboles del censo por coordenadas UTM, sin dependencias. */

import { AlertTriangle, MapPin } from "@buleje/design-system/icons";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { Tree } from "./loth-plan-shared";
import { BloquePlan } from "./loth-plan-ui";

export default function LothPlanCroquis({ trees, authorizedSpecies }: { trees: Tree[]; authorizedSpecies: Set<string> }) {
  const pts = trees
    .map((t) => ({ t, x: Number(t.utmX), y: Number(t.utmY) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x !== 0 && p.y !== 0);
  if (trees.length === 0) return null;
  /* Con censo pero sin coordenadas el bloque no desaparece en silencio: dice
     qué le falta para dibujarse (en el tenant real, 2 de 2 árboles sin GPS). */
  if (pts.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
        El croquis de la parcela se dibuja cuando los árboles del censo traen coordenadas UTM: ninguno las tiene todavía.
      </p>
    );
  }

  // Color por ESPECIE (paleta HSL determinística — sin hex hardcodeado), opacidad
  // por estado, y borde rojo punteado para especies fuera del plan autorizado.
  const speciesList = Array.from(new Set(pts.map((p) => p.t.speciesCommon)));
  const colorFor = (name: string) => `hsl(${Math.round((speciesList.indexOf(name) * 360) / Math.max(1, speciesList.length))} 60% 45%)`;
  const fuera = (name: string) => authorizedSpecies.size > 0 && !authorizedSpecies.has(claveEspecie(name));
  const opacityFor = (e: string) => (e === "talado" ? 0.5 : e === "descartado" ? 0.28 : 1);

  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 760, H = 320, pad = 28;
  const sx = (x: number) => (maxX === minX ? W / 2 : pad + ((x - minX) / (maxX - minX)) * (W - 2 * pad));
  const sy = (y: number) => (maxY === minY ? H / 2 : H - pad - ((y - minY) / (maxY - minY)) * (H - 2 * pad)); // Norte arriba

  return (
    <BloquePlan
      id="loth-plan-croquis"
      titulo="Croquis de la parcela"
      sub={<><span className="font-mono tabular-nums">{pts.length}</span> de <span className="font-mono tabular-nums">{trees.length}</span> árboles georreferenciados (UTM)</>}
    >
      <div className="p-4">
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 340 }}>
          <text x={pad} y={16} fontSize="10" fill="var(--text-tertiary)">N ↑</text>
          {pts.map((p, i) => {
            const off = fuera(p.t.speciesCommon);
            return (
              <g key={i}>
                {off && <circle cx={sx(p.x)} cy={sy(p.y)} r={11} fill="none" stroke="var(--data-error-500)" strokeWidth={1.5} strokeDasharray="2.5 2" />}
                <circle cx={sx(p.x)} cy={sy(p.y)} r={7} fill={colorFor(p.t.speciesCommon)} fillOpacity={opacityFor(p.t.estado)} stroke={off ? "var(--data-error-500)" : "var(--surface-raised)"} strokeWidth={off ? 2 : 1.5}>
                  <title>{p.t.treeCode} · {p.t.speciesCommon}{off ? " · FUERA DEL PLAN" : ""} · {p.t.estado} · UTM {p.x},{p.y}</title>
                </circle>
                <text x={sx(p.x) + 9} y={sy(p.y) + 3} fontSize="9" fill="var(--text-secondary)">{p.t.treeCode}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Especie:</span>
        {speciesList.map((sp) => (
          <span key={sp} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorFor(sp) }} aria-hidden="true" />
            <span className={fuera(sp) ? "font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : ""}>{sp}</span>
            {fuera(sp) && <AlertTriangle className="h-3.5 w-3.5 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" aria-label="fuera del plan" />}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
        Opacidad = estado (lleno: en pie · medio: talado · tenue: descartado). Borde rojo punteado = especie fuera del plan.
      </p>
      </div>
    </BloquePlan>
  );
}
