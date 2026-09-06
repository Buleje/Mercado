"use client";

/**
 * CtpGuiasBandeja — el puente monte → planta (rec #9 del QA 2026-07-17).
 *
 * Lista las GTF de trozas EMITIDAS en el Libro de Títulos Habilitantes que
 * todavía no tienen ingreso vigente en el CTP. "Ingresar" abre el formulario
 * de ingreso YA pre-llenado con esa guía (cero doble digitación): la salida
 * del bosque alimenta la entrada a planta y la cadena árbol→producto queda
 * conectada desde el origen. Si no hay pendientes, no renderiza nada.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, TreePine } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";

interface GuiaPendiente {
  id: string;
  gtfNumber: string;
  gtfDate: string | null;
  titularName: string | null;
  tituloHabilitante: string | null;
  volumenTotalM3: string | null;
  piezasTotal: number | null;
  origen: string | null;
}

// gtfDate es date-only a medianoche UTC — sin timeZone:"UTC" se corre un día.
const fmtDate = (iso: string | null) => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" }); } catch { return null; }
};

export default function CtpGuiasBandeja({ onIngresar }: { onIngresar: (gtfNumber: string) => void }) {
  const [guias, setGuias] = useState<GuiaPendiente[]>([]);

  const load = useCallback(() => {
    fetch("/api/admin/forestal/gtf?sinIngresar=1", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { gtfs: [] }))
      .then((j) => setGuias(j.gtfs ?? []))
      // Señal secundaria: si falla, la bandeja simplemente no aparece.
      .catch((err) => console.warn("[ctp-bandeja] fetch failed", err));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (guias.length === 0) return null;

  return (
    // Tinte con alpha REAL (`bg-primary/N`): los tokens que ya traen alpha
    // (`--accent-soft`) compilan a un color opaco claro y en dark dejaban un
    // panel blanco con el título en teal, ilegible.
    <div className="rounded-2xl border-2 border-[var(--accent)] bg-primary/5 p-3 dark:bg-primary/10">
      <div className="mb-2.5 flex items-center gap-2">
        <TreePine className="h-4 w-4 text-primary" aria-hidden="true" />
        <CardTitle as="h3" className="text-sm font-bold text-primary">
          {guias.length === 1 ? "1 guía del monte sin ingresar al CTP" : `${guias.length} guías del monte sin ingresar al CTP`}
        </CardTitle>
      </div>
      <ul className="space-y-1.5">
        {guias.slice(0, 5).map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-raised)] px-3 py-2">
            <div className="min-w-0">
              <span className="font-mono text-sm font-bold text-[var(--text-primary)]">GTF {g.gtfNumber}</span>
              <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                {[fmtDate(g.gtfDate), g.titularName, g.volumenTotalM3 != null ? `${Number(g.volumenTotalM3).toFixed(2)} m³` : null, g.piezasTotal != null ? `${g.piezasTotal} pz` : null].filter(Boolean).join(" · ")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onIngresar(g.gtfNumber)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 text-sm font-bold text-white transition hover:brightness-110"
            >
              Ingresar <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {guias.length > 5 && (
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">y {guias.length - 5} más — se muestran las 5 más recientes.</p>
      )}
    </div>
  );
}
