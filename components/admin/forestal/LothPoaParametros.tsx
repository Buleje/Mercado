"use client";

/**
 * Los parámetros del Plan Operativo: el % de semilleros y el DMC por especie.
 *
 * Salió de `LothPoaPanel` para que el cuadro quede en su tamaño; se abre con
 * «Parámetros» y se guarda con el botón que aparece al cambiar algo.
 */

import { dmcParaEspecie, type PoaAnalisis, type PoaConfig } from "@/lib/forestal/loth-poa";
import { claveEspecie } from "@/lib/forestal/loth-constants";

export default function LothPoaParametros({ especies, config, onConfig }: {
  especies: PoaAnalisis["especies"];
  config: PoaConfig;
  onConfig: (next: PoaConfig) => void;
}) {
  const setDmc = (especie: string, valor: string) => {
    // FIX 2026-08-22: la clave tiene que ser la MISMA que lee `dmcParaEspecie`
    // (`normEspecie` → `claveEspecie`) — antes esta normalización local no
    // quitaba el científico entre paréntesis, así que un override para
    // "Tornillo (Cedrelinga catenaeformis)" se guardaba bajo una clave que
    // `dmcParaEspecie` nunca iba a buscar: el override se perdía en silencio,
    // el DMC volvía siempre al oficial/general.
    const key = claveEspecie(especie);
    const next = { ...config.dmcOverrides };
    const cm = Number(valor);
    if (!valor.trim() || !Number.isFinite(cm) || cm <= 0) delete next[key];
    else next[key] = Math.round(cm);
    onConfig({ ...config, dmcOverrides: next });
  };

  return (
    <div className="space-y-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-4">
      <label className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
        Semilleros a dejar en pie
        <input
          type="number"
          min={0}
          max={100}
          value={config.semillerosPct}
          onChange={(e) => onConfig({ ...config, semillerosPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
          className="h-10 w-20 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-bold text-[var(--text-primary)]"
        />
        % de los árboles que superan el DMC (se reservan los de mayor DAP)
      </label>
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">DMC por especie (cm)</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {especies.map((e) => {
            const oficial = dmcParaEspecie(e.especie);
            return (
              <label key={e.especie} className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                <span className="min-w-0 flex-1 truncate">{e.especie}</span>
                <input
                  type="number"
                  min={10}
                  max={200}
                  placeholder={String(oficial.cm)}
                  /* Se LEE con la misma clave con que se escribe: antes leía con
                     una normalización propia que no quitaba el científico entre
                     paréntesis, y el número tipeado se borraba del campo. */
                  value={config.dmcOverrides[claveEspecie(e.especie)] ?? ""}
                  aria-label={`DMC de ${e.especie} en centímetros`}
                  onChange={(ev) => setDmc(e.especie, ev.target.value)}
                  className="h-10 w-20 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm font-bold text-[var(--text-primary)]"
                />
                <span className="w-16 shrink-0 text-xs text-[var(--text-tertiary)]">
                  {oficial.fuente === "oficial" ? `norma ${oficial.cm}` : `gral. ${oficial.cm}`}
                </span>
              </label>
            );
          })}
          {especies.length === 0 && <p className="text-sm text-[var(--text-tertiary)]">Carga el censo para configurar el DMC por especie.</p>}
        </div>
      </div>
    </div>
  );
}
