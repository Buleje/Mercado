/**
 * lib/planificacion/secciones.ts — el plan de la empresa (ADR-497), sección por
 * sección.
 *
 * Cada sección es UN documento (`PlanEmpresaSeccion.datos`) que se guarda
 * entero y lleva su `version` para no pisar lo que otro guardó en paralelo.
 * Este archivo es el contrato único: lo usan la ruta (valida con `safeParse`),
 * la clase DB, el hook del cliente y cada vista. Puro: sin server-only.
 *
 * Una sección vacía no existe en la base: se lee como `vacia(seccion)`.
 */
import { z } from "zod";

// ── Piezas comunes ───────────────────────────────────────────────────────────

const id = z.string().min(1).max(40);
const corto = z.string().trim().max(160);
const medio = z.string().trim().max(600);
const largo = z.string().trim().max(4000);
/** Fecha sin hora, `AAAA-MM-DD`, o vacío. */
const fecha = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]);
const soles = z.number().min(0).max(1_000_000_000);
const lista = <T extends z.ZodTypeAny>(item: T, max = 200) => z.array(item).max(max);
/**
 * Enlace que el panel abre (`window.open`) o pinta (`src`/`href`): http(s) o ruta
 * propia «/…». Corta `javascript:` y `data:` que guarde quien edita (revisión security ADR-497).
 */
const esEnlaceSeguro = (v: string) => /^https?:\/\//i.test(v) || /^\/(?![/\\])/.test(v);
const MSG_ENLACE = "El enlace tiene que empezar con https:// o /";

// ── Empresa ──────────────────────────────────────────────────────────────────

export const TIPOS_SOCIEDAD = [
  "Persona natural con negocio",
  "EIRL",
  "SAC",
  "SACS",
  "SRL",
  "SA",
  "Asociación",
  "Cooperativa",
  "Otra",
] as const;

export const REGIMENES_TRIBUTARIOS = ["NRUS", "RER", "MYPE Tributario", "Régimen General", "No sé todavía"] as const;

/** Lo que no está en Configuración: nombre, RUC, logo, teléfono y dirección se leen del membrete. */
export const fichaSchema = z.object({
  razonSocial: corto.default(""),
  nombreComercial: corto.default(""),
  tipoSociedad: z.union([z.enum(TIPOS_SOCIEDAD), z.literal("")]).default(""),
  regimenTributario: z.union([z.enum(REGIMENES_TRIBUTARIOS), z.literal("")]).default(""),
  /** Rubro en palabras («bodega y minimarket», «aserradero»). */
  rubro: corto.default(""),
  /** Cómo vende: tienda física, delivery, mayorista, servicio… */
  tipoNegocio: corto.default(""),
  /** Código CIIU de la ficha RUC (opcional). */
  ciiu: z.string().trim().max(10).default(""),
  fechaInicio: fecha.default(""),
  horario: corto.default(""),
  correo: corto.default(""),
  redes: medio.default(""),
  descripcion: largo.default(""),
});

export const valorSchema = z.object({ id, nombre: corto, descripcion: medio.default("") });

export const identidadSchema = z.object({
  mision: largo.default(""),
  vision: largo.default(""),
  valores: lista(valorSchema, 20).default([]),
  propuestaValor: largo.default(""),
  clienteIdeal: largo.default(""),
  diferenciadores: largo.default(""),
  lema: corto.default(""),
});

/** Los 9 bloques del lienzo del modelo de negocio, cada uno una lista de notas cortas. */
export const BLOQUES_LIENZO = [
  "sociosClave",
  "actividadesClave",
  "recursosClave",
  "propuestaValor",
  "relacionClientes",
  "canales",
  "segmentos",
  "costos",
  "ingresos",
] as const;
export type BloqueLienzo = (typeof BLOQUES_LIENZO)[number];

const notasLienzo = lista(z.object({ id, texto: medio }), 30).default([]);
export const lienzoSchema = z.object(
  Object.fromEntries(BLOQUES_LIENZO.map((b) => [b, notasLienzo])) as Record<BloqueLienzo, typeof notasLienzo>,
);

