"use client";

/**
 * Las tarjetas del patio sobre LA PILA en sí: de qué grosor es (clases
 * diamétricas) y qué tan lista está para una fiscalización.
 *
 * «Calibre», «Largo» y «Volumen por troza» eran tres tarjetas sueltas que se
 * leían por separado; acá van juntas, con el histograma que dice lo que un
 * promedio esconde (una pila de 40 y 80 cm promedia 60 y no tiene ni una de 60).
 * Ninguna cifra se perdió: el promedio, la más gruesa, el largo y el volumen
 * por pieza siguen, más chicos, al pie.
 *
 * La cuenta vive en `lib/forestal/trozas-patio-kpis.ts`.
 */

import { Ruler, ShieldCheck } from "@buleje/design-system/icons";
import type { CifrasExtraPatio } from "@/lib/forestal/trozas-patio-medidas";
import type { ClaseDiametrica, FiscalizacionPatio, FilaFiscal } from "@/lib/forestal/trozas-patio-kpis";
import { BarraMini, TarjetaPatio } from "./ctp-trozas-kpi-tarjeta";
import { n2 } from "./ctp-trozas-ui";

export function TarjetaCalibre({
  clases, extra, onAnotar,
}: {
  clases: ClaseDiametrica[];
  extra: CifrasExtraPatio;
  /** Abre la planilla «Anotar D1/D2» con las que faltan. */
  onAnotar?: () => void;
}) {
  const maxPz = Math.max(1, ...clases.map((c) => c.piezas));
  const pie = [
    extra.largoPromedioM != null ? `largo ${n2(extra.largoPromedioM)} m${extra.largoMayorM != null ? ` (máx ${n2(extra.largoMayorM)})` : ""}` : "",
    extra.m3PromedioPorPieza != null ? `${n2(extra.m3PromedioPorPieza)} m³ por troza${extra.m3MayorPieza != null ? ` (máx ${n2(extra.m3MayorPieza)})` : ""}` : "",
  ].filter(Boolean);
  return (
    <TarjetaPatio
      label="Calibre de la pila"
      icono={Ruler}
      valor={extra.calibrePromedioCm != null ? `${n2(extra.calibrePromedioCm)} cm` : "—"}
      contexto={
        extra.calibrePromedioCm != null
          ? `D medio${extra.calibreMayorCm != null ? ` · la más gruesa ${n2(extra.calibreMayorCm)} cm` : ""}`
          : "sin D1/D2: no se puede clasificar"
      }
      tono={extra.calibrePromedioCm == null ? "muted" : "neutral"}
      info={{
        what: "Lo parado por clase de diámetro medio, (D1 + D2) ÷ 2, de 10 en 10 cm. Cada barra es la cantidad de piezas.",
        affects: "Decide qué sale de la sierra: las gruesas dan tablas anchas. Una pieza sin D1/D2 no se clasifica (el diámetro equivalente es una pista para anotar, no una medida).",
        example: "La barra «60» son las de 60 a 69 cm.",
      }}
      accion={
        extra.sinMedidas > 0 ? (
          onAnotar ? (
            <button
              type="button"
              onClick={onAnotar}
              className="min-h-8 text-left text-xs font-bold text-[var(--data-warning-700)] hover:underline dark:text-[var(--data-warning-500)]"
            >
              {extra.sinMedidas} sin D1/D2 · anotarlas
            </button>
          ) : (
            <span className="text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{extra.sinMedidas} sin D1/D2</span>
          )
        ) : undefined
      }
    >
      {clases.length > 0 && (
        <div className="flex h-20 items-end gap-1.5" role="img" aria-label={clases.map((c) => `${c.desde} a ${c.hasta - 1} cm: ${c.piezas}`).join(", ")}>
          {clases.map((c) => (
            <div key={c.desde} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5" title={`${c.desde} a ${c.hasta - 1} cm: ${c.piezas} pz · ${n2(c.m3)} m³`}>
              <span className="font-mono text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-primary)]">{c.piezas || ""}</span>
              {/* La pista ocupa lo que dejan los dos rótulos: sin ella, el % de
                  la barra se medía contra la columna entera y el flex la
                  encogía (6 piezas se dibujaban casi como 1). */}
              <span className="flex w-full min-h-0 flex-1 items-end justify-center border-b border-[var(--rule-base)]">
                <span
                  className="block w-full max-w-10 rounded-t-sm bg-[var(--data-5)]"
                  style={{ height: `${c.piezas > 0 ? Math.max(6, (c.piezas / maxPz) * 100) : 0}%` }}
                />
              </span>
              <span className="font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">{c.desde}</span>
            </div>
          ))}
        </div>
      )}
      {pie.length > 0 && <p className="text-xs text-[var(--text-secondary)]">{pie.join(" · ")}</p>}
    </TarjetaPatio>
  );
}

