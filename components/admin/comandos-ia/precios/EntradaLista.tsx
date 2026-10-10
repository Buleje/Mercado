"use client";

import { useMemo, useState } from "react";
import { ClipboardPaste } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { parsearListaProveedor, type Redondeo } from "@/lib/admin/comandos-ia/precios";
import { PedirDiferencia } from "./EntradaOrden";
import type { CuerpoPlan } from "./use-precios-en-bloque";

/** `corto` = lo que entra a 400 px: las cuatro opciones y su ⓘ en un solo renglón. */
const REDONDEO: Array<{ valor: Redondeo; label: string; corto: string }> = [
  { valor: 0, label: "Al céntimo", corto: "Céntimo" },
  { valor: 0.1, label: "10 céntimos", corto: "10 cént." },
  { valor: 0.5, label: "50 céntimos", corto: "50 cént." },
  { valor: 1, label: "S/ 1", corto: "S/ 1" },
];

const chip = (activo: boolean) =>
  `min-h-9 rounded-full border px-3 max-sm:px-2.5 text-sm font-semibold transition-colors ${
    activo
      ? "border-[var(--accent-dark)] bg-[var(--accent-dark)] text-white"
      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
  }`;

/** Entrada (b): la lista del proveedor (pegada o traída desde «Lee un papel»). */
export default function EntradaLista({
  pensando,
  error,
  inicial,
  onPedir,
}: {
  pensando: boolean;
  error: string | null;
  inicial: { origen: string; filas: Array<{ nombre: string; costo: number }> } | null;
  onPedir: (cuerpo: CuerpoPlan) => void;
}) {
  const [texto, setTexto] = useState(() => (inicial ? inicial.filas.map((f) => `${f.nombre} ${Number(f.costo).toFixed(2)}`).join("\n") : ""));
  const [mantener, setMantener] = useState(true);
  const [margenTexto, setMargenTexto] = useState("30");
  const [redondeo, setRedondeo] = useState<Redondeo>(0.1);
  const leida = useMemo(() => parsearListaProveedor(texto), [texto]);
  const margen = Number(margenTexto.replace(",", "."));
  const margenOk = mantener || (margen > 0 && margen < 95);

  const pedir = () => {
    if (!leida.filas.length || !margenOk || pensando) return;
    onPedir({ lista: leida.filas.slice(0, 200), politica: mantener ? "mantener-margen" : { margen }, redondeo });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 text-base font-semibold text-[var(--text-primary)]">
        <label htmlFor="comandos-ia-lista">Lista del proveedor</label>
        <InfoTip
          title="Lista del proveedor"
          what="Un producto por renglón (o separados por «·»), con su costo al final. Los busco en tu catálogo por nombre, sin IA; la IA solo desempata nombres parecidos."
          affects="Cambia el costo y el precio de los que encuentro; tú eliges cuáles."
          example="Panetón D'Onofrio 900g 19.50 · Chifles 3.30"
        />
        {inicial && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden /> Llegó de Lee un papel
          </span>
        )}
      </div>
      <textarea
        id="comandos-ia-lista"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
        maxLength={12_000}
        placeholder={"Panetón D'Onofrio 900g 19.50\nChifles 3.30"}
        className="w-full resize-y rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
      />
      {texto.trim() && (
        <span className="block text-xs text-[var(--text-tertiary)]">
          {leida.filas.length} con costo
          {leida.ignoradas.length > 0 && ` · ${leida.ignoradas.length} sin costo (no entran)`}
        </span>
      )}

      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Precio de venta">
        <button type="button" role="radio" aria-checked={mantener} aria-label="Mantener mi margen" onClick={() => setMantener(true)} className={chip(mantener)}>
          <span className="max-sm:hidden">Mantener mi margen</span>
          <span className="sm:hidden">Mi margen</span>
        </button>
        {/* «Llevar a [30] %» es UNA opción: el número va dentro, no en otro renglón a 400 px. */}
        <label role="radio" aria-checked={!mantener} onClick={() => setMantener(false)} onKeyDown={(e) => e.key === "Enter" && setMantener(false)} className={`inline-flex cursor-pointer items-center gap-1 ${chip(!mantener)}`}>
          Llevar a
          <input
            type="text"
            inputMode="decimal"
            aria-label="Margen objetivo en %"
            value={margenTexto}
            onFocus={() => setMantener(false)}
            onChange={(e) => setMargenTexto(e.target.value)}
            className="w-9 rounded-md bg-[var(--surface-raised)] px-1 text-right text-sm font-bold tabular-nums text-[var(--text-primary)] focus:outline-none"
          />
          %
        </label>
        <InfoTip
          title="Precio de venta"
          what="Mantener mi margen: el precio sube en la misma proporción que el costo. Llevar a X %: precio = costo ÷ (1 − X)."
          example="Costo 18 → 19,50 con precio 24,90: mantener da 26,98 · al 30 % da 27,86"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 max-sm:gap-1.5" role="radiogroup" aria-label="Redondeo">
        {REDONDEO.map((r) => (
          <button
            key={r.valor}
            type="button"
            role="radio"
            aria-checked={redondeo === r.valor}
            aria-label={r.label}
            onClick={() => setRedondeo(r.valor)}
            className={chip(redondeo === r.valor)}
          >
            <span className="max-sm:hidden">{r.label}</span>
            <span className="sm:hidden">{r.corto}</span>
          </button>
        ))}
        <InfoTip title="Redondeo" what="Siempre hacia arriba al múltiplo: el redondeo nunca te come margen." example="26,93 → 27,00 con 10 céntimos" />
      </div>

      <PedirDiferencia pensando={pensando} deshabilitado={!leida.filas.length || !margenOk} error={error} onPedir={pedir} />
    </div>
  );
}
