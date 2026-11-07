'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Loader2, Search } from "@buleje/design-system/icons";
import { cn } from '@/lib/utils';
import { Field } from '@/components/admin/shared/Field';
import { DEPARTAMENTOS, getDistritos, getProvincias, inputCls, labelCls, selectCls, type CustomerFormData, type SetCampo } from './cliente-form-datos';
import Section from './ClienteFormSeccion';
import ClienteFormMasDatos from './ClienteFormMasDatos';

/** Formato «Completo» del alta de cliente: 6 secciones plegables (4-6 en `ClienteFormMasDatos`). */
export default function ClienteFormCompleto({ form, set, setForm, isEdit, dniLoading, dniMsg, setDniMsg, buscarDni }: {
  form: CustomerFormData;
  set: SetCampo;
  setForm: Dispatch<SetStateAction<CustomerFormData>>;
  isEdit: boolean;
  /** Buscar el nombre en RENIEC por DNI (y su aviso debajo del campo). */
  dniLoading: boolean;
  dniMsg: string;
  setDniMsg: (m: string) => void;
  buscarDni: (dni: string) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Seccion 1: Identificacion */}
      <Section title="1. Identificacion" defaultOpen={true}>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Tipo documento" labelClassName={labelCls}>
            <select value={form.tipoDocumento} onChange={e => set('tipoDocumento', e.target.value)} className={selectCls}>
              <option value="DNI">DNI</option>
              <option value="RUC">RUC</option>
              <option value="CE">CE</option>
              <option value="PASAPORTE">Pasaporte</option>
            </select>
          </Field>
          <Field label="Número documento" labelClassName={labelCls}>
            {(id) => (
              <>
                <div className="flex gap-1.5">
                  <input
                    id={id}
                    value={form.documento}
                    onChange={e => { set('documento', e.target.value); setDniMsg(''); }}
                    placeholder="12345678"
                    className={cn(inputCls, "font-mono flex-1")}
                  />
                  {form.tipoDocumento === 'DNI' && (
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
        </div>
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
        {form.tipoPersona === 'juridica' && (
          <Field label="Nombre de contacto" labelClassName={labelCls}>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre del representante" className={inputCls} />
          </Field>
        )}
        <Field label="Estado" labelClassName={labelCls}>
          <select value={form.estado} onChange={e => set('estado', e.target.value)} className={selectCls}>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
            <option value="bloqueado">Bloqueado</option>
          </select>
        </Field>
      </Section>

      {/* Seccion 2: Contacto */}
      <Section title="2. Contacto" defaultOpen={true}>
        <Field label="WhatsApp principal * (teléfono)" labelClassName={labelCls}>
          <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="987 654 321" className={inputCls} disabled={isEdit} />
        </Field>
        <Field label="WhatsApp secundario" labelClassName={labelCls}>
          <input value={form.whatsappSecundario} onChange={e => set('whatsappSecundario', e.target.value)} placeholder="Otro número" className={inputCls} />
        </Field>
        <Field label="Email" labelClassName={labelCls}>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="cliente@email.com" className={inputCls} />
        </Field>
      </Section>

      {/* Seccion 3: Ubicacion */}
      <Section title="3. Ubicacion">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Departamento" labelClassName={labelCls}>
            <select
              value={form.departamento}
              onChange={e => {
                const d = e.target.value;
                const provs = getProvincias(d);
                const p = provs[0] ?? '';
                const dists = getDistritos(d, p);
                set('departamento', d);
                setForm(prev => ({ ...prev, departamento: d, provincia: p, distrito: dists[0] ?? '' }));
              }}
              className={selectCls}
            >
              <option value="">Seleccionar</option>
              {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d.replace('_', ' de ')}</option>)}
            </select>
          </Field>
          <Field label="Provincia" labelClassName={labelCls}>
            <select
              value={form.provincia}
              onChange={e => {
                const p = e.target.value;
                const dists = getDistritos(form.departamento, p);
                setForm(prev => ({ ...prev, provincia: p, distrito: dists[0] ?? '' }));
              }}
              className={selectCls}
            >
              <option value="">Seleccionar</option>
              {getProvincias(form.departamento).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Distrito" labelClassName={labelCls}>
            <select value={form.distrito} onChange={e => set('distrito', e.target.value)} className={selectCls}>
              <option value="">Seleccionar</option>
              {getDistritos(form.departamento, form.provincia).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Dirección" labelClassName={labelCls}>
          <textarea
            value={form.direccion}
            onChange={e => set('direccion', e.target.value)}
            placeholder="Jr. Ucayali 123"
            rows={2}
            className={cn(inputCls, "resize-none")}
          />
        </Field>
      </Section>

      <ClienteFormMasDatos form={form} set={set} />
    </div>
  );
}
