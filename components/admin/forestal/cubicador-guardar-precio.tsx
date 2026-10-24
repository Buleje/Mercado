"use client";

/**
 * «Precio por pie» del modal «Guardar cubicación» (24-10): el MISMO precio del
 * lote (`usePrecioCubicador`), no una copia. A mano se edita acá —el general
 * y, si hay varias especies, el de cada una—; con el trato de los dueños
 * (Aserrío / Venta) se muestra lo que puso cada trato y no se pisa.
 */
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { ETIQUETA_MODO_PRECIO } from "@/lib/forestal/precio-de-pieza";
import { formatNumber } from "@/lib/format";
import type { PrecioCubicador } from "./hooks/use-precio-cubicador";

const precioTxt = (n: number) => formatNumber(n, { min: 2, max: 4 });
const CAMPO =
  "h-12 w-28 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-right text-base font-bold tabular-nums text-[var(--text-primary)] outline-none placeholder:font-normal placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]";
const MODO = "rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]";

export default function PrecioDeGuardar({ precios, especiesLote }: { precios: PrecioCubicador; especiesLote: string[] }) {
  const { modo } = precios;
  const aMano = modo === "manual";
  const conEspecies = especiesLote.length > 1 || especiesLote.some((e) => Number(precios.preciosEspecie[e.toLowerCase()]) > 0);
  return (
    <section aria-labelledby="cubg-precio" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <CardTitle as="h3" id="cubg-precio">Precio por pie tablar</CardTitle>
        <span className={MODO}>{ETIQUETA_MODO_PRECIO[modo]}</span>
        <InfoTip
          what={aMano
            ? "El precio de cada pie tablar (PT). Si pones el de una especie, esa especie usa el suyo; el resto, el general."
            : `Cada pieza con dueño del Directorio usa su precio pactado de ${modo === "aserrio" ? "aserrío" : "venta"}. Acá sólo se muestra: no se cambia.`}
          affects="Es el mismo precio de «Precio del lote»: lo que cambies acá, cambia allá. Cada pieza se guarda con su precio."
          example={aMano ? "General S/ 2.00 y Tornillo S/ 2.50: el Tornillo se cobra a 2.50." : "Para ponerlo a mano, en «Precio del lote» elige «A mano»."}
        />
      </div>

      {aMano ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-secondary)]">General (S/ por PT)</span>
            <input type="number" inputMode="decimal" min={0} step="0.01" className={CAMPO} value={precios.precioPt}
              placeholder="0.00" aria-label="Precio general, en soles por pie tablar"
              onChange={(e) => precios.setPrecioPt(e.target.value)} data-campo="precio-general" />
          </label>
          {conEspecies && (
            <div className="grid gap-2 sm:grid-cols-2">
              {especiesLote.map((esp) => (
                <label key={esp.toLowerCase()} className="flex items-center gap-2 rounded-2xl bg-[var(--surface-sunken)] px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]" title={esp}>{esp}</span>
                  <input type="number" inputMode="decimal" min={0} step="0.01" className={CAMPO}
                    value={precios.preciosEspecie[esp.toLowerCase()] ?? ""}
                    placeholder={precios.general > 0 ? precioTxt(precios.general) : "0.00"}
                    aria-label={`Precio de ${esp}, en soles por pie tablar`}
                    onChange={(e) => precios.cambiarPrecioEspecie(esp, e.target.value)} />
                </label>
              ))}
            </div>
          )}
        </div>
      ) : precios.desglose.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">{precios.calculando ? "Leyendo los tratos…" : "Sin piezas con precio."}</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-base)] rounded-2xl border border-[var(--rule-base)]">
          {precios.desglose.map((l) => (
            <li key={l.clave} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 font-semibold text-[var(--text-primary)]">
                {l.especie ?? "Sin especie"}{l.tipo ? ` · ${l.tipo}` : ""}
                <span className="font-normal text-[var(--text-secondary)]"> · {l.dueno ?? "Sin dueño"}</span>
              </span>
              <span className="font-mono tabular-nums text-[var(--text-secondary)]">{fmtPt(l.pt)} PT</span>
              <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
                {l.precio.precioPt > 0 ? `S/ ${precioTxt(l.precio.precioPt)}` : "Sin precio"}
              </span>
              {l.importe != null && <span className="font-mono tabular-nums text-[var(--text-secondary)]">= S/ {fmtSoles(l.importe)}</span>}
              <InfoTip what={l.explicacion} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
