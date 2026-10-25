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
        <Field label="Banco" span={4}>
          <input type="text" className={I} value={b.banco ?? ""} onChange={(e) => set({ banco: e.target.value })} placeholder="BCP, Interbank…" />
        </Field>
        <Field label="N° de cuenta" span={4}>
          <input type="text" className={`${I} font-mono`} value={b.cuentaNumero ?? ""} onChange={(e) => set({ cuentaNumero: e.target.value })} />
        </Field>
        <Field label="CCI" span={4} hint={cciMal ?? "20 dígitos — es el que sirve para transferir entre bancos distintos"}>
          <input
            type="text"
            inputMode="numeric"
            aria-invalid={cciMal ? true : undefined}
            className={`${I} font-mono ${cciMal ? "border-[var(--data-error-500)]" : ""}`}
            value={b.cuentaCci ?? ""}
            onChange={(e) => set({ cuentaCci: e.target.value })}
          />
        </Field>
        <div className="sm:col-span-12 -mt-1 flex flex-wrap items-center gap-1.5">
          <BotonCopiar valor={b.cuentaNumero} cual="el N° de cuenta" copiado={copiado} onCopiar={copiar} />
          <BotonCopiar valor={b.cuentaCci} cual="el CCI" copiado={copiado} onCopiar={copiar} />
          <BotonCopiar valor={b.docNumero} cual="el documento" copiado={copiado} onCopiar={copiar} />
          <span className="text-xs text-[var(--text-tertiary)]">
            {copiado ? `Copiado ${copiado}` : "Copiar para pegar en el banco o en un WhatsApp"}
          </span>
        </div>
        <Field label="La cuenta está a nombre de" span={12} hint="Sólo si no coincide con el titular de la ficha (pasa: la comunidad cobra en la cuenta de su jefe)">
          <input type="text" className={I} value={b.cuentaTitular ?? ""} onChange={(e) => set({ cuentaTitular: e.target.value })} />
        </Field>

        {/* Contado o crédito: es lo que decide si una compra deja una fecha de
            pago que vigilar. Sin pactar NO es contado — asumirlo haría
            aparecer deuda cero donde en realidad no se sabe. */}
        <Field label="Condición de pago" span={4} hint={textoCondicionPago(b.condicionPago, b.diasCredito)}>
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
          <Field label="Días de crédito" span={4} hint="Los que se pactaron: de ahí sale el vencimiento">
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
          hint="Dónde mandar factura y liquidación, si no es el correo general"
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
