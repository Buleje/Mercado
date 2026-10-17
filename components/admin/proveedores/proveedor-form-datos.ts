/**
 * proveedor-form-datos.ts — lo que el formulario de proveedor sabe sin dibujar:
 * ubigeo, la ficha vacía, cómo se lee un proveedor guardado y qué se manda al
 * guardar. Partido de `ProveedorFormModal.tsx` (675 líneas) el 09-10.
 */
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

export const DEPARTAMENTOS = Object.keys(UBIGEO);

export function getProvincias(depto: string): string[] {
  return depto ? Object.keys(UBIGEO[depto] ?? {}) : [];
}

export function getDistritos(depto: string, prov: string): string[] {
  return depto && prov ? (UBIGEO[depto]?.[prov] ?? []) : [];
}

// ── Types ───────────────────────────────────────────────────────────────────

export type SupplierFormData = {
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
  /** Días que tarda en entregar (`Supplier.leadTimeDias`). Vacío = se usa lo medido. */
  leadTimeDias: string;
  cuentaBancaria: string;
  banco: string;
  observaciones: string;
};

export const EMPTY_FORM: SupplierFormData = {
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
  leadTimeDias: '',
  cuentaBancaria: '',
  banco: '',
  observaciones: '',
};

export const inputCls = "w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground bg-[var(--surface-raised)] focus:border-primary outline-none text-sm placeholder:text-[var(--text-tertiary)]";
export const labelCls = "block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1";
export const selectCls = cn(inputCls, "appearance-none");

/**
 * Días de entrega del formulario → `leadTimeDias`. Vacío = `null`: Sugerencias
 * usa entonces lo que tardaron de verdad sus órdenes (ADR-376, «el declarado
 * gana» sólo si existe).
 */
export function diasDeEntrega(texto: string): number | null {
  if (texto.trim() === '') return null;
  const n = Math.round(Number(texto));
  return Number.isFinite(n) ? Math.min(365, Math.max(0, n)) : null;
}

/** La ficha guardada → el formulario. */
export function formDesdeProveedor(supplier: Record<string, unknown>): SupplierFormData {
  return {
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
    leadTimeDias: typeof supplier.leadTimeDias === 'number' ? String(supplier.leadTimeDias) : '',
    cuentaBancaria: (supplier.cuentaBancaria as string) ?? '',
    banco: (supplier.banco as string) ?? '',
    observaciones: (supplier.observaciones as string) ?? (supplier.notes as string) ?? '',
  };
}

/** El formulario → el cuerpo de POST/PATCH `/api/suppliers`. */
export function cuerpoDelProveedor(form: SupplierFormData): Record<string, unknown> {
  return {
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
  leadTimeDias: diasDeEntrega(form.leadTimeDias),
    cuentaBancaria: form.cuentaBancaria || null,
    banco: form.banco || null,
    observaciones: form.observaciones || null,
  };
}
