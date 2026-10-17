'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Loader2 } from "@buleje/design-system/icons";
import AdminModal from '@/components/admin/shared/AdminModal';
import { csrfHeaders } from "@/lib/csrf-client";
import { ClienteYaExiste, type ClienteExistente } from "./ClienteYaExiste";
import { EMPTY_FORM, formDesdeCliente, type CustomerFormData } from './cliente-form-datos';
import ClienteFormFormato from './ClienteFormFormato';
import ClienteFormSimple from './ClienteFormSimple';
import ClienteFormCompleto from './ClienteFormCompleto';

// Ubigeo, tipos, formulario vacío y clases de campo: `cliente-form-datos.ts`.
// Formatos: `ClienteFormFormato` (botones), `ClienteFormSimple`, `ClienteFormCompleto` (+ `ClienteFormMasDatos`).

/** Lo que se acaba de guardar, para que la pantalla que abrió el alta lo use sin pedirlo otra vez. */
export type ClienteGuardado = { name: string; phone: string; documento?: string; tipoDocumento?: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (guardado?: ClienteGuardado) => void;
  customer?: Record<string, unknown> | null;
  initialFormat?: 'simple' | 'completo';
  /** Precarga el teléfono en un alta nueva — para no hacer retipear lo que ya se escribió en otra pantalla. */
  initialPhone?: string;
  /** Precarga el nombre en un alta nueva (la cotización ya lo tenía escrito). */
  initialName?: string;
  /** Precarga el RUC (11 dígitos → empresa) o DNI (8) ya escrito en otra pantalla. */
  initialDocumento?: string;
  /** Se abre desde otra ventana (p. ej. «Nueva cotización»): va encima de ella. */
  aboveModals?: boolean;
};

// ── Component ──────────────────────────────────────────────────────────────

