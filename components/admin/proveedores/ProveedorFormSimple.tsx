'use client';

import { Check, Loader2 } from "@buleje/design-system/icons";
import { cn } from '@/lib/utils';
import { Field } from '@/components/admin/shared/Field';
import CampoDiasEntrega from './CampoDiasEntrega';
import { inputCls, labelCls, type SupplierFormData } from './proveedor-form-datos';
import type { RucLookup } from './use-proveedor-form';

/** Formato «Simple»: lo justo para dar de alta un proveedor (con RUC que autocompleta SUNAT). */
export default function ProveedorFormSimple({ form, set, rucLookup, setRucLookup, handleRucLookup }: {
  form: SupplierFormData;
  set: <K extends keyof SupplierFormData>(key: K, value: SupplierFormData[K]) => void;
  rucLookup: RucLookup;
  setRucLookup: (r: RucLookup) => void;
  handleRucLookup: (ruc: string) => Promise<void>;
}) {
  return (
    <>
    {/* Tipo persona toggle */}
    <div>
      <span className={labelCls}>Tipo persona</span>
      <div className="flex gap-2">
        {(['natural', 'juridica'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => set('tipoPersona', t)}
            className={cn(
              "flex-1 min-h-10 rounded-xl text-sm font-semibold border transition-colors",
              form.tipoPersona === t
                ? "bg-primary text-white border-primary"
                : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] "
            )}
          >
            {t === 'natural' ? 'Natural' : 'Juridica'}
          </button>
        ))}
      </div>
    </div>

    {/* Nombre / Razon Social */}
    <Field
      label={form.tipoPersona === 'juridica' ? 'Razon Social *' : 'Nombre completo *'}
      labelClassName={labelCls}
    >
      <input
        value={form.tipoPersona === 'juridica' ? form.razonSocial : form.name}
        onChange={e => form.tipoPersona === 'juridica' ? set('razonSocial', e.target.value) : set('name', e.target.value)}
        placeholder={form.tipoPersona === 'juridica' ? 'Distribuidora Lima S.A.C.' : 'Nombre del proveedor'}
        className={inputCls}
      />
    </Field>

    {/* RUC + Teléfono */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field
        label={<>RUC <span className="text-[var(--text-tertiary)] font-normal text-xs">(autocompleta SUNAT)</span></>}
        labelClassName={labelCls}
      >
        {(id) => (
          <>
            <div className="relative">
              <input
                id={id}
                value={form.documento}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "").slice(0, 11);
                  set('documento', next);
                  if (next.length === 11) void handleRucLookup(next);
                  else setRucLookup({ status: "idle" });
                }}
                placeholder="20xxxxxxxxx"
                maxLength={11}
                className={cn(inputCls, "font-mono pr-9")}
              />
              {rucLookup.status === "loading" && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
              )}
              {rucLookup.status === "ok" && (
                <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--data-success-500)]" />
              )}
            </div>
            {rucLookup.status !== "idle" && rucLookup.msg && (
              <p className={cn(
                "text-xs mt-1 font-medium",
                rucLookup.status === "ok"       ? "text-[var(--data-success-500)]" :
                rucLookup.status === "notfound" ? "text-[var(--data-warning-500)]" :
                rucLookup.status === "loading"  ? "text-[var(--text-tertiary)]" :
                "text-[var(--data-error-500)]"
              )}>
                {rucLookup.status === "loading" ? "Consultando SUNAT..." : rucLookup.msg}
              </p>
            )}
          </>
        )}
      </Field>
      <Field label="Teléfono" labelClassName={labelCls}>
        <input
          value={form.phone}
          onChange={e => set('phone', e.target.value)}
          placeholder="987 654 321"
          className={inputCls}
        />
      </Field>
    </div>

    {/* Direccion */}
    <Field label="Direccion" labelClassName={labelCls}>
      <textarea
        value={form.direccion}
        onChange={e => set('direccion', e.target.value)}
        placeholder="Av. Colonial 1234, Lima"
        rows={2}
        className={cn(inputCls, "resize-none")}
      />
    </Field>

      {/* Días de entrega: de acá sale cuándo pedir en Sugerencias (ADR-376). */}
      <CampoDiasEntrega valor={form.leadTimeDias} onCambio={(v) => set('leadTimeDias', v)} />
    </>
  );
}
