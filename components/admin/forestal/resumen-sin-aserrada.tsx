/**
 * Resúmenes del cubicador cuando todavía NO hay madera aserrada cubicada.
 *
 * Antes la pantalla decía «Todavía no hay lote cubicado» aunque el Cubicador
 * de trozas tuviera la rolliza entera: la pestaña Rolliza sólo aparecía con
 * aserrada (plan 08-10, agregado de la fase 1). Ahora:
 *   · sin trozas, sin bloques y sin aserrada → el vacío de siempre;
 *   · con trozas cubicadas o bloques sembrados → la Rolliza (resumen de
 *     trozas + distribución) y una línea con el paso que falta.
 * Sacado de `CubicacionResumenes` para no hacerla crecer (ya pasaba de 300).
 */
import type { ComponentProps } from "react";
import { PackageOpen, RefreshCw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { claveLoteTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import ResumenReparto from "./ResumenReparto";
import ResumenTrozas from "./ResumenTrozas";

const BTN = "inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]";

/** Trozas cubicadas hoy en el Cubicador de trozas, sumando los dos lotes (Smalian y Oxapampina). */
export function contarTrozasCubicadas(): number {
  try {
    const slug = localStorage.getItem("active-tenant-slug") ?? "main";
    return (["smalian", "oxapampina"] as const).reduce((n, f) => {
      const v: unknown = JSON.parse(localStorage.getItem(claveLoteTrozas(slug, f)) ?? "[]");
      return n + (Array.isArray(v) ? v.length : 0);
    }, 0);
  } catch {
    return 0;
  }
}

export default function ResumenSinAserrada({
  bloquesRolliza, trozas, rows, precioDe, onRecargar,
}: {
  bloquesRolliza: number;
  trozas: number;
  rows: ComponentProps<typeof ResumenReparto>["rows"];
  precioDe: ComponentProps<typeof ResumenReparto>["precioDe"];
  onRecargar: () => void;
}) {
  if (bloquesRolliza === 0 && trozas === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-16 text-center">
        <PackageOpen className="h-10 w-10 text-[var(--text-tertiary)]" />
        <p className="text-base font-bold text-[var(--text-primary)]">Todavía no hay lote cubicado</p>
        <p className="max-w-sm text-sm text-[var(--text-tertiary)]">Cubica en <b>Cubicador de madera</b> o en <b>Cubicador de trozas</b> y vuelve acá para ver los resúmenes.</p>
        <button type="button" onClick={onRecargar} className={`mt-1 ${BTN}`}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>
    );
  }

  const partes = [
    trozas > 0 ? `${trozas} ${trozas === 1 ? "troza cubicada" : "trozas cubicadas"}` : null,
    bloquesRolliza > 0 ? `${bloquesRolliza} ${bloquesRolliza === 1 ? "bloque cargado" : "bloques cargados"}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
        <p className="text-sm font-bold text-[var(--text-primary)]">Rolliza: {partes.join(" · ")}, sin madera aserrada todavía</p>
        <InfoTip
          title="Falta la aserrada"
          what="Acá abajo está la rolliza que ya cubicaste. Las tablas por especie, tipo y medida, la meta y la comparación necesitan la madera aserrada."
          affects="Cubica lo aserrado en «Cubicador de madera»: la distribución le pone las medidas a cada bloque."
        />
        <button type="button" onClick={onRecargar} className={`ml-auto ${BTN}`}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>
      {trozas > 0 && <ResumenTrozas />}
      {bloquesRolliza > 0 && <ResumenReparto rows={rows} precioDe={precioDe} />}
    </div>
  );
}