export default function ClienteFormModal({ isOpen, onClose, onSaved, customer, initialFormat, initialPhone, initialName, initialDocumento, aboveModals }: Props) {
  const [format, setFormat] = useState<'simple' | 'completo'>(() => {
    if (initialFormat) return initialFormat;
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('cliente-form-format') as 'simple' | 'completo') ?? 'simple';
    }
    return 'simple';
  });
  const [form, setForm] = useState<CustomerFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // 409 del alta: el celular ya es de un cliente tuyo (el POST ya no lo pisa).
  const [yaExiste, setYaExiste] = useState<{ existente: ClienteExistente; cuerpo: Record<string, unknown> } | null>(null);
  const [dniLoading, setDniLoading] = useState(false);
  const [dniMsg, setDniMsg] = useState('');
  const isEdit = !!customer;

  // Populate form when editing
  useEffect(() => {
    if (customer) {
      setForm(formDesdeCliente(customer));
    } else {
      const doc = (initialDocumento ?? '').replace(/\D/g, '');
      const empresa = doc.length === 11;
      setForm({
        ...EMPTY_FORM,
        phone: initialPhone ?? '',
        name: initialName ?? '',
        ...(empresa ? { tipoPersona: 'juridica', tipoDocumento: 'RUC', razonSocial: initialName ?? '' } : {}),
        ...(doc.length === 8 || empresa ? { documento: doc } : {}),
      });
    }
  }, [customer, initialPhone, initialName, initialDocumento]);

  const changeFormat = useCallback((f: 'simple' | 'completo') => {
    setFormat(f);
    if (typeof window !== 'undefined') localStorage.setItem('cliente-form-format', f);
  }, []);

  const set = useCallback(<K extends keyof CustomerFormData>(key: K, value: CustomerFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  // Buscar nombre en RENIEC por DNI
  const buscarDni = useCallback(async (dni: string) => {
    const clean = dni.replace(/\D/g, '');
    if (clean.length !== 8) {
      setDniMsg('El DNI debe tener 8 dígitos');
      return;
    }
    setDniLoading(true);
    setDniMsg('');
    try {
      const res = await fetch(`/api/reniec/lookup?dni=${clean}`);
      const data = await res.json() as { nombreCompleto?: string; error?: string; _mock?: boolean };
      if (!res.ok || data.error) {
        setDniMsg(data.error ?? 'No se pudo consultar');
        return;
      }
      if (data.nombreCompleto) {
        set('name', data.nombreCompleto);
        setDniMsg(data._mock ? 'Dato de prueba — configura RENIEC_API_URL para datos reales' : 'Nombre completado automaticamente');
      }
    } catch {
      setDniMsg('No se pudo consultar');
    } finally {
      setDniLoading(false);
    }
  }, [set]);

  // Otro celular = otra búsqueda: el aviso de «ya existe» deja de valer.
  useEffect(() => { setYaExiste(null); }, [form.phone, isOpen]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setYaExiste(null);

    // Validation
    const nombre = form.tipoPersona === 'juridica' ? form.razonSocial : form.name;
    if (!nombre.trim()) {
      setError('El nombre es requerido');
      return;
    }
    if (!form.phone.trim()) {
      setError('El teléfono es requerido');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.tipoPersona === 'juridica' ? form.razonSocial || form.name : form.name,
        phone: form.phone.replace(/\D/g, ''),
        location: form.direccion || '',
        tipoPersona: form.tipoPersona || null,
        tipoDocumento: form.tipoDocumento || null,
        documento: form.documento || null,
        razonSocial: form.razonSocial || null,
        estado: form.estado || 'activo',
        whatsappSecundario: form.whatsappSecundario || null,
        email: form.email || null,
        departamento: form.departamento || null,
        provincia: form.provincia || null,
        distrito: form.distrito || null,
        direccion: form.direccion || null,
        categoria: form.categoria || null,
        canal: form.canal || null,
        listaPrecio: form.listaPrecio || null,
        vendedorAsignado: form.vendedorAsignado || null,
        creditLimit: form.creditoActivo ? form.creditLimit : 0,
        diasCredito: form.creditoActivo ? form.diasCredito : 0,
        alertasWhatsapp: form.alertasWhatsapp,
        fechaNacimiento: form.fechaNacimiento || null,
        genero: form.genero || null,
        comoLlego: form.comoLlego || null,
        observaciones: form.observaciones || null,
      };

      if (isEdit) {
        // PATCH existing customer
        const res = await fetch(`/api/customers/${encodeURIComponent(customer!.phone as string)}`, {
          method: 'PATCH',
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Error al actualizar');
        }
      } else {
        // POST new customer
        const res = await fetch('/api/customers', {
          method: 'POST',
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 409 && data.motivo === 'existe' && data.existente) {
            setYaExiste({ existente: data.existente as ClienteExistente, cuerpo: body });
            return;
          }
          throw new Error(data.error ?? 'Error al crear');
        }
      }
      onSaved({
        name: body.name as string,
        phone: body.phone as string,
        ...(form.documento ? { documento: form.documento, tipoDocumento: form.tipoDocumento } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal
      open={isOpen}
      onClose={onClose}
      title={isEdit ? 'Editar cliente' : 'Nuevo cliente'}
      variant="wide"
      aboveModals={aboveModals}
    >
      <div>
        {/* Format toggle */}
        <ClienteFormFormato format={format} changeFormat={changeFormat} />

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* ── SIMPLE FORMAT ── */}
          {format === 'simple' && (
            <ClienteFormSimple
              form={form}
              set={set}
              isEdit={isEdit}
              dniLoading={dniLoading}
              dniMsg={dniMsg}
              setDniMsg={setDniMsg}
              buscarDni={buscarDni}
            />
          )}

          {/* ── COMPLETE FORMAT ── */}
          {format === 'completo' && (
            <ClienteFormCompleto
              form={form}
              set={set}
              setForm={setForm}
              isEdit={isEdit}
              dniLoading={dniLoading}
              dniMsg={dniMsg}
              setDniMsg={setDniMsg}
              buscarDni={buscarDni}
            />
          )}

          {yaExiste && (
            <ClienteYaExiste
              existente={yaExiste.existente}
              cuerpo={yaExiste.cuerpo}
              onListo={(guardado) => { onSaved(guardado); onClose(); }}
              onError={setError}
            />
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold bg-[var(--data-error-50)] dark:bg-red-950/20 px-3 py-2 rounded-lg">{error}</p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-11 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Guardando...' : isEdit ? 'Guardar cliente' : format === 'simple' ? 'Crear cliente' : 'Guardar cliente'}
            </button>
          </div>
        </form>
      </div>
    </AdminModal>
  );
}