export const licenciaSchema = z.object({
  id,
  nombre: corto,
  /** Quién la da: SUNAT, municipalidad, DIGESA, SERFOR… */
  entidad: corto.default(""),
  numero: corto.default(""),
  emitida: fecha.default(""),
  /** Vacío = no vence (el RUC, por ejemplo). */
  vence: fecha.default(""),
  /** `pendiente` = todavía no se tramita. */
  tramitada: z.boolean().default(true),
  nota: medio.default(""),
  /** Foto o PDF del papel (subido con /api/upload o un enlace del Drive). */
  archivoUrl: z.string().trim().max(600).refine((v) => v === "" || esEnlaceSeguro(v), MSG_ENLACE).default(""),
});
export const licenciasSchema = z.object({ items: lista(licenciaSchema, 80).default([]) });

// ── Socios e inversión (sensibles: sólo admin y dueño) ──────────────────────

export const TIPOS_APORTE = ["efectivo", "bienes", "trabajo", "mixto"] as const;

export const socioSchema = z.object({
  id,
  nombre: corto,
  /** DNI, CE o RUC. */
  documento: z.string().trim().max(20).default(""),
  cargo: corto.default(""),
  aporte: soles.default(0),
  tipoAporte: z.enum(TIPOS_APORTE).default("efectivo"),
  /** `null` = se reparte según el aporte. */
  porcentaje: z.number().min(0).max(100).nullable().default(null),
  fechaIngreso: fecha.default(""),
  telefono: z.string().trim().max(30).default(""),
  nota: medio.default(""),
});
export const sociosSchema = z.object({ items: lista(socioSchema, 50).default([]) });

export const CATEGORIAS_INVERSION = [
  "Local y adecuación",
  "Equipos y muebles",
  "Mercadería inicial",
  "Trámites y licencias",
  "Publicidad y lanzamiento",
  "Capital de trabajo",
  "Vehículos",
  "Otro",
] as const;

export const inversionItemSchema = z.object({
  id,
  concepto: corto,
  categoria: z.enum(CATEGORIAS_INVERSION).default("Otro"),
  monto: soles,
  /** `socio:<id>`, `prestamo`, `propio` u `otro`. */
  fuente: z.string().trim().max(60).default("propio"),
  fecha: fecha.default(""),
  nota: medio.default(""),
});
export const inversionSchema = z.object({
  items: lista(inversionItemSchema, 200).default([]),
  /** Cuánto planeas ganar al mes para recuperarla (lo que tú estimas). */
  gananciaMensualEsperada: soles.nullable().default(null),
});

// ── FODA y estrategias ──────────────────────────────────────────────────────

export const IMPACTOS = ["alto", "medio", "bajo"] as const;
export const CUADRANTES_FODA = ["fortalezas", "oportunidades", "debilidades", "amenazas"] as const;
export type CuadranteFoda = (typeof CUADRANTES_FODA)[number];

export const itemFodaSchema = z.object({ id, texto: medio, impacto: z.enum(IMPACTOS).default("medio") });
const cuadrante = lista(itemFodaSchema, 40).default([]);
export const fodaSchema = z.object({
  fortalezas: cuadrante,
  oportunidades: cuadrante,
  debilidades: cuadrante,
  amenazas: cuadrante,
});

/** FO = usar fortalezas para oportunidades · FA = fortalezas contra amenazas · DO = corregir debilidades con oportunidades · DA = defenderse. */
export const TIPOS_ESTRATEGIA = ["FO", "FA", "DO", "DA"] as const;
export const ESTADOS_ESTRATEGIA = ["idea", "en-curso", "hecha", "descartada"] as const;

export const estrategiaSchema = z.object({
  id,
  tipo: z.enum(TIPOS_ESTRATEGIA),
  texto: medio,
  /** Ids de los puntos del FODA que cruza. */
  usa: lista(id, 12).default([]),
  estado: z.enum(ESTADOS_ESTRATEGIA).default("idea"),
  /** El objetivo que la lleva a la práctica, si se creó. */
  objetivoId: z.string().max(40).default(""),
});
export const estrategiasSchema = z.object({ items: lista(estrategiaSchema, 80).default([]) });

// ── Objetivos y plan ────────────────────────────────────────────────────────

