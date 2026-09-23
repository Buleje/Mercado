"use client";

/**
 * El precio del lote cubicado (ADR-430): con qué se valoriza y de dónde salió
 * cada número.
 *
 * Pedido de Brandon (22-09): «que al cubicar, elegir el cliente ponga solo ese
 * precio». Con el modo en **Aserrío** o **Venta**, cada pieza cuyo dueño salió
 * del Directorio toma el precio pactado con ese cliente; lo demás, el precio a
 * mano. En **A mano** es lo de siempre: el general y, si se puso, el de cada
 * especie.
 *
 * El editor del precio a mano vuelve acá: se perdió en la reescritura del
 * 19-08 (`e14e14d7e`) y desde entonces el valor del lote decía «carga el
 * precio por PT» sin un lugar donde cargarlo.
 *
 * Abajo, plegado, el desglose: una línea por dueño y especie con su origen
 * («precio del cliente para Tornillo»). Es lo que se lee para discutir el
 * importe frente al cliente.
 */
import { useState } from "react";
import { AlertTriangle, UserCheck, ChevronDown, Coins, Link2 } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { ETIQUETA_MODO_PRECIO, MODOS_PRECIO, type ModoPrecio } from "@/lib/forestal/precio-de-pieza";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { formatNumber } from "@/lib/format";
import type { PrecioCubicador } from "./hooks/use-precio-cubicador";

const soles = (n: number) => formatNumber(n, 2);
const precioTxt = (n: number) => formatNumber(n, { min: 2, max: 4 });
const CAMPO =
  "h-10 w-24 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right text-sm font-bold tabular-nums text-[var(--text-primary)] outline-none placeholder:font-normal placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]";

const QUE_HACE: Record<ModoPrecio, string> = {
  aserrio: "Cada pieza con dueño del Directorio usa su precio pactado de aserrío",
  venta: "Cada pieza con dueño del Directorio usa su precio pactado de venta",
  manual: "Todo va al precio a mano: el de la especie si lo pusiste, si no el general.",
};

