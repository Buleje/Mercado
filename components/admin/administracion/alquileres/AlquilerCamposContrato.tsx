"use client";

/**
 * AlquilerCamposContrato — los bloques de plata (renta, moneda, impuestos, día
 * de pago, garantía) y de plazo (inicio, fin, renovación, aviso, reajuste,
 * cuenta donde se paga). Sólo dibuja; los montos los redondea el servidor.
 */
import { CardTitle } from "@buleje/design-system";
import { FIELD_LABEL_CLASS, Field } from "@/components/admin/shared/Field";
import { AREA_TEXTO, CAMPO_ALTO } from "@/components/admin/planificacion/piezas/clases";
import { Interruptor } from "@/components/ui-system/Interruptor";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import type { Moneda } from "@/lib/admin/fichas-tramites-alquileres";
import { BLOQUE, FILA } from "./AlquilerCamposLocal";
import type { BorradorAlquiler, CambiarAlquiler } from "./use-alquiler-form";

const MONEDA_OPCIONES: { value: Moneda; label: string }[] = [
  { value: "PEN", label: "Soles (S/)" },
  { value: "USD", label: "Dólares (US$)" },
];

export function AlquilerCamposContrato({ b, cambiar }: { b: BorradorAlquiler; cambiar: CambiarAlquiler }) {
  const simbolo = b.moneda === "USD" ? "US$" : "S/";
  return (
    <>
      <section className={BLOQUE} aria-label="Plata">
        <CardTitle as="h3">Plata</CardTitle>
        <div className={FILA}>
          <Field label={`Renta mensual (${simbolo})`} required>
            <input type="text" className={CAMPO_ALTO} value={b.rentaMensual} inputMode="decimal" placeholder="Ej.: 1200" onChange={(e) => cambiar("rentaMensual", e.target.value)} />
          </Field>
          <div>
            <span className={FIELD_LABEL_CLASS}>Moneda</span>
            <SegmentedControl<Moneda> value={b.moneda} onChange={(v) => cambiar("moneda", v)} options={MONEDA_OPCIONES} size="xl" label="Moneda de la renta" />
          </div>
          <Field label="Día de pago" hint="Del 1 al 31; en meses cortos cae el último día">
            <input type="text" className={CAMPO_ALTO} value={b.diaPago} inputMode="numeric" maxLength={2} placeholder="Ej.: 5" onChange={(e) => cambiar("diaPago", e.target.value)} />
          </Field>
          <div className="self-end">
            <Interruptor enabled={b.incluyeImpuestos} onChange={(v) => cambiar("incluyeImpuestos", v)} label="La renta incluye impuestos" />
          </div>
        </div>
        <div className={FILA}>
          <Field label={`Garantía (${simbolo})`}>
            <input type="text" className={CAMPO_ALTO} value={b.garantiaMonto} inputMode="decimal" placeholder="Ej.: 2400" onChange={(e) => cambiar("garantiaMonto", e.target.value)} />
          </Field>
          <div className="self-end">
            <Interruptor enabled={b.garantiaPagada} onChange={(v) => cambiar("garantiaPagada", v)} label="La garantía ya se pagó" disabled={!b.garantiaMonto.trim()} />
          </div>
          {b.garantiaPagada && b.garantiaMonto.trim() && (
            <Field label="Se pagó el">
              <input type="date" className={CAMPO_ALTO} value={b.garantiaPagadaEl} onChange={(e) => cambiar("garantiaPagadaEl", e.target.value)} />
            </Field>
          )}
        </div>
      </section>

      <section className={BLOQUE} aria-label="Plazo">
        <CardTitle as="h3">Plazo</CardTitle>
        <div className={FILA}>
          <Field label="Empieza" required>
            <input type="date" className={CAMPO_ALTO} value={b.inicioEl} onChange={(e) => cambiar("inicioEl", e.target.value)} />
          </Field>
          <Field label="Termina" hint="Vacío si no tiene fecha de fin">
            <input type="date" className={CAMPO_ALTO} value={b.finEl} onChange={(e) => cambiar("finEl", e.target.value)} />
          </Field>
          <div className="self-end">
            <Interruptor enabled={b.renovacionAutomatica} onChange={(v) => cambiar("renovacionAutomatica", v)} label="Se renueva solo" />
          </div>
          <Field label="Avisar que no se renueva (días antes)" hint="Te lo recuerda la agenda">
            <input type="text" className={CAMPO_ALTO} value={b.avisoNoRenovarDias} inputMode="numeric" placeholder="Ej.: 60" onChange={(e) => cambiar("avisoNoRenovarDias", e.target.value)} />
          </Field>
        </div>
        <Field label="Reajuste">
          <input type="text" className={CAMPO_ALTO} value={b.reajuste} placeholder="Ej.: 5 % cada año desde el segundo" onChange={(e) => cambiar("reajuste", e.target.value)} />
        </Field>
        <div className={FILA}>
          <Field label="Banco y cuenta">
            <input type="text" className={CAMPO_ALTO} value={b.cuentaBanco} placeholder="Ej.: BCP 285-12345678-0-12" onChange={(e) => cambiar("cuentaBanco", e.target.value)} />
          </Field>
          <Field label="CCI">
            <input type="text" className={CAMPO_ALTO} value={b.cuentaCci} inputMode="numeric" maxLength={24} onChange={(e) => cambiar("cuentaCci", e.target.value)} />
          </Field>
          <Field label="Titular de la cuenta">
            <input type="text" className={CAMPO_ALTO} value={b.cuentaTitular} onChange={(e) => cambiar("cuentaTitular", e.target.value)} />
          </Field>
        </div>
        <Field label="Notas" hint="Sin claves ni contraseñas: el sistema las rechaza">
          <textarea className={AREA_TEXTO} value={b.notas} onChange={(e) => cambiar("notas", e.target.value)} />
        </Field>
      </section>
    </>
  );
}
