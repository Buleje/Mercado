"use client";

/**
 * «Formato»: la planilla de campo del cubicador para bajar e imprimir (la misma
 * de Herramientas › Planillas de campo, con su prompt de IA). Desde una
 * cubicación guardada, la hoja sale con su código impreso para encontrarla
 * después con su papel. Trozas ofrece las dos fórmulas, primero la que usa.
 */
import { useState } from "react";
import { FileSpreadsheet, Loader2, Printer } from "@buleje/design-system/icons";
import { useTenant } from "@/contexts/tenant-context";
import { button } from "@/components/ui-system/button-variants";
import { planillaPorId } from "@/lib/forestal/planillas/catalogo";
import type { PlanillaId } from "@/lib/forestal/planillas/tipos";
import { imprimirPlanilla } from "../planillas/imprimir-planilla";
import { bajarExcelDePlanilla } from "../planillas/planillas-api";
import { planillasDelTipo, type TipoPapel } from "./papel-cubicador";

const ROTULO: Partial<Record<PlanillaId, string>> = {
  "aserrada-pt": "Madera aserrada · pie tablar",
  "rolliza-smalian": "Trozas · Smalian (m³)",
  "rolliza-oxapampa": "Trozas · Oxapampina (PT)",
};

const BOTON = button({ variant: "secondary", className: "rounded-xl px-3" });
const ERROR = "text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

export default function FormatoDelPapel({ tipo, formula, codigo, lote }: {
  tipo: TipoPapel;
  formula?: string | null;
  /** Código de la cubicación guardada: va impreso en la hoja. */
  codigo?: string | null;
  lote?: string;
}) {
  const { branding } = useTenant();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = planillasDelTipo(tipo, formula);

  const correr = async (clave: string, fn: () => Promise<void>) => {
    setOcupado(clave);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="space-y-2" data-vista="formato-del-cubicador">
      <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-soft)]">
        {ids.map((id, i) => {
          const p = planillaPorId(id);
          if (!p) return null;
          return (
            <li key={id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-[1_1_12rem] text-sm font-semibold text-[var(--text-primary)]">
                {ROTULO[id] ?? p.nombre}
                {ids.length > 1 && i === 0 && (
                  <span className="ml-2 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">la que usas</span>
                )}
              </span>
              <span className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BOTON}
                  disabled={ocupado !== null}
                  data-accion={`imprimir-${id}`}
                  title={codigo ? `La hoja sale con el código ${codigo}` : "La hoja en blanco, lista para llenar a mano"}
                  onClick={() => void correr(`imprimir:${id}`, () => imprimirPlanilla(p, { negocio: branding.name ?? undefined, codigo: codigo ?? undefined, lote }))}
                >
                  {ocupado === `imprimir:${id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Imprimir o PDF
                </button>
                <button
                  type="button"
                  className={BOTON}
                  disabled={ocupado !== null}
                  title="La misma hoja en Excel, para llenarla en la computadora"
                  onClick={() => void correr(`excel:${id}`, () => bajarExcelDePlanilla(id))}
                >
                  {ocupado === `excel:${id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className={ERROR}>{error}</p>}
    </div>
  );
}