export function TarjetaFiscal({
  fisc, onFila,
}: {
  fisc: FiscalizacionPatio;
  /** Qué hacer al tocar una fila incompleta; sin función para esa clave, la fila no es botón. */
  onFila: Partial<Record<FilaFiscal["clave"], (ids: string[]) => void>>;
}) {
  const todas = fisc.total > 0 && fisc.listas === fisc.total;
  const legales = fisc.filas.filter((f) => f.legal);
  const operativas = fisc.filas.filter((f) => !f.legal);
  return (
    <TarjetaPatio
      label="Listo para fiscalizar"
      icono={ShieldCheck}
      valor={fisc.total > 0 ? `${fisc.listas} de ${fisc.total}` : "—"}
      contexto={fisc.total > 0 ? "con código, D1/D2 y título" : "no hay nada parado"}
      tono={fisc.total === 0 ? "muted" : todas ? "success" : "warning"}
      info={{
        what: "Piezas paradas que tienen todo lo que pide el papel en una inspección: código de la guía, las dos puntas medidas y el título habilitante.",
        affects: "Etiqueta QR y cancha no son del papel, pero sin ellas la pieza no se encuentra en el patio cuando la piden.",
        example: "Toca una fila incompleta para resolverla (imprimir las etiquetas que faltan, anotar D1/D2…).",
      }}
    >
      <div className="space-y-1">
        {legales.map((f) => <FilaChequeo key={f.clave} fila={f} onClick={onFila[f.clave]} />)}
        {operativas.length > 0 && (
          <div className="space-y-1 border-t border-dashed border-[var(--rule-soft)] pt-1">
            {operativas.map((f) => <FilaChequeo key={f.clave} fila={f} onClick={onFila[f.clave]} />)}
          </div>
        )}
      </div>
    </TarjetaPatio>
  );
}

function FilaChequeo({ fila, onClick }: { fila: FilaFiscal; onClick?: (ids: string[]) => void }) {
  const completa = fila.total > 0 && fila.con === fila.total;
  const color = completa ? "var(--data-success-500)" : "var(--data-warning-500)";
  const cuerpo = (
    <>
      <span className="truncate text-xs text-[var(--text-secondary)]">{fila.label}</span>
      <BarraMini valor={fila.con} max={fila.total} color={color} alto="h-1.5" />
      <span className="font-mono text-xs tabular-nums text-[var(--text-primary)]">
        <b>{fila.con}</b>
        <span className="text-[var(--text-tertiary)]">/{fila.total}</span>
      </span>
    </>
  );
  const clase = "grid w-full grid-cols-[5rem_1fr_3rem] items-center gap-2 text-left";
  if (onClick && !completa && fila.faltan.length > 0) {
    return (
      <button
        type="button"
        onClick={() => onClick(fila.faltan)}
        title={`${fila.hint} · faltan ${fila.faltan.length}: toca para resolverlas`}
        className={`${clase} -mx-1 rounded-md px-1 py-0.5 transition-colors hover:bg-[var(--surface-sunken)]`}
      >
        {cuerpo}
      </button>
    );
  }
  return (
    <div className={`${clase} py-0.5`} title={fila.hint}>
      {cuerpo}
    </div>
  );
}
