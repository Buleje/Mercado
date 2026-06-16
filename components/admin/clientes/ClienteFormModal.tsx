'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Zap, ClipboardList, ChevronDown, ChevronUp, Loader2, Search } from "@buleje/design-system/icons";
import { cn } from '@/lib/utils';
import AdminModal from '@/components/admin/shared/AdminModal';
import { Field } from '@/components/admin/shared/Field';
import { csrfHeaders } from "@/lib/csrf-client";

// ── Ubigeo data (principales departamentos de Peru) ─────────────────────────

const UBIGEO: Record<string, Record<string, string[]>> = {
  Ucayali: {
    'Coronel Portillo': ['Callería', 'Yarinacocha', 'Manantay', 'Nueva Requena', 'Campo Verde', 'Masisea', 'Iparía'],
    Atalaya: ['Raymondi', 'Sepahua', 'Tahuanía', 'Yurúa'],
    'Padre Abad': ['Padre Abad', 'Irazola', 'Curimaná', 'Neshuya', 'Alexander Von Humboldt'],
    Purús: ['Purús'],
  },
  Lima: {
    Lima: ['Lima', 'Miraflores', 'San Isidro', 'Surco', 'San Borja', 'La Molina', 'Ate', 'San Juan de Lurigancho', 'Los Olivos', 'Comas', 'Villa El Salvador', 'Callao'],
    Huaral: ['Huaral', 'Chancay', 'Aucallama'],
    Cañete: ['San Vicente de Cañete', 'Imperial', 'Lunahuaná'],
  },
  Loreto: {
    Maynas: ['Iquitos', 'San Juan Bautista', 'Punchana', 'Belén'],
    'Alto Amazonas': ['Yurimaguas', 'Lagunas'],
    'Mariscal Ramón Castilla': ['Ramón Castilla'],
    Requena: ['Requena'],
  },
  'San Martín': {
    'San Martín': ['Tarapoto', 'Morales', 'La Banda de Shilcayo'],
    Moyobamba: ['Moyobamba'],
    Rioja: ['Rioja', 'Nueva Cajamarca'],
    Lamas: ['Lamas', 'Tabalosos'],
  },
  Junín: {
    Huancayo: ['Huancayo', 'El Tambo', 'Chilca'],
    Satipo: ['Satipo', 'Mazamari', 'Pangoa'],
    Chanchamayo: ['Chanchamayo', 'San Ramón', 'La Merced'],
  },
  Huánuco: {
    Huánuco: ['Huánuco', 'Amarilis', 'Pillco Marca'],
    'Leoncio Prado': ['Rupa-Rupa', 'José Crespo y Castillo', 'Daniel Alomía Robles'],
  },
  Arequipa: {
    Arequipa: ['Arequipa', 'Cayma', 'Cerro Colorado', 'Yanahuara', 'José Luis Bustamante y Rivero'],
  },
  Cusco: {
    Cusco: ['Cusco', 'San Jerónimo', 'San Sebastián', 'Wanchaq', 'Santiago'],
    'La Convención': ['Santa Ana'],
  },
  Piura: {
    Piura: ['Piura', 'Castilla', 'Catacaos', 'Tambo Grande'],
    Sullana: ['Sullana'],
    Talara: ['Pariñas'],
  },
  Lambayeque: {
    Chiclayo: ['Chiclayo', 'José Leonardo Ortiz', 'La Victoria'],
    Lambayeque: ['Lambayeque', 'Motupe', 'Olmos'],
  },
  'La Libertad': {
    Trujillo: ['Trujillo', 'El Porvenir', 'La Esperanza', 'Víctor Larco Herrera'],
  },
  Puno: {
    Puno: ['Puno'],
    'San Román': ['Juliaca'],
  },
  Cajamarca: {
    Cajamarca: ['Cajamarca', 'Baños del Inca'],
    Jaén: ['Jaén'],
  },
  Amazonas: {
    Chachapoyas: ['Chachapoyas'],
    Bagua: ['Bagua', 'La Peca'],
  },
  Madre_de_Dios: {
    Tambopata: ['Tambopata', 'Inambari', 'Las Piedras'],
  },
  Pasco: {
    Oxapampa: ['Oxapampa', 'Villa Rica', 'Pozuzo'],
    Pasco: ['Chaupimarca', 'Yanacancha'],
  },
};

const DEPARTAMENTOS = Object.keys(UBIGEO);

function getProvincias(depto: string): string[] {
  return depto ? Object.keys(UBIGEO[depto] ?? {}) : [];
}

function getDistritos(depto: string, prov: string): string[] {
  return depto && prov ? (UBIGEO[depto]?.[prov] ?? []) : [];
}

// ── Types ───────────────────────────────────────────────────────────────────

type CustomerFormData = {
  // Identificacion
  tipoPersona: string;
  tipoDocumento: string;
  documento: string;
  name: string;
  razonSocial: string;
  estado: string;
  // Contacto
  phone: string;
  whatsappSecundario: string;
  email: string;
  // Ubicacion
  departamento: string;
  provincia: string;
  distrito: string;
  direccion: string;
  // Comercial
  categoria: string;
  canal: string;
  listaPrecio: string;
  vendedorAsignado: string;
  // Fiado
  creditoActivo: boolean;
  creditLimit: number;
  diasCredito: number;
  alertasWhatsapp: boolean;
  // Adicionales
  fechaNacimiento: string;
  genero: string;
  comoLlego: string;
  observaciones: string;
};

