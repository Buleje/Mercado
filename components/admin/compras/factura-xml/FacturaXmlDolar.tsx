"use client";

/**
 * Factura en dólares (u otra moneda): el tipo de cambio SUNAT del día de emisión
 * y lo que la compra suma EN SOLES (la cifra que de verdad se guarda; si difiere
 * del total del papel al cambio, dice por qué). Si SUNAT no responde, el tipo de
 * cambio se escribe a mano y es obligatorio.
 */
import { CardTitle } from "@buleje/design-system";
import { Loader2 } from "@buleje/design-system/icons";
import { CAMPO } from "@/components/admin/comandos-ia/papel/formato";
import type { LineaFacturaXml } from "@/lib/compras/factura-xml";
import type { EstadoTipoCambio } from "./use-tipo-cambio";
import { diferenciaDeLaCompra, fechaNumerica, monto, tipoCambioTexto } from "./compra-desde-factura";

const TARJETA = "space-y-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3";
const ETIQUETA = "text-xs text-[var(--text-secondary)]";

export default function FacturaXmlDolar({
  estado,
  fecha,
  totalPapel,
  descuentos,
  lineas,
  quitadas,
}: {
  estado: EstadoTipoCambio;
  fecha: string;
  totalPapel: number;
  /** Descuento global del papel (no se reparte en las líneas). */
  descuentos: number;
  lineas: readonly LineaFacturaXml[];
  quitadas: readonly number[];
}) {
  const { moneda, cargando, dato, error, cambio } = estado;
  const nombre = moneda === "USD" ? "dólar" : moneda;
  const resumen = cambio ? diferenciaDeLaCompra({ lineas, quitadas, totalPapel, descuentos, tc: cambio.venta }) : null;
  const deSunat = dato?.fuente === "sunat";

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
            Tipo de cambio {deSunat ? "SUNAT " : ""}del {fechaNumerica(fecha)}:{" "}
            <span className="font-semibold tabular-nums">S/ {tipoCambioTexto(dato.venta)}</span> por {nombre}
          </p>
          <p className={ETIQUETA}>
            Venta, el que SUNAT pide para compras
            {deSunat ? "" : ` · de la ${dato.detalle}, no de SUNAT`}
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
      {resumen && (
        <>
          <p className="text-sm text-[var(--text-primary)]" data-factura-xml-total-soles>
            La compra suma <span className="text-base font-semibold tabular-nums">{monto(resumen.compra, "PEN")}</span>
          </p>
          <p className={ETIQUETA} data-factura-xml-total-diferencia={resumen.motivo ? "" : undefined}>
            {resumen.motivo
              ? `No es ${monto(resumen.esperado, "PEN")} (${monto(totalPapel, moneda)} al tipo de cambio) porque ${resumen.motivo}`
              : `${monto(totalPapel, moneda)} al tipo de cambio · cada costo se pasa a soles al guardar`}
          </p>
        </>
      )}
    </section>
  );
}