export default function CubicadorPrecio({
  precios,
  especiesLote,
  fecha,
  nombreDe,
  sinDirectorio,
  vinculables,
  onVincular,
  onAbrirDirectorio,
}: {
  precios: PrecioCubicador;
  /** Las especies del lote, para el precio a mano de cada una. */
  especiesLote: readonly string[];
  /** El día del lote: con él se elige el trato vigente. */
  fecha: string;
  /** El nombre de un cliente del lote, para nombrarlo en los avisos. */
  nombreDe: (parteId: string) => string;
  /** Piezas con un dueño escrito a mano (no del Directorio): van al precio a mano. */
  sinDirectorio: number;
  /** De ésas, las que se pueden vincular ya: su nombre es el de alguien elegido antes del Directorio. */
  vinculables: number;
  onVincular: () => void;
  onAbrirDirectorio: () => void;
}) {
  const [verEspecies, setVerEspecies] = useState(false);
  const { modo } = precios;
  const hayPreciosEspecie = especiesLote.some((e) => Number(precios.preciosEspecie[e.toLowerCase()]) > 0);

  return (
    <section
      aria-label="Precio del lote"
      className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          <Coins className="h-4 w-4 text-[var(--accent)]" aria-hidden /> Precio
        </span>
        <SegmentedControl
          value={modo}
          onChange={precios.setModo}
          size="sm"
          label="Con qué se pone el precio de cada pieza"
          options={MODOS_PRECIO.map((m) => ({ value: m, label: ETIQUETA_MODO_PRECIO[m] }))}
        />
        <label className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <span>{modo === "manual" ? "General" : "Lo demás"} S/</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={precios.precioPt}
            onChange={(e) => precios.setPrecioPt(e.target.value)}
            placeholder="0.00"
            aria-label="Precio general a mano, en soles por pie tablar"
            className={CAMPO}
          />
          <span>por PT</span>
        </label>
        {especiesLote.length > 0 && (
          <button
            type="button"
            onClick={() => setVerEspecies((v) => !v)}
            aria-expanded={verEspecies}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            Por especie
            {hayPreciosEspecie && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-label="hay precios por especie" />}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${verEspecies ? "rotate-180" : ""}`} aria-hidden />
          </button>
        )}
        <div className="ml-auto text-right">
          <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Valor del lote</div>
          <div className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]" aria-live="polite">
            {precios.calculando ? "…" : precios.conValor ? `S/ ${soles(precios.valorLote)}` : "—"}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs leading-snug text-[var(--text-secondary)]">
        {QUE_HACE[modo]}
        {modo !== "manual" && (
          <>
            {" "}vigente el {etiquetaLarga(fecha)} (la fecha del lote); lo que su trato no cubre y las piezas sin dueño del Directorio, al precio a mano.
          </>
        )}
      </p>

      {modo !== "manual" && precios.calculando && (
        <p className="mt-1 text-xs text-[var(--text-tertiary)]" aria-live="polite">
          Leyendo el precio pactado de {precios.clientes.length === 1 ? nombreDe(precios.clientes[0]!) : `${precios.clientes.length} clientes`}…
        </p>
      )}
      {modo !== "manual" && precios.erroresTrato.length > 0 && (
        <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          No se pudo leer el precio pactado de {precios.erroresTrato.map(nombreDe).join(", ")}: sus piezas van al precio a mano.
          <button type="button" onClick={precios.recargarTratos} className="font-bold underline underline-offset-2">
            Reintentar
          </button>
        </p>
      )}
      {modo !== "manual" && sinDirectorio > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-secondary)]">
          <span>
            {sinDirectorio === 1 ? "1 pieza tiene" : `${sinDirectorio} piezas tienen`} un dueño escrito a mano, no del
            Directorio: {sinDirectorio === 1 ? "va" : "van"} al precio a mano.
          </span>
          {vinculables > 0 ? (
            <button
              type="button"
              onClick={onVincular}
              className="inline-flex items-center gap-1 font-bold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden /> Vincular {vinculables === 1 ? "1 pieza" : `${vinculables} piezas`} con su ficha
            </button>
          ) : (
            <button
              type="button"
              onClick={onAbrirDirectorio}
              className="inline-flex items-center gap-1 font-bold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]"
            >
              <UserCheck className="h-3.5 w-3.5" aria-hidden /> Elegir el dueño del Directorio
            </button>
          )}
        </p>
      )}

      {verEspecies && especiesLote.length > 0 && (
        <div className="mt-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[var(--text-secondary)]">Precio a mano por especie (S/ por pie tablar)</span>
            {hayPreciosEspecie && (
              <button
                type="button"
                onClick={precios.limpiarPreciosEspecie}
                className="text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {especiesLote.map((esp) => (
              <label key={esp.toLowerCase()} className="flex items-center gap-2 rounded-lg bg-[var(--surface-raised)] px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]" title={esp}>{esp}</span>
                <span className="text-xs text-[var(--text-tertiary)]">S/</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={precios.preciosEspecie[esp.toLowerCase()] ?? ""}
                  onChange={(e) => precios.cambiarPrecioEspecie(esp, e.target.value)}
                  placeholder={precios.general > 0 ? precioTxt(precios.general) : "0.00"}
                  aria-label={`Precio a mano de ${esp}, en soles por pie tablar`}
                  className={CAMPO}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            Vacío = usa el general. Se aplica al resumen, la liquidación, WhatsApp, PDF y Excel.
          </p>
        </div>
      )}

      {precios.desglose.length > 0 && (precios.conValor || modo !== "manual") && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Cómo se puso el precio · {precios.desglose.length} {precios.desglose.length === 1 ? "línea" : "líneas"}
          </summary>
          <DataTable className="min-w-[34rem]" wrapperClassName="mt-2 rounded-xl">
              <caption className="sr-only">Precio por dueño y especie, con su origen</caption>
              <thead>
                <tr>
                  <th scope="col">Dueño · especie</th>
                  <th scope="col" className="text-right">PT</th>
                  <th scope="col" className="text-right">S/ por PT</th>
                  <th scope="col">De dónde sale</th>
                  <th scope="col" className="text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {precios.desglose.map((l) => (
                  <tr key={l.clave}>
                    <th scope="row" className="px-3 py-2.5 text-left font-normal text-[var(--text-secondary)]">
                      {/* UN solo hijo con texto corrido: en celular la tabla se vuelve
                          tarjetas y la celda pasa a flex — cada hijo suelto sería
                          una columna (el ícono quedaba de 4 px y el «·» solo). */}
                      <span>
                        {l.delDirectorio && (
                          <UserCheck className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-[var(--accent)]" aria-label="del Directorio" />
                        )}
                        <b className="font-bold text-[var(--text-primary)]">{l.dueno ?? "Sin dueño"}</b>
                        {` · ${l.especie ?? "sin especie"}${l.tipo ? ` · ${l.tipo}` : ""}`}
                      </span>
                    </th>
                    <td className="text-right tabular-nums text-[var(--text-secondary)]">{formatNumber(l.pt, 2)}</td>
                    <td className="text-right font-bold tabular-nums text-[var(--text-primary)]">
                      {l.precio.desde ? precioTxt(l.precio.precioPt) : "—"}
                    </td>
                    <td className={`text-xs ${l.precio.desde?.startsWith("cliente-") ? "font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}>
                      {l.explicacion}
                    </td>
                    <td className="text-right tabular-nums text-[var(--text-primary)]">
                      {l.importe != null ? soles(l.importe) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
          </DataTable>
        </details>
      )}
    </section>
  );
}