const EMPTY_FORM: CustomerFormData = {
  tipoPersona: 'natural',
  tipoDocumento: 'DNI',
  documento: '',
  name: '',
  razonSocial: '',
  estado: 'activo',
  phone: '',
  whatsappSecundario: '',
  email: '',
  departamento: 'Ucayali',
  provincia: 'Coronel Portillo',
  distrito: 'Callería',
  direccion: '',
  categoria: '',
  canal: 'presencial',
  listaPrecio: 'general',
  vendedorAsignado: '',
  creditoActivo: false,
  creditLimit: 0,
  diasCredito: 0,
  alertasWhatsapp: true,
  fechaNacimiento: '',
  genero: '',
  comoLlego: '',
  observaciones: '',
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  customer?: Record<string, unknown> | null;
  initialFormat?: 'simple' | 'completo';
};

// ── Accordion Section ──────────────────────────────────────────────────────

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-surface text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-accent transition-colors"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ClienteFormModal({ isOpen, onClose, onSaved, customer, initialFormat }: Props) {
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
  const [dniLoading, setDniLoading] = useState(false);
  const [dniMsg, setDniMsg] = useState('');
  const isEdit = !!customer;

  // Populate form when editing
  useEffect(() => {
    if (customer) {
      setForm({
        tipoPersona: (customer.tipoPersona as string) ?? 'natural',
        tipoDocumento: (customer.tipoDocumento as string) ?? 'DNI',
        documento: (customer.documento as string) ?? '',
        name: (customer.name as string) ?? '',
        razonSocial: (customer.razonSocial as string) ?? '',
        estado: (customer.estado as string) ?? 'activo',
        phone: (customer.phone as string) ?? '',
        whatsappSecundario: (customer.whatsappSecundario as string) ?? '',
        email: (customer.email as string) ?? '',
        departamento: (customer.departamento as string) ?? 'Ucayali',
        provincia: (customer.provincia as string) ?? 'Coronel Portillo',
        distrito: (customer.distrito as string) ?? 'Callería',
        direccion: (customer.direccion as string) ?? (customer.location as string) ?? '',
        categoria: (customer.categoria as string) ?? '',
        canal: (customer.canal as string) ?? 'presencial',
        listaPrecio: (customer.listaPrecio as string) ?? 'general',
        vendedorAsignado: (customer.vendedorAsignado as string) ?? '',
        creditoActivo: ((customer.creditLimit as number) ?? 0) > 0,
        creditLimit: (customer.creditLimit as number) ?? 0,
        diasCredito: (customer.diasCredito as number) ?? 0,
        alertasWhatsapp: (customer.alertasWhatsapp as boolean) ?? true,
        fechaNacimiento: customer.fechaNacimiento ? String(customer.fechaNacimiento).slice(0, 10) : '',
        genero: (customer.genero as string) ?? '',
        comoLlego: (customer.comoLlego as string) ?? '',
        observaciones: (customer.observaciones as string) ?? '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [customer]);

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

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
          throw new Error(data.error ?? 'Error al crear');
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setSaving(false);
    }
  };

  // ── Input helpers ───────────────────────────────────────────────────────

  const inputCls = "w-full px-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-white dark:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-base transition-all placeholder:text-[var(--text-tertiary)]";
  const labelCls = "block text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5";
  const selectCls = cn(inputCls, "appearance-none");

  return (
    <AdminModal
      open={isOpen}
      onClose={onClose}
      title={isEdit ? 'Editar cliente' : 'Nuevo cliente'}
      variant="wide"
    >
      <div>
        {/* Format toggle */}
        <div className="px-5 pt-4 pb-2 flex gap-2">
          <button
            type="button"
            onClick={() => changeFormat('simple')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors",
              format === 'simple'
                ? "bg-primary text-white"
                : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-gray-200 dark:hover:bg-accent"
            )}
          >
            <Zap className="h-3.5 w-3.5" /> Simple
          </button>
          <button
            type="button"
            onClick={() => changeFormat('completo')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors",
              format === 'completo'
                ? "bg-primary text-white"
                : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-gray-200 dark:hover:bg-accent"
            )}
          >
            <ClipboardList className="h-3.5 w-3.5" /> Completo
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* ── SIMPLE FORMAT ── */}
          {format === 'simple' && (
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
                        "flex-1 py-2 rounded-lg text-sm font-bold border transition-colors",
                        form.tipoPersona === t
                          ? "bg-primary text-white border-primary"
                          : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
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
                            className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface hover:bg-gray-50 dark:hover:bg-accent transition-colors shrink-0 disabled:opacity-50"
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
          )}

          {/* ── COMPLETE FORMAT ── */}
          {format === 'completo' && (
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
                          "flex-1 py-2 rounded-lg text-sm font-bold border transition-colors",
                          form.tipoPersona === t
                            ? "bg-primary text-white border-primary"
                            : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
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
                              className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface hover:bg-gray-50 dark:hover:bg-accent transition-colors shrink-0 disabled:opacity-50"
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
                    onClick={() => set('creditoActivo', !form.creditoActivo)}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      form.creditoActivo ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
                    )}
                  >
                    <span className={cn(
                      "inline-block h-4 w-4 rounded-full bg-white dark:bg-[var(--color-card)] transition-transform",
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
                        onClick={() => set('alertasWhatsapp', !form.alertasWhatsapp)}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                          form.alertasWhatsapp ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
                        )}
                      >
                        <span className={cn(
                          "inline-block h-4 w-4 rounded-full bg-white dark:bg-[var(--color-card)] transition-transform",
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
            </div>
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
              className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
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
