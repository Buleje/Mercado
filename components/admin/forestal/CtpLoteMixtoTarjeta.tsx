"use client";

/**
 * El lote mixto en Consumos › Patio, en UNA línea (ADR-441): «LM-2026-003 ·
 * abierto · 12 trozas · 4 especies» con seguir escaneando, vincular la
 * producción y el historial de los repartidos con sus lotes hijos. Sin ningún
 * mixto (ni abierto ni repartido) no ocupa lugar: la puerta es el botón
 * «Lote mixto» de la tabla.
 */

import { useId, useState } from "react";
import { ChevronDown, Combine, Link2, ScanBarcode } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { lineaDelMixto } from "@/lib/forestal/lote-mixto-vista";
import { HistorialDeMixtos } from "./lote-mixto-partes";
import type { EstadoLotesMixtos } from "./hooks/use-lotes-mixtos";

const BOTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]";

export default function CtpLoteMixtoTarjeta({
  mixtos,
  onAbrir,
  onVincular,
  onVerLote,
}: {
  mixtos: Pick<EstadoLotesMixtos, "abiertos" | "repartidos" | "error">;
  onAbrir: () => void;
  /** Sólo dueño o administrador: sin esto no se ofrece. */
  onVincular?: () => void;
  /** Elegir un lote hijo en «Consumir en un lote…». */
  onVerLote?: (lote: { id: string; code: string }) => void;
}) {
  const idHistorial = useId();
  const [historial, setHistorial] = useState(false);
  const { abiertos, repartidos } = mixtos;
  if (abiertos.length === 0 && repartidos.length === 0) return null;
  const abierto = abiertos[0] ?? null;

  return (
    <div className="space-y-2 border-t border-[var(--rule-soft)] pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex min-w-0 flex-1 basis-[16rem] items-center gap-2 text-sm">
          <Combine className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          <span className="whitespace-nowrap font-bold text-[var(--text-primary)]">Lote mixto</span>
          <span className="min-w-0 text-[var(--text-secondary)]">
            {abierto
              ? lineaDelMixto({ code: abierto.code, status: abierto.status, piezas: abierto.resumen.piezas, especies: abierto.resumen.especies })
              : "ninguno abierto"}
            {abiertos.length > 1 && ` (+${abiertos.length - 1} abierto${abiertos.length === 2 ? "" : "s"})`}
          </span>
          <InfoTip
            title="Lote mixto"
            what="La pila del patio escaneada de corrido, con varias especies. Al terminar se reparte en un lote por especie y permiso."
            affects="Lo que salió de la sierra se cubica en «Producir sin lote» y después se vincula con el mixto: se dan por aserradas las trozas de cada especie."
            example="LM-2026-003 · 12 trozas · 4 especies → 5 lotes (Mashonaste de 2 permisos son 2)."
          />
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onAbrir} className={BOTON}>
            <ScanBarcode className="h-4 w-4" aria-hidden />
            {abierto ? "Seguir escaneando" : "Abrir uno"}
          </button>
          {onVincular && (
            <button type="button" onClick={onVincular} className={BOTON}>
              <Link2 className="h-4 w-4" aria-hidden /> Vincular producción
            </button>
          )}
          {repartidos.length > 0 && (
            <button
              type="button"
              onClick={() => setHistorial((v) => !v)}
              aria-expanded={historial}
              aria-controls={idHistorial}
              className={BOTON}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${historial ? "" : "-rotate-90"}`} aria-hidden />
              Repartidos ({repartidos.length})
            </button>
          )}
        </div>
      </div>
      {historial && (
        <div id={idHistorial}>
          <HistorialDeMixtos repartidos={repartidos} onVerLote={onVerLote} />
        </div>
      )}
    </div>
  );
}
