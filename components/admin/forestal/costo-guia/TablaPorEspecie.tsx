"use client";

/**
 * El precio por especie de una guía (ADR-437 §3): una fila por asiento (=
 * especie, ADR-312) con su unidad, lo que dice la factura y el precio; al pie la
 * suma contra el total de la factura.
 *
 * Filas y no `<table>`: a 400 px una tabla de siete columnas obligaba a
 * deslizar de costado justo en el celular del patio. En pantalla ancha las
 * filas se alinean en grilla y se leen igual que una tabla.
 */

import { useId } from "react";
import { Scale } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { ptDelBorrador, type FuentePt, type PlataDeGuiaDTO } from "@/lib/forestal/plata-de-guia";
import type { UnidadPrecio, useBorradorCompra } from "@/hooks/use-plata-de-guia";
import { CAMPO, soles } from "./comun";

type Borrador = ReturnType<typeof useBorradorCompra>;

const GRILLA =
  "sm:grid sm:grid-cols-[minmax(0,1.3fr)_5.5rem_minmax(0,1fr)_minmax(0,1fr)_6.5rem] sm:items-center sm:gap-2";
const CHICO = `${CAMPO} h-10 px-2 text-sm`;

/** «3 120 pt Oxapampa» / «≈ 3 674 pt»: el PT con su fuente, en una sola forma. */
const conFuente = (pt: number, fuente: "oxapampa" | "estimado") =>
  fuente === "oxapampa" ? `${formatNumber(pt, 0)} pt Oxapampa` : `≈ ${formatNumber(pt, 0)} pt`;

const CON: Record<FuentePt, string> = {
  factura: "con la cantidad de la factura",
  oxapampa: "con PT Oxapampa",
  estimado: "con ≈ pt estimado",
};

