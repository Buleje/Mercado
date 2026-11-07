"use client";

/**
 * Los lotes que esperan la sierra, en una línea (ADR-334).
 *
 * El armado del lote vive en su pestaña; lo que las demás necesitan es el
 * semáforo: cuánta madera está apartada y a un click de dónde se toca. Antes el
 * armado entero colgaba arriba de Consumos —una pantalla dentro de otra— y el
 * cuadro oficial de la sección quedaba debajo de un formulario.
 *
 * Silenciosa mientras carga: una tira que aparece con ceros y después se
 * corrige se lee como un dato que cambió solo.
 *
 * Los lotes llegan por prop (ADR-431): la vista ya los tiene de
 * `useLotesAserrio`, y el fetch propio era un tercer pedido del mismo dato que
 * además, si fallaba, decía «No hay lotes armados». Un error no es un «no hay».
 */

import { AlertTriangle, ChevronRight, Layers } from "@buleje/design-system/icons";
import { piezasLibres, volumenLibre, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { Btn } from "./ctp-shared";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { pieTablarAserrableDe } from "@/lib/forestal/cubicacion";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import { formatNumber } from "@/lib/format";

export default function CtpLotesTira({
  lotes,
  cargando,
  error,
  onIr,
  enLinea = false,
}: {
  /**
   * Como último renglón de otra tarjeta («Qué queda en el patio», Consumos):
   * sin caja propia, separada por una raya. Suelta, una tarjeta más entre las
   * cifras y la tabla era uno de los «datos dispersos» (2026-09-24).
   */
  enLinea?: boolean;
  /** Los lotes ABIERTOS (esperando la sierra). */
  lotes: readonly LoteAserrio[];
  cargando: boolean;
  error?: string | null;
  onIr: () => void;
}) {
  if (cargando && lotes.length === 0) return null;

  if (error && lotes.length === 0) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--surface-raised)] px-4 py-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">
          No se pudieron leer los lotes: {error}
        </p>
        <Btn size="sm" variant="secondary" onClick={onIr}>
          Ver los lotes <ChevronRight className="h-4 w-4" aria-hidden />
        </Btn>
      </div>
    );
  }

  const piezas = lotes.reduce((a, l) => a + piezasLibres(l).length, 0);
  const volumen = lotes.reduce((a, l) => a + volumenLibre(l), 0);
  const n = lotes.length;
  const codigos = `${lotes.slice(0, 3).map((l) => l.code).join(", ")}${n > 3 ? ` y ${n - 3} más` : ""}`;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${
        enLinea
          ? "border-t border-[var(--rule-soft)] pt-3"
          : "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3"
      }`}
    >
      <Layers className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
      {lotes.length === 0 ? (
        <p className="flex min-w-0 flex-1 items-center gap-1 text-sm text-[var(--text-primary)]">
          <b>No hay lotes armados</b>
          <InfoTip
            title="Lotes"
            what="En Lotes se aparta la madera que entra junta a la sierra."
            affects="Después la corrida se declara eligiendo el lote, no tipeando el volumen."
          />
        </p>
      ) : piezas === 0 ? (
        /* «3 lotes esperando la sierra · 0 pza · 0.000 m³» se contradecía
           (medido en `main` y en la captura de Brandon, 2026-09-24): un lote
           abierto sin piezas libres no espera nada — le faltan piezas. */
        <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">
            {n} lote{n === 1 ? "" : "s"} abierto{n === 1 ? "" : "s"} sin piezas por cargar
          </b>{" "}
          · {codigos}
          <InfoTip
            className="ml-1"
            title="Lote sin piezas"
            what="El lote está abierto pero no tiene trozas libres para cargar."
            affects="Se llena en Lotes, o eligiéndolo en «Consumir en un lote…» y tildando las piezas."
          />
        </p>
      ) : (
        <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">
            {n} lote{n === 1 ? "" : "s"} esperando la sierra
          </b>{" "}
          · <span className="tabular-nums">
            {formatNumber(piezas)} pza · {fmtM3(volumen)} m³ · ≈{formatNumber(pieTablarAserrableDe(volumen, RENDIMIENTO_META))} pt aserr.
          </span>{" "}
          · {codigos}
        </p>
      )}
      <Btn size="sm" variant="secondary" onClick={onIr}>
        {lotes.length === 0 ? "Armar un lote" : "Ver los lotes"} <ChevronRight className="h-4 w-4" aria-hidden />
      </Btn>
    </div>
  );
}
