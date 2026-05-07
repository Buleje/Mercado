'use client';

import { CardTitle } from "@buleje/design-system";

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { X, Zap, ClipboardList, ChevronDown, ChevronUp, Loader2, Check } from "@buleje/design-system/icons";
import { cn } from '@/lib/utils';

// ── Ubigeo data (principales departamentos de Peru) ─────────────────────────

const UBIGEO: Record<string, Record<string, string[]>> = {
  Ucayali: {
    'Coronel Portillo': ['Calleria', 'Yarinacocha', 'Manantay', 'Nueva Requena', 'Campo Verde', 'Masisea', 'Iparia'],
    Atalaya: ['Raymondi', 'Sepahua', 'Tahuania', 'Yurua'],
    'Padre Abad': ['Padre Abad', 'Irazola', 'Curimana', 'Neshuya', 'Alexander Von Humboldt'],
    Purus: ['Purus'],
  },
  Lima: {
    Lima: ['Lima', 'Miraflores', 'San Isidro', 'Surco', 'San Borja', 'La Molina', 'Ate', 'San Juan de Lurigancho', 'Los Olivos', 'Comas', 'Villa El Salvador', 'Callao'],
    Huaral: ['Huaral', 'Chancay', 'Aucallama'],
    Canete: ['San Vicente de Canete', 'Imperial', 'Lunahuana'],
  },
  Loreto: {
    Maynas: ['Iquitos', 'San Juan Bautista', 'Punchana', 'Belen'],
    'Alto Amazonas': ['Yurimaguas', 'Lagunas'],
    Requena: ['Requena'],
  },
  'San Martin': {
    'San Martin': ['Tarapoto', 'Morales', 'La Banda de Shilcayo'],
    Moyobamba: ['Moyobamba'],
    Rioja: ['Rioja', 'Nueva Cajamarca'],
  },
  Junin: {
    Huancayo: ['Huancayo', 'El Tambo', 'Chilca'],
    Satipo: ['Satipo', 'Mazamari', 'Pangoa'],
    Chanchamayo: ['Chanchamayo', 'San Ramon', 'La Merced'],
  },
  Huanuco: {
    Huanuco: ['Huanuco', 'Amarilis', 'Pillco Marca'],
    'Leoncio Prado': ['Rupa-Rupa', 'Jose Crespo y Castillo'],
  },
  Arequipa: {
    Arequipa: ['Arequipa', 'Cayma', 'Cerro Colorado', 'Yanahuara'],
  },
  Piura: {
    Piura: ['Piura', 'Castilla', 'Catacaos'],
    Sullana: ['Sullana'],
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

type SupplierFormData = {
  tipoPersona: string;
  tipoDocumento: string;
  documento: string;
  name: string;
  razonSocial: string;
  estado: string;
  phone: string;
  whatsappSecundario: string;
  email: string;
  personaContacto: string;
  departamento: string;
  provincia: string;
  distrito: string;
  direccion: string;
  categoria: string;
  condicionPago: string;
  diasCredito: number;
  cuentaBancaria: string;
  banco: string;
  observaciones: string;
};

const EMPTY_FORM: SupplierFormData = {
  tipoPersona: 'juridica',
  tipoDocumento: 'RUC',
  documento: '',
  name: '',
  razonSocial: '',
  estado: 'activo',
  phone: '',
  whatsappSecundario: '',
  email: '',
  personaContacto: '',
  departamento: '',
  provincia: '',
  distrito: '',
  direccion: '',
  categoria: '',
  condicionPago: 'contado',
  diasCredito: 0,
  cuentaBancaria: '',
  banco: '',
  observaciones: '',
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  supplier?: Record<string, unknown> | null;
  initialFormat?: 'simple' | 'completo';
};

// ── Accordion Section ──────────────────────────────────────────────────────

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-surface text-sm font-bold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ProveedorFormModal({ isOpen, onClose, onSaved, supplier, initialFormat }: Props) {
  const [format, setFormat] = useState<'simple' | 'completo'>(() => {
    if (initialFormat) return initialFormat;
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('proveedor-form-format') as 'simple' | 'completo') ?? 'simple';
    }
    return 'simple';
  });
  const [form, setForm] = useState<SupplierFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rucLookup, setRucLookup] = useState<{ status: "idle" | "loading" | "ok" | "notfound" | "error"; msg?: string }>({ status: "idle" });
  const isEdit = !!supplier;

  // ── Lookup RUC en SUNAT ───────────────────────────────────────────────────
  const handleRucLookup = useCallback(async (ruc: string) => {
    if (!/^[12]\d{10}$/.test(ruc)) {
      setRucLookup({ status: "idle" });
      return;
    }
    setRucLookup({ status: "loading" });
    try {
      const res = await fetch(`/api/sunat/lookup-ruc?ruc=${encodeURIComponent(ruc)}`, { credentials: "include" });
      if (res.status === 404) {
        setRucLookup({ status: "notfound", msg: "RUC no existe en SUNAT" });
        return;
      }
      if (!res.ok) {
        setRucLookup({ status: "error", msg: "No se pudo consultar SUNAT" });
        return;
      }
      const data = await res.json() as {
        razonSocial?: string;
        nombreComercial?: string;
        direccion?: string;
        departamento?: string;
        provincia?: string;
        distrito?: string;
        estado?: string;
      };
      setForm((f) => ({
        ...f,
        razonSocial: data.razonSocial ?? f.razonSocial,
        name: f.name || data.nombreComercial || data.razonSocial || f.name,
        direccion: data.direccion?.trim() || f.direccion,
        departamento: data.departamento || f.departamento,
        provincia: data.provincia || f.provincia,
        distrito: data.distrito || f.distrito,
        tipoPersona: f.tipoPersona === 'natural' ? f.tipoPersona : 'juridica',
      }));
      setRucLookup({
        status: "ok",
        msg: data.estado === "ACTIVO" || !data.estado ? "Datos cargados de SUNAT" : `Estado: ${data.estado}`,
      });
    } catch {
      setRucLookup({ status: "error", msg: "Error de red al consultar SUNAT" });
    }
  }, []);

  // Populate form when editing
  useEffect(() => {
    if (supplier) {
      setForm({
        tipoPersona: (supplier.tipoPersona as string) ?? 'juridica',
        tipoDocumento: (supplier.tipoDocumento as string) ?? 'RUC',
        documento: (supplier.documento as string) ?? (supplier.ruc as string) ?? '',
        name: (supplier.name as string) ?? '',
        razonSocial: (supplier.razonSocial as string) ?? '',
        estado: (supplier.estado as string) ?? 'activo',
        phone: (supplier.phone as string) ?? '',
        whatsappSecundario: (supplier.whatsappSecundario as string) ?? '',
        email: (supplier.email as string) ?? '',
        personaContacto: (supplier.personaContacto as string) ?? '',
        departamento: (supplier.departamento as string) ?? '',
        provincia: (supplier.provincia as string) ?? '',
        distrito: (supplier.distrito as string) ?? '',
        direccion: (supplier.direccion as string) ?? (supplier.address as string) ?? '',
        categoria: (supplier.categoria as string) ?? '',
        condicionPago: (supplier.condicionPago as string) ?? 'contado',
        diasCredito: (supplier.diasCredito as number) ?? 0,
        cuentaBancaria: (supplier.cuentaBancaria as string) ?? '',
        banco: (supplier.banco as string) ?? '',
        observaciones: (supplier.observaciones as string) ?? (supplier.notes as string) ?? '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [supplier]);

  const changeFormat = useCallback((f: 'simple' | 'completo') => {
    setFormat(f);
    if (typeof window !== 'undefined') localStorage.setItem('proveedor-form-format', f);
  }, []);

  const set = useCallback(<K extends keyof SupplierFormData>(key: K, value: SupplierFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const nombre = form.tipoPersona === 'juridica' ? form.razonSocial || form.name : form.name;
    if (!nombre.trim()) {
      setError('El nombre es requerido');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.tipoPersona === 'juridica' ? form.razonSocial || form.name : form.name,
        ruc: form.documento || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.direccion || undefined,
        notes: form.observaciones || undefined,
        tipoPersona: form.tipoPersona || null,
        tipoDocumento: form.tipoDocumento || null,
        documento: form.documento || null,
        razonSocial: form.razonSocial || null,
        estado: form.estado || 'activo',
        whatsappSecundario: form.whatsappSecundario || null,
        personaContacto: form.personaContacto || null,
        departamento: form.departamento || null,
        provincia: form.provincia || null,
        distrito: form.distrito || null,
        direccion: form.direccion || null,
        categoria: form.categoria || null,
        condicionPago: form.condicionPago || null,
        diasCredito: form.diasCredito || 0,
        cuentaBancaria: form.cuentaBancaria || null,
        banco: form.banco || null,
        observaciones: form.observaciones || null,
      };

      if (isEdit) {
        const res = await fetch(`/api/suppliers/${encodeURIComponent(supplier!.id as string)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Error al actualizar');
        }
      } else {
        const res = await fetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

  if (!isOpen) return null;

  const inputCls = "w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground bg-white dark:bg-surface focus:border-primary outline-none text-sm placeholder:text-[var(--text-tertiary)]";
  const labelCls = "block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1";
  const selectCls = cn(inputCls, "appearance-none");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-card w-full sm:max-w-2xl sm:rounded-xl rounded-t-2xl overflow-y-auto max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] dark:border-card-border sticky top-0 bg-white dark:bg-card z-10">
          <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">
            {isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
          </CardTitle>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
            <X className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" />
          </button>
        </div>

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
                <label className={labelCls}>Tipo persona</label>
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
                          : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
                      )}
                    >
                      {t === 'natural' ? 'Natural' : 'Juridica'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nombre / Razon Social */}
              <div>
                <label className={labelCls}>
                  {form.tipoPersona === 'juridica' ? 'Razon Social *' : 'Nombre completo *'}
                </label>
                <input
                  value={form.tipoPersona === 'juridica' ? form.razonSocial : form.name}
                  onChange={e => form.tipoPersona === 'juridica' ? set('razonSocial', e.target.value) : set('name', e.target.value)}
                  placeholder={form.tipoPersona === 'juridica' ? 'Distribuidora Lima S.A.C.' : 'Nombre del proveedor'}
                  className={inputCls}
                />
              </div>

              {/* RUC + Teléfono */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>
                    RUC <span className="text-[var(--text-tertiary)] font-normal text-xs">(autocompleta SUNAT)</span>
                  </label>
                  <div className="relative">
                    <input
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
                </div>
                <div>
                  <label className={labelCls}>Teléfono</label>
                  <input
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    placeholder="987 654 321"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Direccion */}
              <div>
                <label className={labelCls}>Direccion</label>
                <textarea
                  value={form.direccion}
                  onChange={e => set('direccion', e.target.value)}
                  placeholder="Av. Colonial 1234, Lima"
                  rows={2}
                  className={cn(inputCls, "resize-none")}
                />
              </div>
            </>
          )}

          {/* ── COMPLETE FORMAT ── */}
          {format === 'completo' && (
            <div className="space-y-3">
              {/* Seccion 1: Identificacion */}
              <Section title="1. Identificacion" defaultOpen={true}>
                <div>
                  <label className={labelCls}>Tipo persona</label>
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
                            : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
                        )}
                      >
                        {t === 'natural' ? 'Natural' : 'Juridica'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Tipo documento</label>
                    <select value={form.tipoDocumento} onChange={e => set('tipoDocumento', e.target.value)} className={selectCls}>
                      <option value="RUC">RUC</option>
                      <option value="DNI">DNI</option>
                      <option value="CE">CE</option>
                      <option value="PASAPORTE">Pasaporte</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Número documento</label>
                    <input value={form.documento} onChange={e => set('documento', e.target.value)} placeholder="20xxxxxxxxx" className={cn(inputCls, "font-mono")} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>
                    {form.tipoPersona === 'juridica' ? 'Razon Social *' : 'Nombre *'}
                  </label>
                  <input
                    value={form.tipoPersona === 'juridica' ? form.razonSocial : form.name}
                    onChange={e => form.tipoPersona === 'juridica' ? set('razonSocial', e.target.value) : set('name', e.target.value)}
                    placeholder={form.tipoPersona === 'juridica' ? 'Distribuidora Lima S.A.C.' : 'Nombre del proveedor'}
                    className={inputCls}
                  />
                </div>
                {form.tipoPersona === 'juridica' && (
                  <div>
                    <label className={labelCls}>Nombre comercial</label>
                    <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre corto o comercial" className={inputCls} />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Estado</label>
                  <select value={form.estado} onChange={e => set('estado', e.target.value)} className={selectCls}>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </div>
              </Section>

              {/* Seccion 2: Contacto */}
              <Section title="2. Contacto" defaultOpen={true}>
                <div>
                  <label className={labelCls}>Teléfono</label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="987 654 321" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>WhatsApp secundario</label>
                  <input value={form.whatsappSecundario} onChange={e => set('whatsappSecundario', e.target.value)} placeholder="Otro número" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="ventas@empresa.com" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Persona de contacto</label>
                  <input value={form.personaContacto} onChange={e => set('personaContacto', e.target.value)} placeholder="Nombre del contacto directo" className={inputCls} />
                </div>
              </Section>

              {/* Seccion 3: Ubicacion */}
              <Section title="3. Ubicacion">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Departamento</label>
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
                  </div>
                  <div>
                    <label className={labelCls}>Provincia</label>
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
                  </div>
                  <div>
                    <label className={labelCls}>Distrito</label>
                    <select value={form.distrito} onChange={e => set('distrito', e.target.value)} className={selectCls}>
                      <option value="">Seleccionar</option>
                      {getDistritos(form.departamento, form.provincia).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Direccion</label>
                  <textarea
                    value={form.direccion}
                    onChange={e => set('direccion', e.target.value)}
                    placeholder="Av. Colonial 1234"
                    rows={2}
                    className={cn(inputCls, "resize-none")}
                  />
                </div>
              </Section>

              {/* Seccion 4: Comercial */}
              <Section title="4. Comercial">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Categoria</label>
                    <select value={form.categoria} onChange={e => set('categoria', e.target.value)} className={selectCls}>
                      <option value="">Sin asignar</option>
                      <option value="mayorista">Mayorista</option>
                      <option value="fabricante">Fabricante</option>
                      <option value="distribuidor">Distribuidor</option>
                      <option value="importador">Importador</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Condicion de pago</label>
                    <select value={form.condicionPago} onChange={e => set('condicionPago', e.target.value)} className={selectCls}>
                      <option value="contado">Contado</option>
                      <option value="credito_7">Credito 7 dias</option>
                      <option value="credito_15">Credito 15 dias</option>
                      <option value="credito_30">Credito 30 dias</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Dias de credito</label>
                    <input
                      type="number"
                      min={0}
                      value={form.diasCredito}
                      onChange={e => set('diasCredito', parseInt(e.target.value) || 0)}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Cuenta bancaria</label>
                    <input value={form.cuentaBancaria} onChange={e => set('cuentaBancaria', e.target.value)} placeholder="Nro. de cuenta" className={cn(inputCls, "font-mono")} />
                  </div>
                  <div>
                    <label className={labelCls}>Banco</label>
                    <select value={form.banco} onChange={e => set('banco', e.target.value)} className={selectCls}>
                      <option value="">Seleccionar</option>
                      <option value="BCP">BCP</option>
                      <option value="Interbank">Interbank</option>
                      <option value="BBVA">BBVA</option>
                      <option value="Scotiabank">Scotiabank</option>
                      <option value="BanBif">BanBif</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                </div>
              </Section>

              {/* Seccion 5: Adicionales */}
              <Section title="5. Adicionales">
                <div>
                  <label className={labelCls}>Observaciones</label>
                  <textarea
                    value={form.observaciones}
                    onChange={e => set('observaciones', e.target.value)}
                    placeholder="Notas adicionales sobre el proveedor..."
                    rows={3}
                    className={cn(inputCls, "resize-none")}
                  />
                </div>
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
              className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Guardando...' : isEdit ? 'Guardar proveedor' : format === 'simple' ? 'Crear proveedor' : 'Guardar proveedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
