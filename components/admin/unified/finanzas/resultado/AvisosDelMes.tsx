"use client";

/**
 * Lo que acompaña a las cifras sin ser una: la compra de madera (no resta
 * hasta que se vende), los avisos del servidor (una corrida con fecha futura,
 * ventas sin costo) y lo que está en otra moneda. Una línea cada uno; el
 * porqué, en el ⓘ.
 */

import { AlertTriangle, ChevronRight } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import type { Aviso, FuenteDetalle, OtraMoneda, ResultadoDelMes } from "@/lib/finance/resultado-del-negocio";
import { montoTexto } from "./fuentes";

const BOTON_VER =
  "inline-flex min-h-8 shrink-0 items-center align-middle gap-0.5 rounded-md px-1.5 text-xs font-semibold text-[var(--text-primary)] underline decoration-[var(--rule-strong)] underline-offset-2 hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

/** «Compraste S/ X de madera: resta al venderse», con el ⓘ del porqué. */
export function MemoCompras({ memo, onAbrir }: { memo: ResultadoDelMes["memo"]; onAbrir: (f: FuenteDetalle) => void }) {
  const hubo = memo.cuantas + memo.sinCosto > 0;
  if (!hubo) return null;
  const guias = (n: number) => `${formatNumber(n, 0)} ${n === 1 ? "guía" : "guías"}`;
  return (
    <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
      {memo.compras != null ? (
        <>
          Compraste <strong className="font-semibold text-[var(--text-primary)] tabular-nums">{montoTexto(memo.compras)}</strong> de
          madera en {guias(memo.cuantas)}: resta al venderse.
        </>
      ) : (
        <>Compraste madera en {guias(memo.sinCosto)} sin costo cargado: resta al venderse.</>
      )}
      {memo.compras != null && memo.sinCosto > 0 && <> {guias(memo.sinCosto)} más sin costo cargado.</>}{" "}
      <InfoTip
        title="La compra de madera no resta en el mes"
        what="Es madera que queda en tu patio. Resta cuando la vendes, en «Costo de la madera vendida»."
        affects="Si se restara la compra y también el costo de lo vendido, la misma madera contaría dos veces."
        example="Compras un camión de S/ 5,000 el 28: el mes no sale en pérdida por eso."
      />{" "}
      <button type="button" onClick={() => onAbrir("compras_madera")} className={BOTON_VER}>
        Ver las guías <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </p>
  );
}

/** Los avisos del servidor, una línea cada uno; si hablan de un renglón, se abre desde acá. */
export default function AvisosDelMes({
  avisos,
  otrasMonedas,
  onAbrir,
}: {
  avisos: Aviso[];
  otrasMonedas: OtraMoneda[];
  onAbrir: (f: FuenteDetalle) => void;
}) {
  if (avisos.length === 0 && otrasMonedas.length === 0) return null;
  return (
    <ul className="space-y-1" aria-label="Avisos del mes">
      {avisos.map((a) => (
        <li key={`${a.codigo}-${a.fuente ?? ""}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
          <span className="min-w-0 flex-1 text-[var(--text-primary)]">{a.texto}</span>
          {a.fuente && (
            <button type="button" onClick={() => onAbrir(a.fuente as FuenteDetalle)} className={BOTON_VER}>
              Ver <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </li>
      ))}
      {otrasMonedas.map((m) => (
        <li key={m.moneda} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
          <span className="min-w-0 flex-1 text-[var(--text-primary)]">
            {formatNumber(m.cuantos, 0)} {m.cuantos === 1 ? "movimiento" : "movimientos"} en {m.moneda} por{" "}
            <span className="tabular-nums">{formatNumber(m.total, 2)}</span>: no se suman a los soles.
          </span>
        </li>
      ))}
    </ul>
  );
}