export const PLAZOS = ["corto", "mediano", "largo"] as const;
export const ESTADOS_OBJETIVO = ["por-empezar", "en-curso", "hecho", "pausado"] as const;

export const accionSchema = z.object({
  id,
  texto: medio,
  hecha: z.boolean().default(false),
  fecha: fecha.default(""),
  responsable: corto.default(""),
  /** Id de la tarea creada en «Tareas del equipo» al pasarla; vacío = no se pasó. */
  tareaId: z.string().trim().max(60).default(""),
});

export const objetivoSchema = z.object({
  id,
  titulo: corto,
  area: corto.default(""),
  plazo: z.enum(PLAZOS).default("corto"),
  inicio: fecha.default(""),
  fin: fecha.default(""),
  responsable: corto.default(""),
  /** Cómo se sabe que se logró («ventas del mes», «clientes nuevos»). */
  indicador: corto.default(""),
  /** La cifra a la que se quiere llegar, en palabras («S/ 30 000», «50 clientes»). */
  meta: corto.default(""),
  /** 0-100 escrito a mano; `null` = sale de las acciones hechas. */
  avance: z.number().int().min(0).max(100).nullable().default(null),
  estado: z.enum(ESTADOS_OBJETIVO).default("por-empezar"),
  estrategiaId: z.string().max(40).default(""),
  acciones: lista(accionSchema, 60).default([]),
  nota: medio.default(""),
});
export const objetivosSchema = z.object({ items: lista(objetivoSchema, 100).default([]) });

// ── Organización y espacios ─────────────────────────────────────────────────

export const areaSchema = z.object({ id, nombre: corto });
export const cargoSchema = z.object({
  id,
  nombre: corto,
  areaId: z.string().max(40).default(""),
  /** Id del cargo al que reporta; vacío = la cabeza. */
  reportaA: z.string().max(40).default(""),
  /** Quién lo ocupa (texto libre o el nombre del colaborador). */
  persona: corto.default(""),
  funciones: lista(medio, 30).default([]),
});
export const organizacionSchema = z.object({
  areas: lista(areaSchema, 30).default([]),
  cargos: lista(cargoSchema, 120).default([]),
});

export const TIPOS_ESPACIO = ["local", "almacén", "oficina", "patio", "parcela", "campo", "otro"] as const;
export const UNIDADES_AREA = ["m²", "ha"] as const;

export const croquisSchema = z.object({ id, titulo: corto, url: z.string().trim().min(1).max(600).refine(esEnlaceSeguro, MSG_ENLACE), nota: medio.default("") });
export const zonaSchema = z.object({
  id,
  nombre: corto,
  tipo: z.enum(TIPOS_ESPACIO).default("local"),
  area: z.number().min(0).max(100_000_000).nullable().default(null),
  unidad: z.enum(UNIDADES_AREA).default("m²"),
  uso: medio.default(""),
  responsable: corto.default(""),
  nota: medio.default(""),
});
export const espaciosSchema = z.object({
  croquis: lista(croquisSchema, 20).default([]),
  zonas: lista(zonaSchema, 100).default([]),
});

// ── Políticas y atención ────────────────────────────────────────────────────

export const CATEGORIAS_POLITICA = [
  "Atención al cliente",
  "Cambios y devoluciones",
  "Precios y descuentos",
  "Crédito y fiado",
  "Pagos",
  "Delivery",
  "Horario",
  "Personal",
  "Seguridad e higiene",
  "Proveedores",
  "Otra",
] as const;

export const politicaSchema = z.object({
  id,
  categoria: z.enum(CATEGORIAS_POLITICA).default("Otra"),
  titulo: corto,
  texto: largo.default(""),
  vigenteDesde: fecha.default(""),
  /** Cuándo revisarla de nuevo. */
  revisar: fecha.default(""),
});
export const pasoAtencionSchema = z.object({ id, paso: corto, detalle: medio.default("") });
export const preguntaSchema = z.object({ id, pregunta: medio, respuesta: largo.default("") });
export const politicasSchema = z.object({
  items: lista(politicaSchema, 80).default([]),
  protocolo: lista(pasoAtencionSchema, 30).default([]),
  preguntas: lista(preguntaSchema, 60).default([]),
});

