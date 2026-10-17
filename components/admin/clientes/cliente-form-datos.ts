/**
 * Datos del formulario de cliente (`ClienteFormModal`): ubigeo, la forma del formulario,
 * el formulario vacío, el de un cliente que se edita y las clases de los campos.
 * Salieron del modal el 17-10 para dejarlo bajo las 300 líneas; sin cambios de lógica.
 */
import { cn } from '@/lib/utils';
import { cumpleDe } from "@/lib/clientes/cumpleanos";

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

export const DEPARTAMENTOS = Object.keys(UBIGEO);

export function getProvincias(depto: string): string[] {
  return depto ? Object.keys(UBIGEO[depto] ?? {}) : [];
}

export function getDistritos(depto: string, prov: string): string[] {
  return depto && prov ? (UBIGEO[depto]?.[prov] ?? []) : [];
}

// ── Types ───────────────────────────────────────────────────────────────────

export type CustomerFormData = {
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

export const EMPTY_FORM: CustomerFormData = {
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

/** Cambia un campo del formulario. */
export type SetCampo = <K extends keyof CustomerFormData>(key: K, value: CustomerFormData[K]) => void;

/** El formulario lleno con lo que ya tiene el cliente que se edita. */
export function formDesdeCliente(customer: Record<string, unknown>): CustomerFormData {
  return {
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
    // Un solo cumpleaños: el que dio en la tienda (birthday) o el de la ficha.
    fechaNacimiento: cumpleDe({ birthday: customer.birthday as string | null | undefined, fechaNacimiento: customer.fechaNacimiento as string | null | undefined }) ?? '',
    genero: (customer.genero as string) ?? '',
    comoLlego: (customer.comoLlego as string) ?? '',
    observaciones: (customer.observaciones as string) ?? '',
  };
}

// ── Input helpers ───────────────────────────────────────────────────────

export const inputCls = "w-full px-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-[var(--surface-raised)] focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-base transition-all placeholder:text-[var(--text-tertiary)]";
export const labelCls = "block text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5";
export const selectCls = cn(inputCls, "appearance-none");
