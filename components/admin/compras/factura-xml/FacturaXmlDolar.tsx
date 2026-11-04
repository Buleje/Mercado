"use client";

/**
 * Factura en dólares (u otra moneda): el tipo de cambio SUNAT del día de emisión
 * y a cuánto equivale en soles. La compra se guarda EN SOLES; si SUNAT no
 * responde, el tipo de cambio se escribe a mano y es obligatorio.
 */
import { CardTitle } from "@buleje/design-system";
import { Loader2 } from "@buleje/design-system/icons";
import { CAMPO } from "@/components/admin/comandos-ia/papel/formato";
import type { LineaFacturaXml } from "@/lib/compras/factura-xml";
import type { EstadoTipoCambio } from "./use-tipo-cambio";
import { aCentimos, fechaNumerica, monto, tipoCambioTexto, totalLineaEnSoles } from "./compra-desde-factura";

const TARJETA = "space-y-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3";
const ETIQUETA = "text-xs text-[var(--text-secondary)]";

export default function FacturaXmlDolar({
  estado,
  fecha,
  totalPapel,
  lineas,
  quitadas,
}: {
  estado: EstadoTipoCambio;
  fecha: string;
  totalPapel: number;
  lineas: readonly LineaFacturaXml[];
  quitadas: readonly number[];
}) {
  const { moneda, cargando, dato, error, cambio } = estado;
  const nombre = moneda === "USD" ? "dólar" : moneda;
  const enSoles = cambio ? aCentimos(totalPapel * cambio.venta) : null;
  /* Lo que sumará la compra: cada línea pasada a soles y redondeada al céntimo
     (puede diferir en céntimos del total × tipo de cambio) y sin las quitadas. */
  const compra = cambio
    ? aCentimos(lineas.filter((l) => !quitadas.includes(l.numero)).reduce((s, l) => s + totalLineaEnSoles(l, cambio.venta), 0))
    : null;
  const difiere = enSoles !== null && compra !== null && Math.abs(compra - enSoles) >= 0.005;

  return (
    <section className={TARJETA} data-factura-xml-cambio aria-live="polite">
      <CardTitle>Se guarda en soles</CardTitle>
      {cargando && (
        <p className={`${ETIQUETA} flex items-center gap-2`}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando el tipo de cambio SUNAT del {fechaNumerica(fecha)}…
        </p>
      )}
      {dato && (
        <>
          <p className="text-sm text-[var(--text-primary)]" data-factura-xml-tc={dato.venta}>
            Tipo de cambio SUNAT del {fechaNumerica(fecha)}:{" "}
            <span className="font-semibold tabular-nums">S/ {tipoCambioTexto(dato.venta)}</span> por {nombre}
          </p>
          <p className={ETIQUETA}>
            Venta, el que SUNAT pide para compras
            {dato.fuente === "bcrp-sbs" ? ` · ${dato.detalle}` : ""}
          </p>
        </>
      )}
      {error && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[var(--data-warning-ink)]">{error}</p>
          <label className="block max-w-xs space-y-1">
            <span className={ETIQUETA}>
              Tipo de cambio del {fechaNumerica(fecha)} (S/ por 1 {nombre}, venta)
            </span>
            <input
              className={CAMPO}
              inputMode="decimal"
              autoComplete="off"
              placeholder={moneda === "USD" ? "3.750" : ""}
              value={estado.manual}
              onChange={(e) => estado.setManual(e.target.value)}
              aria-invalid={estado.manualInvalido || undefined}
              data-factura-xml-tc-manual
            />
          </label>
          {estado.manualInvalido && (
            <p className="text-xs font-semibold text-[var(--data-error-ink)]">
              {moneda === "USD" ? "Escribe un tipo de cambio entre 2.50 y 5.50 (por ejemplo 3.752)" : "Escribe cuántos soles vale 1 " + moneda}
            </p>
          )}
        </div>
      )}
      {enSoles !== null && (
        <p className="text-sm text-[var(--text-primary)]" data-factura-xml-total-soles>
          {monto(totalPapel, moneda)} ={" "}
          <span className="font-semibold tabular-nums">{monto(enSoles, "PEN")}</span>
          <span className={ETIQUETA}> · cada costo se pasa a soles al guardar</span>
        </p>
      )}
      {difiere && compra !== null && (
        <p className={ETIQUETA} data-factura-xml-total-compra>
          La compra suma <span className="font-semibold tabular-nums text-[var(--text-primary)]">{monto(compra, "PEN")}</span>
          {quitadas.length > 0 ? ": sin las líneas quitadas y con" : ": con"} cada línea redondeada al céntimo
        </p>
      )}
    </section>
  );
}
