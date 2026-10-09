'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { ChevronDown, ChevronUp } from "@buleje/design-system/icons";
import { cn } from '@/lib/utils';
import { Field } from '@/components/admin/shared/Field';
import CampoDiasEntrega from './CampoDiasEntrega';
import { DEPARTAMENTOS, getDistritos, getProvincias, inputCls, labelCls, selectCls, type SupplierFormData } from './proveedor-form-datos';

// ── Accordion Section ──────────────────────────────────────────────────────

// ── Accordion Section ──────────────────────────────────────────────────────

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--surface-sunken)] text-sm font-bold text-[var(--text-primary)] dark:text-foreground hover:bg-[var(--rule-soft)] transition-colors"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

/** Formato «Completo»: la ficha entera del proveedor en cinco secciones plegables. */
export default function ProveedorFormCompleto({ form, set, setForm }: {
  form: SupplierFormData;
  set: <K extends keyof SupplierFormData>(key: K, value: SupplierFormData[K]) => void;
  setForm: Dispatch<SetStateAction<SupplierFormData>>;
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
                    : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] "
                )}
              >
                {t === 'natural' ? 'Natural' : 'Juridica'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Tipo documento" labelClassName={labelCls}>
            <select value={form.tipoDocumento} onChange={e => set('tipoDocumento', e.target.value)} className={selectCls}>
              <option value="RUC">RUC</option>
              <option value="DNI">DNI</option>
              <option value="CE">CE</option>
              <option value="PASAPORTE">Pasaporte</option>
            </select>
          </Field>
          <Field label="Número documento" labelClassName={labelCls}>
            <input value={form.documento} onChange={e => set('documento', e.target.value)} placeholder="20xxxxxxxxx" className={cn(inputCls, "font-mono")} />
          </Field>
        </div>
        <Field
          label={form.tipoPersona === 'juridica' ? 'Razon Social *' : 'Nombre *'}
          labelClassName={labelCls}
        >
          <input
            value={form.tipoPersona === 'juridica' ? form.razonSocial : form.name}
            onChange={e => form.tipoPersona === 'juridica' ? set('razonSocial', e.target.value) : set('name', e.target.value)}
            placeholder={form.tipoPersona === 'juridica' ? 'Distribuidora Lima S.A.C.' : 'Nombre del proveedor'}
            className={inputCls}
          />
        </Field>
        {form.tipoPersona === 'juridica' && (
          <Field label="Nombre comercial" labelClassName={labelCls}>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre corto o comercial" className={inputCls} />
          </Field>
        )}
        <Field label="Estado" labelClassName={labelCls}>
          <select value={form.estado} onChange={e => set('estado', e.target.value)} className={selectCls}>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </Field>
      </Section>

      {/* Seccion 2: Contacto */}
      <Section title="2. Contacto" defaultOpen={true}>
        <Field label="Teléfono" labelClassName={labelCls}>
          <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="987 654 321" className={inputCls} />
        </Field>
        <Field label="WhatsApp secundario" labelClassName={labelCls}>
          <input value={form.whatsappSecundario} onChange={e => set('whatsappSecundario', e.target.value)} placeholder="Otro número" className={inputCls} />
        </Field>
        <Field label="Email" labelClassName={labelCls}>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="ventas@empresa.com" className={inputCls} />
        </Field>
        <Field label="Persona de contacto" labelClassName={labelCls}>
          <input value={form.personaContacto} onChange={e => set('personaContacto', e.target.value)} placeholder="Nombre del contacto directo" className={inputCls} />
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
        <Field label="Direccion" labelClassName={labelCls}>
          <textarea
            value={form.direccion}
            onChange={e => set('direccion', e.target.value)}
            placeholder="Av. Colonial 1234"
            rows={2}
            className={cn(inputCls, "resize-none")}
          />
        </Field>
      </Section>

      {/* Seccion 4: Comercial */}
      <Section title="4. Comercial">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Categoria" labelClassName={labelCls}>
            <select value={form.categoria} onChange={e => set('categoria', e.target.value)} className={selectCls}>
              <option value="">Sin asignar</option>
              <option value="mayorista">Mayorista</option>
              <option value="fabricante">Fabricante</option>
              <option value="distribuidor">Distribuidor</option>
              <option value="importador">Importador</option>
            </select>
          </Field>
          <Field label="Condicion de pago" labelClassName={labelCls}>
            <select value={form.condicionPago} onChange={e => set('condicionPago', e.target.value)} className={selectCls}>
              <option value="contado">Contado</option>
              <option value="credito_7">Credito 7 dias</option>
              <option value="credito_15">Credito 15 dias</option>
              <option value="credito_30">Credito 30 dias</option>
            </select>
          </Field>
          <Field label="Dias de credito" labelClassName={labelCls}>
            <input
              type="number"
              min={0}
              value={form.diasCredito}
              onChange={e => set('diasCredito', parseInt(e.target.value) || 0)}
              className={inputCls}
            />
          </Field>
          <CampoDiasEntrega valor={form.leadTimeDias} onCambio={(v) => set('leadTimeDias', v)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Cuenta bancaria" labelClassName={labelCls}>
            <input value={form.cuentaBancaria} onChange={e => set('cuentaBancaria', e.target.value)} placeholder="Nro. de cuenta" className={cn(inputCls, "font-mono")} />
          </Field>
          <Field label="Banco" labelClassName={labelCls}>
            <select value={form.banco} onChange={e => set('banco', e.target.value)} className={selectCls}>
              <option value="">Seleccionar</option>
              <option value="BCP">BCP</option>
              <option value="Interbank">Interbank</option>
              <option value="BBVA">BBVA</option>
              <option value="Scotiabank">Scotiabank</option>
              <option value="BanBif">BanBif</option>
              <option value="Otro">Otro</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* Seccion 5: Adicionales */}
      <Section title="5. Adicionales">
        <Field label="Observaciones" labelClassName={labelCls}>
          <textarea
            value={form.observaciones}
            onChange={e => set('observaciones', e.target.value)}
            placeholder="Notas adicionales sobre el proveedor..."
            rows={3}
            className={cn(inputCls, "resize-none")}
          />
        </Field>
      </Section>
    </div>
  );
}
