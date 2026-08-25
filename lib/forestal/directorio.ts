/**
 * directorio — las partes y los vehículos del negocio forestal (ADR-317).
 *
 * ## Por qué existe
 *
 * La Guía de Transporte Forestal pide, por cada viaje, la identidad de cuatro
 * actores (propietario, destinatario, transportista, conductor) más la placa. En
 * un aserradero real esos cuatro se repiten viaje tras viaje: el mismo comprador
 * de Lima, el mismo camión, el mismo chofer. Tipearlos de nuevo cada vez no sólo
 * es lento — es la fuente #1 de datos que no se pueden cruzar: "MADERERA DEL
 * ORIENTE SAC", "Maderera del Oriente", "MAD. ORIENTE" son tres proveedores
 * distintos para cualquier consulta, y uno solo para la realidad.
 *
 * Acá viven las reglas que comparten cliente y servidor: qué roles existen, cómo
 * se normaliza un nombre/documento/placa, y qué documento es válido para el país.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { z } from "zod";

// ── Roles ───────────────────────────────────────────────────────────────────

/**
 * Los cuatro papeles que puede cumplir una parte. Son roles, no tipos: la misma
 * empresa suele ser proveedor Y destinatario, y el dueño-chofer es transportista
 * Y conductor.
 */
export const ROLES_PARTE = ["proveedor", "destinatario", "transportista", "conductor"] as const;
export type RolParte = (typeof ROLES_PARTE)[number];

export const ROL_LABEL: Record<RolParte, string> = {
  proveedor: "Proveedor",
  destinatario: "Destinatario",
  transportista: "Transportista",
  conductor: "Conductor",
};

/** Plural explícito: "destinatarioes" no existe y el `+ "es"` lo fabricaba. */
export const ROL_PLURAL: Record<RolParte, string> = {
  proveedor: "Proveedores",
  destinatario: "Destinatarios",
  transportista: "Transportistas",
  conductor: "Conductores",
};

/** Qué hace cada rol, en el idioma del patio. Para la ayuda de la UI. */
export const ROL_DESCRIPCION: Record<RolParte, string> = {
  proveedor: "Trae la madera al CTP — su GTF es el origen legal del ingreso",
  destinatario: "Recibe el producto despachado en el destino",
  transportista: "Empresa o persona que hace el traslado",
  conductor: "Quien maneja: el control le pide licencia y DNI",
};

export function esRolValido(v: string): v is RolParte {
  return (ROLES_PARTE as readonly string[]).includes(v);
}

// ── Categoría ───────────────────────────────────────────────────────────────

/**
 * Qué tipo de entidad es un proveedor — decide qué pide "Según el papel" en
 * el modal: una CCNN extrae con título habilitante/plan de manejo, un
 * aserradero/CTP tiene su propio Código de CTP, una empresa genérica no
 * necesita ninguno de los dos.
 */
export const CATEGORIAS_PARTE = ["empresa", "ccnn", "aserradero"] as const;
export type CategoriaParte = (typeof CATEGORIAS_PARTE)[number];

export const CATEGORIA_LABEL: Record<CategoriaParte, string> = {
  empresa: "Empresa",
  ccnn: "CCNN",
  aserradero: "Aserradero / CTP",
};

export function esCategoriaValida(v: string): v is CategoriaParte {
  return (CATEGORIAS_PARTE as readonly string[]).includes(v);
}

/** Sin categoría guardada (partes de antes de este campo) se trata como CCNN: es el comportamiento histórico, todos los campos visibles. */
export function categoriaEfectiva(c: CategoriaParte | null | undefined): CategoriaParte {
  return c ?? "ccnn";
}

// ── Documentos ──────────────────────────────────────────────────────────────

export const DOC_TIPOS = ["RUC", "DNI", "CE", "PASAPORTE"] as const;
export type DocTipo = (typeof DOC_TIPOS)[number];

