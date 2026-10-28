"use client";

/**
 * «Precio por pie» del modal «Guardar cubicación» (24-10): el MISMO precio del
 * lote (`usePrecioCubicador`), no una copia. A mano se edita acá —el general
 * y la tabla especie × tipo (28-10: «a cuánto lo acordado de corta,
 * comercial…»)—; con el trato de los dueños (Aserrío / Venta) se muestra lo que
 * puso cada trato y no se pisa.
 */
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { ETIQUETA_MODO_PRECIO } from "@/lib/forestal/precio-de-pieza";
import { formatNumber } from "@/lib/format";
import TablaPrecioEspecieTipo from "./cubicador-precio-especie-tipo";
import type { PrecioCubicador } from "./hooks/use-precio-cubicador";

const precioTxt = (n: number) => formatNumber(n, { min: 2, max: 4 });
const CAMPO =
  "h-12 w-28 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-right text-base font-bold tabular-nums text-[var(--text-primary)] outline-none placeholder:font-normal placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]";
const MODO = "rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]";

export default function PrecioDeGuardar({ precios, especiesLote, rows }: {
  precios: PrecioCubicador;
  especiesLote: string[];
  /** Las piezas que se guardan: arman las filas (especies) y columnas (tipos) de la tabla «A mano». */
  rows: readonly PiezaCubicada[];
}) {
  const { modo } = precios;
  const aMano = modo === "manual";
  const conEspecies = especiesLote.length > 0;
  return (
    <section aria-labelledby="cubg-precio" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <CardTitle as="h3" id="cubg-precio">Precio por pie tablar</CardTitle>
        <span className={MODO}>{ETIQUETA_MODO_PRECIO[modo]}</span>
        <InfoTip
          what={aMano
            ? "El precio de cada pie tablar (PT). En la tabla, el de la especie le gana al general y el de un tipo (Corta, Comercial…) le gana al de su especie. Vacío = usa el de arriba (lo ves en gris)."
            : `Cada pieza con dueño del Directorio usa su precio pactado de ${modo === "aserrio" ? "aserrío" : "venta"}. Acá sólo se muestra: no se cambia.`}
          affects="Es el mismo precio de «Precio del lote»: lo que cambies acá, cambia allá. Cada pieza se guarda con su precio."
          example={aMano ? "General S/ 2.00, Tornillo S/ 2.50 y Tornillo Corta S/ 1.80: la Corta del Tornillo va a 1.80, el resto del Tornillo a 2.50 y las demás especies a 2.00." : "Para ponerlo a mano, en «Precio del lote» elige «A mano»."}
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
          {conEspecies && <TablaPrecioEspecieTipo precios={precios} rows={rows} />}
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
