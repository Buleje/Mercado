/**
 * «Atraso de lo que te deben» con el monto ENCIMA de cada barra (antes eran
 * barras sin cifra y un eje «S/» / «3,800.00» partido en dos renglones).
 *
 * Una sola lista que cambia de forma por el ancho del bloque: angosta (celular
 * o columna estrecha) = filas «tramo · monto» con la barra acostada; ancha =
 * cinco columnas con el monto arriba. Sin gráfico de librería: con cinco
 * cifras, el monto escrito ES el dato y la barra sólo compara.
 */
import type { CSSProperties } from "react";
import type { TramoAnalisis } from "@/lib/adelantos/analisis";
import { TRAMOS, type TramoId } from "@/lib/adelantos/gestion-cobranza";
import { fmtMon } from "../shared";
import { montoEje, personas } from "./formato";

const TONO = Object.fromEntries(TRAMOS.map((t) => [t.id, t.tono])) as Record<TramoId, string>;

export function AtrasoBarras({ atraso, moneda }: { atraso: TramoAnalisis[]; moneda: string }) {
  const max = Math.max(0, ...atraso.map((t) => t.monto));
  return (
    <ul className="grid gap-3 @lg:grid-cols-5 @lg:items-end @lg:gap-3" aria-label="Lo que te deben, por atraso">
      {atraso.map((t) => {
        const p = max > 0 && t.monto > 0 ? Math.max(3, Math.round((t.monto / max) * 100)) : 0;
        return (
          <li
            key={t.id}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 @lg:grid-cols-1 @lg:justify-items-center @lg:text-center"
            style={{ "--p": `${p}%`, "--tono": TONO[t.id] } as CSSProperties}
          >
            <span className="col-start-1 row-start-1 text-sm font-semibold text-[var(--text-secondary)] @lg:row-start-3 @lg:mt-1">{t.label}</span>
            <span className="col-start-2 row-start-1 whitespace-nowrap text-right text-sm font-bold tabular-nums text-[var(--text-primary)] @lg:col-start-1 @lg:text-center">
              {t.monto > 0 ? (
                <>
                  <span className="@lg:hidden @2xl:inline">{fmtMon(t.monto, moneda)}</span>
                  <span className="hidden @lg:inline @2xl:hidden">{montoEje(t.monto, moneda)}</span>
                </>
              ) : (
                <span className="font-normal text-[var(--text-tertiary)]">—</span>
              )}
            </span>
            {/* La pista va por `--pista`: la clase `bg-[var(--surface-sunken)]` lleva un
                !important en oscuro (globals.css) que pintaba un cajón en cada columna. */}
            <div
              className="col-span-2 row-start-2 h-3 w-full overflow-hidden rounded-full bg-[var(--pista)] [--pista:var(--surface-sunken)] @lg:col-span-1 @lg:flex @lg:h-36 @lg:items-end @lg:justify-center @lg:overflow-visible @lg:rounded-none @lg:border-b @lg:border-[var(--rule-base)] @lg:[--pista:transparent]"
              aria-hidden
            >
              <div className="h-full w-[var(--p)] rounded-full bg-[var(--tono)] @lg:h-[var(--p)] @lg:w-full @lg:max-w-14 @lg:rounded-none @lg:rounded-t-md" />
            </div>
            {/* Sin personas: en filas no ocupa renglón; en columnas guarda el alto para que las barras se alineen. */}
            <span className={`col-span-2 row-start-3 text-sm text-[var(--text-tertiary)] @lg:col-span-1 @lg:row-start-4 ${t.personas > 0 ? "" : "hidden @lg:block"}`}>
              {t.personas > 0 ? personas(t.personas) : "\u00a0"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