/** Sólo dígitos y letras: un RUC copiado de SUNAT viene con espacios y guiones. */
export function normalizarDocumento(v: string): string {
  return (v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

/**
 * ¿El número corresponde al tipo? Devuelve el motivo, o `null` si está bien.
 *
 * Vacío es válido a propósito: una parte puede cargarse con el nombre y
 * completarse después. Lo que NO se admite es un documento *mal formado* — un
 * RUC de 9 dígitos en una guía es peor que ninguno, porque parece un dato.
 */
export function motivoDocInvalido(docTipo: DocTipo, numero: string): string | null {
  const n = normalizarDocumento(numero);
  if (!n) return null;
  if (docTipo === "RUC") {
    if (!/^\d{11}$/.test(n)) return "El RUC tiene 11 dígitos.";
    if (!/^[12]/.test(n)) return "Un RUC peruano empieza en 1 o 2.";
    return null;
  }
  if (docTipo === "DNI") return /^\d{8}$/.test(n) ? null : "El DNI tiene 8 dígitos.";
  if (docTipo === "CE") return /^[0-9A-Z]{6,15}$/.test(n) ? null : "El carné de extranjería tiene entre 6 y 15 caracteres.";
  return /^[0-9A-Z]{5,20}$/.test(n) ? null : "El pasaporte tiene entre 5 y 20 caracteres.";
}

/** Qué servicio puede completar los datos de este documento, si alguno. */
export function fuenteAutocompletado(docTipo: DocTipo): "SUNAT" | "RENIEC" | null {
  if (docTipo === "RUC") return "SUNAT";
  if (docTipo === "DNI") return "RENIEC";
  return null;
}

// ── Placas ──────────────────────────────────────────────────────────────────

/**
 * Placa peruana normalizada: sin guiones ni espacios, en mayúscula. Se guarda
 * así para que "A2C-123", "a2c123" y "A2C 123" sean el MISMO camión — que es lo
 * que pasa cuando cada operador la escribe a su manera.
 */
export function normalizarPlaca(v: string): string {
  return (v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 10);
}

/** Con guión, que es como se lee en el papel: `A2C-123`. */
export function formatearPlaca(v: string): string {
  const n = normalizarPlaca(v);
  if (n.length < 6) return n;
  return `${n.slice(0, 3)}-${n.slice(3)}`;
}

// ── Nombres ─────────────────────────────────────────────────────────────────

/** Espacios colapsados y sin bordes. No cambia mayúsculas: la razón social se respeta. */
export function normalizarNombre(v: string): string {
  return (v ?? "").replace(/\s+/g, " ").trim();
}

/** Sin tildes y en minúscula — para buscar "Piña" tipeando "pina". */
export function claveBusqueda(v: string): string {
  return normalizarNombre(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ── Esquemas ────────────────────────────────────────────────────────────────


// ── Logo del titular ────────────────────────────────────────────────────────

/**
 * El logo viaja como **data URL**, no como URL del storage.
 *
 * El PDF de la guía se arma fotografiando la hoja en el navegador: una imagen
 * remota sin CORS ensucia el canvas y sale en blanco justo en el papel que se
 * presenta. Embebida, el logo funciona igual en pantalla, en el PDF y sin señal
 * — al precio de guardar unos kilobytes en la fila, que es un precio barato.
 */
export const LOGO_MAX_LADO = 320;
/** Tope duro: 160 KB de data URL ≈ un PNG de 320 px bien optimizado. */
export const LOGO_MAX_BYTES = 160_000;
const LOGO_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Motivo por el que un logo no se puede guardar, o `null` si está bien. */
export function motivoLogoInvalido(dataUrl: string): string | null {
  const v = (dataUrl ?? "").trim();
  if (!v) return null; // vacío = sin logo, es válido
  const m = /^data:([a-z/+.-]+);base64,/i.exec(v);
  if (!m) return "El logo tiene que ser una imagen (PNG, JPG o WEBP).";
  if (!(LOGO_MIMES as readonly string[]).includes(m[1].toLowerCase())) {
    return "Formato no admitido: usá PNG, JPG o WEBP.";
  }
  if (v.length > LOGO_MAX_BYTES) {
    return `La imagen pesa ${Math.round(v.length / 1024)} KB y el tope son ${Math.round(LOGO_MAX_BYTES / 1024)} KB.`;
  }
  return null;
}

/** Un adjunto del titular: el archivo vive en el Drive, acá queda el puntero. */
export interface AdjuntoParte {
  documentId: string;
  rotulo: string;
  /** ISO de cuándo se vinculó, para ordenar la lista. */
  vinculadoEl: string;
}

export const adjuntoSchema = z.object({
  documentId: z.string().trim().min(1).max(60),
  rotulo: z.string().trim().min(1).max(120),
  vinculadoEl: z.string().trim().max(40),
});

const texto = (max: number) => z.string().trim().max(max);

export const parteInputSchema = z.object({
  roles: z.array(z.enum(ROLES_PARTE)).min(1, "Elegí al menos un rol").max(4),
  nombre: texto(200).min(2, "El nombre es obligatorio"),
  categoria: z.enum(CATEGORIAS_PARTE).optional().nullable(),
  /** Código de CTP de la parte, cuando ella misma es otro aserradero/CTP. */
  codigoCtp: texto(60).optional(),
  docTipo: z.enum(DOC_TIPOS).optional(),
  docNumero: texto(20).optional(),
  direccion: texto(250).optional(),
  region: texto(80).optional(),
  provincia: texto(80).optional(),
  distrito: texto(80).optional(),
  /** Sector o caserío del formato oficial (ADR-373). */
  zona: texto(80).optional(),
  ubigeo: texto(10).optional(),
  telefono: texto(40).optional(),
  email: texto(160).optional(),
  registroMtc: texto(40).optional(),
  licencia: texto(30).optional(),
  tituloHabilitante: texto(80).optional(),
  resolucion: texto(120).optional(),
  planManejo: texto(120).optional(),
  arffs: texto(120).optional(),
  representante: texto(160).optional(),
  notas: texto(500).optional(),
  activo: z.boolean().optional(),
  /** Data URL; se valida el formato y el peso, no el contenido de la imagen. */
  logo: z
    .string()
    .max(LOGO_MAX_BYTES, "La imagen es muy pesada")
    .superRefine((v, ctx) => {
      const motivo = motivoLogoInvalido(v);
      if (motivo) ctx.addIssue({ code: "custom", message: motivo });
    })
    .optional()
    .nullable(),
  adjuntos: z.array(adjuntoSchema).max(30).optional(),
});
export type ParteInput = z.infer<typeof parteInputSchema>;

export const vehiculoInputSchema = z.object({
  placa: texto(15).min(5, "La placa es obligatoria"),
  marca: texto(40).optional(),
  tipo: texto(40).optional(),
  configuracion: texto(20).optional(),
  /** Chapa del acoplado, si el camión lleva (ADR-373). */
  placaRemolque: texto(15).optional(),
  capacidadM3: z.number().nonnegative().max(999).optional().nullable(),
  transportistaId: texto(40).optional().nullable(),
  notas: texto(500).optional(),
  activo: z.boolean().optional(),
});
export type VehiculoInput = z.infer<typeof vehiculoInputSchema>;

// ── Formas que viajan al cliente ────────────────────────────────────────────

export interface Parte {
  id: string;
  roles: RolParte[];
  nombre: string;
  categoria: CategoriaParte | null;
  /** Código de CTP de la parte, cuando ella misma es otro aserradero/CTP. */
  codigoCtp: string | null;
  docTipo: DocTipo | null;
  docNumero: string | null;
  direccion: string | null;
  region: string | null;
  provincia: string | null;
  distrito: string | null;
  /** Sector o caserío del formato oficial (ADR-373). */
  zona: string | null;
  ubigeo: string | null;
  telefono: string | null;
  email: string | null;
  registroMtc: string | null;
  licencia: string | null;
  tituloHabilitante: string | null;
  resolucion: string | null;
  planManejo: string | null;
  arffs: string | null;
  representante: string | null;
  notas: string | null;
  activo: boolean;
  usos: number;
  ultimoUso: string | null;
  /** Data URL del logo, o null. Se usa en la cabecera de los documentos. */
  logo: string | null;
  adjuntos: AdjuntoParte[];
}

export interface Vehiculo {
  id: string;
  placa: string;
  /** Chapa del acoplado: la guía declara las dos unidades (ADR-373). */
  placaRemolque: string | null;
  marca: string | null;
  tipo: string | null;
  configuracion: string | null;
  capacidadM3: number | null;
  transportistaId: string | null;
  transportistaNombre: string | null;
  notas: string | null;
  activo: boolean;
  usos: number;
  ultimoUso: string | null;
}

/** Dirección de una parte en una línea, como va en la guía. */
export function direccionCompleta(p: Pick<Parte, "direccion" | "distrito" | "provincia" | "region">): string {
  return [p.direccion, p.distrito, p.provincia, p.region].filter(Boolean).join(", ");
}

/**
 * Qué le falta a la parte para poder usarse en una guía CON ese rol.
 *
 * No bloquea guardar (una libreta a medio llenar sigue sirviendo): es lo que la
 * UI muestra para que el operador sepa que ese destinatario todavía no alcanza
 * para imprimir.
 */
export function faltantesParaGuia(p: Parte, rol: RolParte): string[] {
  const faltan: string[] = [];
  if (!p.nombre) faltan.push("nombre");
  if (rol === "destinatario") {
    if (!p.docNumero) faltan.push("documento");
    if (!direccionCompleta(p)) faltan.push("dirección (es el punto de llegada)");
  }
  if (rol === "transportista" && !p.docNumero) faltan.push("documento");
  if (rol === "conductor" && !p.licencia) faltan.push("licencia de conducir");
  if (rol === "proveedor" && !p.docNumero) faltan.push("documento");
  return faltan;
}

/**
 * Ordena la libreta como la usa el operador: primero lo más usado, y a igualdad
 * lo más reciente. Alfabético sólo desempata — nadie busca "Zapata" antes que el
 * comprador de todos los martes.
 */
export function ordenarPorUso<T extends { usos: number; ultimoUso: string | null; nombre?: string; placa?: string }>(
  lista: T[],
): T[] {
  return [...lista].sort((a, b) => {
    if (b.usos !== a.usos) return b.usos - a.usos;
    const ta = a.ultimoUso ? Date.parse(a.ultimoUso) : 0;
    const tb = b.ultimoUso ? Date.parse(b.ultimoUso) : 0;
    if (tb !== ta) return tb - ta;
    return (a.nombre ?? a.placa ?? "").localeCompare(b.nombre ?? b.placa ?? "", "es");
  });
}

/**
 * Filtra la libreta con lo que el operador tipeó. Busca en nombre, documento y
 * —para vehículos— placa; sin tildes y sin importar dónde caiga el fragmento:
 * quien tipea "1234" está buscando el final de un RUC, no el principio.
 */
export function filtrarPartes(lista: Parte[], q: string): Parte[] {
  const k = claveBusqueda(q);
  if (!k) return lista;
  return lista.filter(
    (p) =>
      claveBusqueda(p.nombre).includes(k) ||
      (p.docNumero ?? "").toLowerCase().includes(k) ||
      claveBusqueda(p.tituloHabilitante ?? "").includes(k),
  );
}

export function filtrarVehiculos(lista: Vehiculo[], q: string): Vehiculo[] {
  const k = claveBusqueda(q);
  if (!k) return lista;
  return lista.filter(
    (v) =>
      normalizarPlaca(v.placa).toLowerCase().includes(normalizarPlaca(q).toLowerCase()) ||
      claveBusqueda(v.marca ?? "").includes(k) ||
      claveBusqueda(v.transportistaNombre ?? "").includes(k),
  );
}
