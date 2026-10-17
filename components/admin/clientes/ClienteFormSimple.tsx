'use client';

import { Loader2, Search } from "@buleje/design-system/icons";
import { cn } from '@/lib/utils';
import { Field } from '@/components/admin/shared/Field';
import { inputCls, labelCls, type CustomerFormData, type SetCampo } from './cliente-form-datos';

/** Formato «Simple» del alta de cliente: tipo, nombre, documento, teléfono y dirección. */
export default function ClienteFormSimple({ form, set, isEdit, dniLoading, dniMsg, setDniMsg, buscarDni }: {
  form: CustomerFormData;
  set: SetCampo;
  isEdit: boolean;
  /** Buscar el nombre en RENIEC por DNI (y su aviso debajo del campo). */
  dniLoading: boolean;
  dniMsg: string;
  setDniMsg: (m: string) => void;
  buscarDni: (dni: string) => void;
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
                  : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] "
              )}
            >
              {t === 'natural' ? 'Natural' : 'Jurídica'}
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
          placeholder={form.tipoPersona === 'juridica' ? 'Distribuidora Lima S.A.C.' : 'Juan Pérez'}
          className={inputCls}
        />
      </Field>

      {/* DNI/RUC + Teléfono */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={form.tipoPersona === 'juridica' ? 'RUC' : 'DNI'} labelClassName={labelCls}>
          {(id) => (
            <>
              <div className="flex gap-1.5">
                <input
                  id={id}
                  value={form.documento}
                  onChange={e => { set('documento', e.target.value); setDniMsg(''); }}
                  placeholder={form.tipoPersona === 'juridica' ? '20xxxxxxxxx' : '12345678'}
                  maxLength={form.tipoPersona === 'juridica' ? 11 : 8}
                  className={cn(inputCls, "font-mono flex-1")}
                />
                {form.tipoPersona === 'natural' && form.tipoDocumento !== 'RUC' && (
                  <button
                    type="button"
                    onClick={() => buscarDni(form.documento)}
                    disabled={dniLoading}
                    title="Buscar nombre en RENIEC"
                    className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0 disabled:opacity-50"
                  >
                    {dniLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-secondary)] dark:text-muted" />
                    ) : (
                      <Search className="h-3.5 w-3.5 text-primary" />
                    )}
                  </button>
                )}
              </div>
              {dniMsg && (
                <p className={cn(
                  "text-xs mt-1",
                  dniMsg.includes('completado') ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                )}>{dniMsg}</p>
              )}
            </>
          )}
        </Field>
        <Field label="Teléfono *" labelClassName={labelCls}>
          <input
            value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="987 654 321"
            className={inputCls}
            disabled={isEdit}
          />
        </Field>
      </div>

      {/* Direccion */}
      <Field label="Dirección" labelClassName={labelCls}>
        <textarea
          value={form.direccion}
          onChange={e => set('direccion', e.target.value)}
          placeholder="Jr. Ucayali 123, Pucallpa"
          rows={2}
          className={cn(inputCls, "resize-none")}
        />
      </Field>
    </>
  );
}
