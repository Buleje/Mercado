'use client';

import { cn } from '@/lib/utils';
import { Field } from '@/components/admin/shared/Field';
import { inputCls, labelCls, selectCls, type CustomerFormData, type SetCampo } from './cliente-form-datos';
import Section from './ClienteFormSeccion';

/** Secciones 4-6 del formato «Completo»: comercial, fiado digital y adicionales. */
export default function ClienteFormMasDatos({ form, set }: { form: CustomerFormData; set: SetCampo }) {
  return (
    <>
      {/* Seccion 4: Comercial */}
      <Section title="4. Comercial">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Categoria" labelClassName={labelCls}>
            <select value={form.categoria} onChange={e => set('categoria', e.target.value)} className={selectCls}>
              <option value="">Sin asignar</option>
              <option value="mayorista">Mayorista</option>
              <option value="minorista">Minorista</option>
              <option value="restaurante">Restaurante</option>
              <option value="tienda">Tienda</option>
              <option value="otro">Otro</option>
            </select>
          </Field>
          <Field label="Canal" labelClassName={labelCls}>
            <select value={form.canal} onChange={e => set('canal', e.target.value)} className={selectCls}>
              <option value="presencial">Presencial</option>
              <option value="delivery">Delivery</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="web">Web</option>
            </select>
          </Field>
          <Field label="Lista de precios" labelClassName={labelCls}>
            <select value={form.listaPrecio} onChange={e => set('listaPrecio', e.target.value)} className={selectCls}>
              <option value="general">General</option>
              <option value="mayorista">Mayorista</option>
              <option value="especial">Especial</option>
              {/* Se marca en Clientes › Revendedoras (guarda la fecha de alta y los meses sin fiado);
                  acá sólo se muestra para que una revendedora no aparezca como «General». */}
              <option value="revendedora" disabled>Revendedora (se marca en Clientes › Revendedoras)</option>
            </select>
          </Field>
          <Field label="Vendedor asignado" labelClassName={labelCls}>
            <input value={form.vendedorAsignado} onChange={e => set('vendedorAsignado', e.target.value)} placeholder="Nombre del vendedor" className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* Seccion 5: Fiado Digital */}
      <Section title="5. Fiado Digital">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Activar credito</span>
          <button
            type="button"
            aria-label="Activar credito"
            aria-pressed={form.creditoActivo}
            onClick={() => set('creditoActivo', !form.creditoActivo)}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              form.creditoActivo ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
            )}
          >
            <span className={cn(
              "inline-block h-4 w-4 rounded-full bg-[var(--surface-raised)] transition-transform",
              form.creditoActivo ? "translate-x-6" : "translate-x-1"
            )} />
          </button>
        </div>
        {form.creditoActivo && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Limite de credito (S/)" labelClassName={labelCls}>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.creditLimit}
                onChange={e => set('creditLimit', parseFloat(e.target.value) || 0)}
                className={inputCls}
              />
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
            <div className="col-span-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted">Alertas WhatsApp (recordatorios)</span>
              <button
                type="button"
                aria-label="Alertas WhatsApp (recordatorios)"
                aria-pressed={form.alertasWhatsapp}
                onClick={() => set('alertasWhatsapp', !form.alertasWhatsapp)}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  form.alertasWhatsapp ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 rounded-full bg-[var(--surface-raised)] transition-transform",
                  form.alertasWhatsapp ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* Seccion 6: Adicionales */}
      <Section title="6. Adicionales">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Fecha de nacimiento" labelClassName={labelCls}>
            <input type="date" value={form.fechaNacimiento} onChange={e => set('fechaNacimiento', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Genero" labelClassName={labelCls}>
            <select value={form.genero} onChange={e => set('genero', e.target.value)} className={selectCls}>
              <option value="">No especificar</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="otro">Otro</option>
            </select>
          </Field>
          <Field label="Como llego?" labelClassName={labelCls}>
            <select value={form.comoLlego} onChange={e => set('comoLlego', e.target.value)} className={selectCls}>
              <option value="">No especificar</option>
              <option value="referido">Referido</option>
              <option value="redes">Redes sociales</option>
              <option value="local">Paso por el local</option>
              <option value="otro">Otro</option>
            </select>
          </Field>
        </div>
        <Field label="Observaciones" labelClassName={labelCls}>
          <textarea
            value={form.observaciones}
            onChange={e => set('observaciones', e.target.value)}
            placeholder="Notas adicionales sobre el cliente..."
            rows={3}
            className={cn(inputCls, "resize-none")}
          />
        </Field>
      </Section>
    </>
  );
}
