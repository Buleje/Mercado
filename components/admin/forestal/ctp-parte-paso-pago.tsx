"use client";

/**
 * Paso «Pago y vínculos» de la ficha del Directorio: cómo se le paga (banco,
 * cuenta, CCI, condición) y con quién está vinculada. Van juntos porque los dos
 * contestan «cómo está su cuenta».
 */

import { Check, Copy } from "@buleje/design-system/icons";
import { CONDICIONES_PAGO, textoCondicionPago } from "@/lib/forestal/directorio";
import { Field, I, Seccion } from "./ctp-shared";
import CtpParteVinculos from "./CtpParteVinculos";
import { PendientesDelPaso } from "./ctp-parte-salud";
import type { ParteFormEstado } from "./hooks/use-parte-form";

export default function CtpPartePasoPago({ form }: { form: ParteFormEstado }) {
  const { b, set, cciMal, copiado, copiar, existentes, saldo } = form;
  return (
    <>
      <PendientesDelPaso pendientes={form.pendientesDe("pago")} />
      {/* Sin esto, cada pago vuelve a pedir el número de cuenta por chat. */}
      <Seccion title="Cómo se le paga" hint="Para transferirle sin volver a pedir los datos">
        <Field label="Banco" span={4} hint="El banco o la caja donde tiene su cuenta." ejemplo="BCP" afecta="Con la cuenta y el CCI, se le transfiere sin pedir los datos por chat.">
          <input type="text" className={I} value={b.banco ?? ""} onChange={(e) => set({ banco: e.target.value })} placeholder="BCP, Interbank…" />
        </Field>
        <Field label="N° de cuenta" span={4} hint="El número de cuenta, como sale en su voucher o en la app del banco." ejemplo="215-12345678-0-12" afecta="Sirve para depositarle en el mismo banco.">
          <input type="text" className={`${I} font-mono`} value={b.cuentaNumero ?? ""} onChange={(e) => set({ cuentaNumero: e.target.value })} />
        </Field>
        <Field
          label="CCI"
          span={4}
          hint="El Código de Cuenta Interbancario: 20 dígitos, sin guiones."
          ejemplo="00221500123456789014"
          afecta="Es el que sirve para transferirle desde otro banco."
          error={cciMal}
        >
          <input
            type="text"
            inputMode="numeric"
            className={`${I} font-mono ${cciMal ? "border-[var(--data-error-500)]" : ""}`}
            value={b.cuentaCci ?? ""}
            onChange={(e) => set({ cuentaCci: e.target.value })}
          />
        </Field>
        <div className="sm:col-span-12 -mt-1 flex flex-wrap items-center gap-1.5">
          <BotonCopiar valor={b.cuentaNumero} cual="el N° de cuenta" copiado={copiado} onCopiar={copiar} />
          <BotonCopiar valor={b.cuentaCci} cual="el CCI" copiado={copiado} onCopiar={copiar} />
          <BotonCopiar valor={b.docNumero} cual="el documento" copiado={copiado} onCopiar={copiar} />
          <span className="text-sm text-[var(--text-tertiary)]">
            {copiado ? `Copiado ${copiado}` : "Copiar para pegar en el banco o en un WhatsApp"}
          </span>
        </div>
        <Field
          label="La cuenta está a nombre de"
          span={12}
          hint="Sólo si no coincide con el titular de la ficha: pasa cuando la comunidad cobra en la cuenta de su jefe."
          ejemplo="Juan Pérez Shahuano (jefe de la comunidad)"
          afecta="Sale en la constancia de pago, para que se sepa a quién se le transfirió."
        >
          <input type="text" className={I} value={b.cuentaTitular ?? ""} onChange={(e) => set({ cuentaTitular: e.target.value })} />
        </Field>

        {/* Contado o crédito: es lo que decide si una compra deja una fecha de
            pago que vigilar. Sin pactar NO es contado — asumirlo haría
            aparecer deuda cero donde en realidad no se sabe. */}
        <Field
          label="Condición de pago"
          span={4}
          hint={textoCondicionPago(b.condicionPago, b.diasCredito)}
          ejemplo="Crédito a 30 días"
          afecta="El crédito deja una fecha de pago que el sistema vigila. Sin pactar no se supone contado."
        >
          <select
            className={I}
            value={b.condicionPago ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              set({
                condicionPago: v ? (v as (typeof CONDICIONES_PAGO)[number]) : null,
                ...(v === "credito" ? {} : { diasCredito: null }),
              });
            }}
          >
            <option value="">Sin pactar</option>
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
          </select>
        </Field>
        {b.condicionPago === "credito" && (
          <Field label="Días de crédito" span={4} hint="Los días que se pactaron para pagar." ejemplo="30" afecta="De ahí sale la fecha en que vence cada cargo.">
            <input
              type="number"
              min={0}
              max={365}
              inputMode="numeric"
              className={`${I} font-mono tabular-nums`}
              value={b.diasCredito ?? ""}
              onChange={(e) => set({ diasCredito: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </Field>
        )}
        <Field
          label="Correo de cobranza"
          span={b.condicionPago === "credito" ? 4 : 8}
          hint="Dónde mandar la factura y la liquidación, si no es el correo general."
          ejemplo="cobranzas@maderasucayali.pe"
          afecta="Las facturas y liquidaciones se le envían a este correo."
        >
          <input type="email" className={I} value={b.emailCobranza ?? ""} onChange={(e) => set({ emailCobranza: e.target.value })} />
        </Field>
      </Seccion>

      {/* Con quién está vinculada (ADR-430): otra parte o un permiso, y el
          saldo de cada uno en su libreta. */}
      <Seccion title="Vínculos" hint="Con otra parte del Directorio o con un permiso">
        <CtpParteVinculos
          parteId={b.id ?? null}
          existentes={existentes}
          saldo={saldo.saldo}
          pendientes={form.vinculosPendientes}
          onPendientes={form.setVinculosPendientes}
          onCambio={() => void saldo.recargar()}
        />
      </Seccion>
    </>
  );
}

function BotonCopiar({ valor, cual, copiado, onCopiar }: { valor?: string | null; cual: string; copiado: string | null; onCopiar: (v: string, c: string) => void }) {
  const limpio = (valor ?? "").trim();
  if (!limpio) return null;
  const yaCopio = copiado === cual;
  return (
    <button
      type="button"
      onClick={() => onCopiar(limpio, cual)}
      aria-label={`Copiar ${cual}`}
      title={yaCopio ? "Copiado" : `Copiar ${cual}`}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition-colors ${
        yaCopio
          ? "border-[var(--data-success-500)] text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
          : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
      }`}
    >
      {yaCopio ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