// ── Registro de secciones ───────────────────────────────────────────────────

export const SCHEMAS_SECCION = {
  ficha: fichaSchema,
  identidad: identidadSchema,
  lienzo: lienzoSchema,
  licencias: licenciasSchema,
  socios: sociosSchema,
  inversion: inversionSchema,
  foda: fodaSchema,
  estrategias: estrategiasSchema,
  objetivos: objetivosSchema,
  organizacion: organizacionSchema,
  espacios: espaciosSchema,
  politicas: politicasSchema,
} as const;

export type SeccionPlan = keyof typeof SCHEMAS_SECCION;
export const SECCIONES_PLAN = Object.keys(SCHEMAS_SECCION) as SeccionPlan[];
export type DatosSeccion<S extends SeccionPlan> = z.infer<(typeof SCHEMAS_SECCION)[S]>;
export type DatosPlan = { [S in SeccionPlan]: DatosSeccion<S> };

/** Plata y documentos de identidad de los socios: sólo admin y dueño los leen o cambian. */
export const SECCIONES_SENSIBLES: ReadonlySet<SeccionPlan> = new Set<SeccionPlan>(["socios", "inversion"]);

export const NOMBRE_SECCION: Record<SeccionPlan, string> = {
  ficha: "Ficha de la empresa",
  identidad: "Misión, visión y valores",
  lienzo: "Modelo de negocio",
  licencias: "Papeles y licencias",
  socios: "Socios",
  inversion: "Inversión inicial",
  foda: "FODA",
  estrategias: "Estrategias",
  objetivos: "Objetivos y plan",
  organizacion: "Organigrama",
  espacios: "Espacios y croquis",
  politicas: "Políticas y atención",
};

export function esSeccionPlan(v: string): v is SeccionPlan {
  return Object.prototype.hasOwnProperty.call(SCHEMAS_SECCION, v);
}

/** La sección sin nada escrito (todos los defaults). */
export function vacia<S extends SeccionPlan>(seccion: S): DatosSeccion<S> {
  return SCHEMAS_SECCION[seccion].parse({}) as DatosSeccion<S>;
}

/**
 * Lee lo guardado con tolerancia: si un campo nuevo no existía cuando se guardó,
 * toma su default; si el documento está roto, vuelve vacía (nunca tira).
 */
export function leerSeccion<S extends SeccionPlan>(seccion: S, datos: unknown): DatosSeccion<S> {
  const r = SCHEMAS_SECCION[seccion].safeParse(datos ?? {});
  return r.success ? (r.data as DatosSeccion<S>) : vacia(seccion);
}

// ── Lo que viaja por la API ─────────────────────────────────────────────────

export interface SeccionGuardada<S extends SeccionPlan = SeccionPlan> {
  datos: DatosSeccion<S>;
  /** 0 = nunca se guardó. */
  version: number;
  actualizado: string | null;
  autor: string | null;
}

/** GET /api/admin/planificacion */
export interface PlanEmpresaRespuesta {
  secciones: Partial<{ [S in SeccionPlan]: SeccionGuardada<S> }>;
  /** Secciones que este rol no puede ver (vienen fuera de `secciones`). */
  ocultas: SeccionPlan[];
  /** El rol puede escribir (todas las que ve). */
  puedeEditar: boolean;
  /** Nombre, RUC, logo, teléfono y dirección: viven en Configuración. */
  membrete: { nombre: string | null; ruc: string | null; logoUrl: string | null; telefono: string | null; direccion: string | null };
}

/** PUT /api/admin/planificacion/[seccion] — `version` = la que se editó. */
export const guardarSeccionSchema = z.object({
  version: z.number().int().min(0),
  datos: z.unknown(),
});

/** 409: otro guardó primero; viene lo que hay ahora. */
export interface ConflictoSeccion<S extends SeccionPlan = SeccionPlan> {
  error: string;
  code: "cambio_en_paralelo";
  actual: SeccionGuardada<S>;
}

/** Una fila del historial de una sección. */
export interface VersionSeccion {
  version: number;
  autor: string;
  creado: string;
}