export default function TablaPorEspecie({ dto, b }: { dto: PlataDeGuiaDTO; b: Borrador }) {
  const idFactura = useId();
  const { calculo } = b;

  return (
    <div className="space-y-2">
      <div
        className={`hidden px-1 text-sm font-bold text-[var(--text-tertiary)] ${GRILLA}`}
        aria-hidden
      >
        <span>Especie</span>
        <span>Unidad</span>
        <span>Cantidad factura</span>
        <span>Precio (S/)</span>
        <span className="text-right">Subtotal</span>
      </div>

      {dto.lineas.map((l) => {
        const f = b.filas[l.id] ?? { unidad: "m3" as UnidadPrecio, precio: "", cantidad: "" };
        const c = calculo.lineas.find((x) => x.id === l.id);
        /* El PT que se multiplica: el ya pagado (sellado) salvo «usar la de hoy». */
        const pago = ptDelBorrador(l, Boolean(b.ptHoy[l.id]));
        const sellado = ptDelBorrador(l, false);
        const remedida =
          f.unidad === "pt" && f.cantidad.trim() === "" && sellado.congelado && Math.abs(sellado.pt - l.ptPago.pt) > 0.005;
        /* Placeholder corto: en el celular el campo mide ~100 px («277 pt Oxa…» se cortaba). */
        const nuestra =
          f.unidad === "m3"
            ? `${formatNumber(l.volumeM3, { max: 3 })} m³`
            : `${pago.fuente === "oxapampa" ? "" : "≈ "}${formatNumber(pago.pt, 0)} pt`;
        const cambio =
          l.costoTotal != null && c?.costoTotal != null && Math.abs(l.costoTotal - c.costoTotal) > 0.005;
        return (
          <div key={l.id} className={`rounded-xl border border-[var(--rule-soft)] p-2 ${GRILLA}`}>
            <div className="min-w-0">
              <div className="truncate font-bold text-[var(--text-primary)]">
                {l.speciesCommonName}
              </div>
              <div className="text-sm tabular-nums text-[var(--text-secondary)]">
                {formatNumber(l.volumeM3, { max: 3 })} m³ · {conFuente(pago.pt, pago.fuente)}
                {!pago.congelado && l.ptPago.total > 0 && (
                  <span className="text-[var(--text-tertiary)]">
                    {" "}
                    · {l.ptPago.cubicadas} de {l.ptPago.total} cubicadas
                  </span>
                )}
              </div>
              {remedida && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[var(--text-secondary)]">
                  <span>
                    Pagado con {conFuente(sellado.pt, sellado.fuente)} · hoy da{" "}
                    {sellado.fuente === l.ptPago.fuente
                      ? `${formatNumber(l.ptPago.pt, 0)} pt`
                      : conFuente(l.ptPago.pt, l.ptPago.fuente)}
                    <span className="text-[var(--text-tertiary)]">
                      {" "}
                      ({l.ptPago.cubicadas} de {l.ptPago.total} cubicadas)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => b.usarPtDeHoy(l.id, !b.ptHoy[l.id])}
                    className="h-8 rounded-lg px-1.5 font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
                  >
                    {b.ptHoy[l.id] ? "Dejar lo pagado" : "Usar la de hoy"}
                  </button>
                </div>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:contents">
              <select
                aria-label={`Unidad del precio de ${l.speciesCommonName}`}
                value={f.unidad}
                onChange={(e) =>
                  b.cambiarFila(l.id, { unidad: e.target.value as UnidadPrecio, cantidad: "" })
                }
                className={CHICO}
              >
                <option value="m3">m³</option>
                <option value="pt">pt</option>
              </select>
              <input
                aria-label={`Cantidad de ${l.speciesCommonName} en la factura`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.001"
                value={f.cantidad}
                onChange={(e) => b.cambiarFila(l.id, { cantidad: e.target.value })}
                placeholder={nuestra}
                title="Lo que dice la factura. Vacío = se usa la nuestra (el m³ del libro o el ≈pt)"
                className={CHICO}
              />
              <input
                aria-label={`Precio por ${f.unidad === "m3" ? "m³" : "pie tablar"} de ${l.speciesCommonName}`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={f.precio}
                onChange={(e) => b.cambiarFila(l.id, { precio: e.target.value })}
                placeholder={f.unidad === "m3" ? "por m³" : "por pt"}
                className={CHICO}
              />
            </div>
            <div className="mt-1 text-right text-base font-bold tabular-nums text-[var(--text-primary)] sm:mt-0">
              {c?.costoTotal == null ? (
                <span className="text-[var(--text-tertiary)]">—</span>
              ) : (
                soles(c.costoTotal)
              )}
              {c?.costoTotal != null && (c.fuentePt != null || c.cantidadDerivada) && (
                <span
                  className={`block text-xs font-normal ${c.fuentePt === "estimado" ? "text-[var(--data-warning-ink)]" : "text-[var(--text-tertiary)]"}`}
                >
                  {c.fuentePt ? CON[c.fuentePt] : "con el m³ del libro"}
                </span>
              )}
              {cambio && (
                <span className="block text-xs font-normal text-[var(--text-tertiary)]">
                  antes {soles(l.costoTotal)}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Pie: la suma contra la factura. */}
      <div className="rounded-xl bg-[var(--surface-sunken)] p-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-[var(--text-secondary)]">
              Suma de las especies
            </div>
            <div className="text-lg font-black tabular-nums text-[var(--text-primary)]">
              {soles(calculo.suma)}
            </div>
          </div>
          <div className="w-44">
            <div className="mb-1 flex items-center gap-1.5">
              <label htmlFor={idFactura} className="text-sm font-bold text-[var(--text-secondary)]">
                Total de la factura
              </label>
              <InfoTip
                title="Total de la factura"
                what="Lo que dice el papel del proveedor. La suma de las especies tiene que llegar a eso, al céntimo."
                affects="Vacío = la factura es la suma de arriba."
              />
            </div>
            <input
              id={idFactura}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={b.total}
              onChange={(e) => b.cambiarTotal(e.target.value)}
              placeholder={calculo.completas ? String(calculo.suma) : "0.00"}
              className={CHICO}
            />
          </div>
        </div>
        {calculo.cuadre && !calculo.cuadre.cierra && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold text-[var(--data-warning-ink)]">
              {calculo.cuadre.diferencia > 0
                ? `Faltan ${soles(calculo.cuadre.diferencia)} para llegar a la factura`
                : `Sobran ${soles(-calculo.cuadre.diferencia)} sobre la factura`}
            </span>
            {calculo.cuadre.ajuste && (
              <button
                type="button"
                onClick={() => b.setAjuste(calculo.cuadre?.ajuste ?? null)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--accent-dark)] px-3 font-bold text-[var(--accent-ink)] hover:bg-[var(--accent)]/10 dark:text-[var(--accent)]"
              >
                <Scale className="h-4 w-4" aria-hidden />
                Ajustar {soles(calculo.cuadre.ajuste.monto)} en{" "}
                {calculo.cuadre.ajuste.especie ?? "la especie mayor"}
              </button>
            )}
          </div>
        )}
        {!calculo.completas && (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Falta el precio de alguna especie.
          </p>
        )}
      </div>
    </div>
  );
}
