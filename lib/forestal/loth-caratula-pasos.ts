/**
 * Carátula del libro LO-TH en pasos cortos — la cuenta que sostiene el
 * formulario `LothCaratulaForm` y el «Completar» de la ficha del permiso.
 *
 * Por qué pasos: el formulario eran 16 campos en una columna y, medido en el
 * tenant real (2026-09-30), 0 carátulas cargadas. La mayoría de esos datos ya
 * existen en otro lado (el negocio, el plan de manejo activo), así que el
 * trabajo no es tipear sino confirmar.
 *
 * Reglas:
 *  · Un paso está COMPLETO cuando tiene lo que el libro imprime en cada hoja;
 *    el paso 4 (ubicación y contacto) es opcional y nunca cuenta como «falta».
 *  · Lo inválido (RUC con dígito verificador malo, DNI ≠ 8 dígitos, fecha futura)
 *    bloquea el guardado; el formato del título habilitante sólo AVISA, porque
 *    cada ARFFS numera distinto y un falso rojo enseña a ignorar la lista.
 *  · Guardar exige el titular (`titularName` es NOT NULL en la base) y nada más:
 *    lo demás se completa después.
 *  · «Hoy» es el día de Lima y las fechas date-only viajan como `AAAA-MM-DD`.
 *
 * PURA: sin fetch ni reloj propio (`hoy` entra por parámetro).
 */

import { rucValido } from "@/lib/documents/sunat-comprobante";
import { limaDateKey } from "@/lib/utils";
import type { Parte } from "@/lib/forestal/directorio";

/** Lo que el formulario edita (todo texto; la fecha como `AAAA-MM-DD`). */
export interface CaratulaValores {
  tituloHabilitante: string;
  resolucionNumber: string;
  resolucionDate: string;
  titularName: string;
  ruc: string;
  dni: string;
  representanteLegal: string;
  registroNumber: string;
  tomo: string;
  docGestionType: string;
  docGestionName: string;
  domicilio: string;
  departamento: string;
  provincia: string;
  distrito: string;
  telefono: string;
  email: string;
}

export type CampoCaratula = keyof CaratulaValores;
export type PasoCaratula = 1 | 2 | 3 | 4;

export interface InfoPaso {
  id: PasoCaratula;
  titulo: string;
  /** Cómo se llama en la barra de pasos cuando no hay lugar (400 px). */
  corto: string;
  opcional: boolean;
}

export const PASOS_CARATULA: readonly InfoPaso[] = [
  { id: 1, titulo: "Título habilitante y resolución", corto: "Título", opcional: false },
  { id: 2, titulo: "Titular", corto: "Titular", opcional: false },
  { id: 3, titulo: "Libro y documento de gestión", corto: "Libro", opcional: false },
  { id: 4, titulo: "Ubicación y contacto", corto: "Contacto", opcional: true },
] as const;

/** Ejemplo real de la barra del libro: lo que se ve en el título habilitante. */
export const EJEMPLO_TITULO = "10-HUA-PUE/PER-FMP-2026-007";

/** Qué campos pide cada paso para darse por completo, con el nombre que se le dice a la persona. */
const REQUISITOS: readonly { campo: CampoCaratula; texto: string; paso: PasoCaratula }[] = [
  { campo: "tituloHabilitante", texto: "el título habilitante", paso: 1 },
  { campo: "resolucionNumber", texto: "la resolución", paso: 1 },
  { campo: "resolucionDate", texto: "la fecha de la resolución", paso: 1 },
  { campo: "titularName", texto: "el titular", paso: 2 },
  { campo: "ruc", texto: "el RUC", paso: 2 },
  { campo: "registroNumber", texto: "el N° de registro del libro", paso: 3 },
  { campo: "tomo", texto: "el tomo", paso: 3 },
  { campo: "docGestionName", texto: "el documento de gestión", paso: 3 },
];

export const CAMPOS_PROPONIBLES = [
  "titularName",
  "ruc",
  "tituloHabilitante",
  "resolucionNumber",
  "resolucionDate",
  "docGestionType",
  "docGestionName",
  "domicilio",
  "telefono",
  "email",
] as const satisfies readonly CampoCaratula[];

const vacio = (v: unknown): boolean => v == null || (typeof v === "string" && !v.trim());

/** Sólo dígitos: el RUC y el DNI se pegan con espacios o guiones. */
export const soloDigitos = (v: string): string => v.replace(/\D/g, "");

/* ── Validaciones (null = sin reparo; vacío nunca es error: «falta» es otra cosa) ── */

/** RUC: 11 dígitos y dígito verificador (mismo validador que la factura). */
export function errorDeRuc(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return "El RUC lleva sólo números.";
  if (t.length !== 11) return `El RUC tiene 11 dígitos (llevas ${t.length}).`;
  return rucValido(t) ? null : "Este RUC no pasa el dígito verificador: revisa un número.";
}

/** DNI: exactamente 8 dígitos. */
export function errorDeDni(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return "El DNI lleva sólo números.";
  return t.length === 8 ? null : `El DNI tiene 8 dígitos (llevas ${t.length}).`;
}

/** La resolución no puede estar fechada en el futuro (día de Lima). */
export function errorDeFechaResolucion(v: string, hoy: string = limaDateKey()): string | null {
  const t = v.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(new Date(`${t}T00:00:00Z`).getTime())) return "La fecha no es válida.";
  return t > hoy ? "La resolución no puede tener fecha futura." : null;
}

/**
 * El título habilitante empieza con el código de la autoridad (2 cifras) y sigue
 * con letras, cifras, «/» y «-». Sólo AVISA: no bloquea.
 */
export function avisoDeTitulo(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return /^\d{2}-[A-Za-z0-9][A-Za-z0-9/\-. ]*$/.test(t) ? null : `Suele verse así: ${EJEMPLO_TITULO}`;
}

export type ErroresCaratula = Partial<Record<CampoCaratula, string>>;

/** Los reparos que BLOQUEAN el guardado. */
export function erroresDeCaratula(v: CaratulaValores, hoy?: string): ErroresCaratula {
  const out: ErroresCaratula = {};
  const ruc = errorDeRuc(v.ruc);
  if (ruc) out.ruc = ruc;
  const dni = errorDeDni(v.dni);
  if (dni) out.dni = dni;
  const fecha = errorDeFechaResolucion(v.resolucionDate, hoy);
  if (fecha) out.resolucionDate = fecha;
  return out;
}

/* ── Qué falta ─────────────────────────────────────────────────────────────── */

export interface FaltaCaratula {
  campo: CampoCaratula;
  texto: string;
  paso: PasoCaratula;
}

/** Lo que todavía no está cargado, en el orden de los pasos. El paso 4 nunca figura. */
export function queFalta(v: Partial<Record<CampoCaratula, unknown>> | null | undefined): FaltaCaratula[] {
  return REQUISITOS.filter((r) => vacio(v?.[r.campo])).map(({ campo, texto, paso }) => ({ campo, texto, paso }));
}

export interface EstadoPaso extends InfoPaso {
  completo: boolean;
  /** Campos que faltan o con error, dichos en castellano. */
  faltan: string[];
  conError: boolean;
}

export function estadoDePasos(v: CaratulaValores, hoy?: string): EstadoPaso[] {
  const faltas = queFalta(v);
  const errores = erroresDeCaratula(v, hoy);
  const erroresPorPaso = (p: PasoCaratula) =>
    (Object.keys(errores) as CampoCaratula[]).some((c) =>
      p === 1 ? c === "resolucionDate" : p === 2 ? c === "ruc" || c === "dni" : false,
    );
  return PASOS_CARATULA.map((p) => {
    const faltan = faltas.filter((f) => f.paso === p.id).map((f) => f.texto);
    const conError = erroresPorPaso(p.id);
    return { ...p, faltan, conError, completo: p.opcional ? false : faltan.length === 0 && !conError };
  });
}

/** El primer paso obligatorio que no está completo; con todo completo, el 1. */
export function primerPasoIncompleto(v: Partial<Record<CampoCaratula, unknown>> | null | undefined): PasoCaratula {
  return queFalta(v)[0]?.paso ?? 1;
}

/** «2 de 3 pasos listos» — los tres obligatorios; el opcional no suma ni resta. */
export function progresoDeCaratula(v: CaratulaValores, hoy?: string): { hechos: number; total: number; pct: number } {
  const obligatorios = estadoDePasos(v, hoy).filter((p) => !p.opcional);
  const hechos = obligatorios.filter((p) => p.completo).length;
  return { hechos, total: obligatorios.length, pct: Math.round((hechos / obligatorios.length) * 100) };
}

/** Se puede guardar con sólo el titular: lo demás se completa después. */
export function puedeGuardar(v: CaratulaValores, hoy?: string): boolean {
  return v.titularName.trim().length >= 2 && Object.keys(erroresDeCaratula(v, hoy)).length === 0;
}

/* ── Lo que el sistema ya sabe ─────────────────────────────────────────────── */

export interface NegocioPropuesto {
  nombre?: string | null;
  razonSocial?: string | null;
  ruc?: string | null;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
}

export interface PlanPropuesto {
  planType?: string | null;
  planNumber?: string | null;
  tituloHabilitante?: string | null;
  resolucionNumber?: string | null;
  /** ISO o `AAAA-MM-DD`. */
  resolucionDate?: string | null;
  titularName?: string | null;
}

export type OrigenPropuesta = "negocio" | "plan";
export type Propuestos = Partial<Record<CampoCaratula, OrigenPropuesta>>;

export const ETIQUETA_ORIGEN: Record<OrigenPropuesta, string> = {
  negocio: "Propuesto de los datos del negocio",
  plan: "Propuesto del plan de manejo activo",
};

/** Lo mismo, para la marca al lado de la etiqueta (entra en 400 px). */
export const ETIQUETA_ORIGEN_CORTA: Record<OrigenPropuesta, string> = {
  negocio: "Propuesto del negocio",
  plan: "Propuesto del plan",
};

const limpio = (v: string | null | undefined): string => (v ?? "").trim();

/** `AAAA-MM-DD` de una fecha date-only (ISO o ya la clave), leída en UTC. */
export function claveDeFecha(v: string | Date | null | undefined): string {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Rellena SÓLO lo vacío con lo que el plan activo y el negocio ya saben, y dice
 * de dónde salió cada dato. El plan manda en lo suyo (título, resolución,
 * documento de gestión); el negocio en lo del titular (nombre, RUC, contacto).
 * Nunca pisa lo que la persona o la carátula ya tenían.
 */
export function proponerCaratula(
  actual: CaratulaValores,
  negocio: NegocioPropuesto | null | undefined,
  plan: PlanPropuesto | null | undefined,
): { valores: CaratulaValores; propuestos: Propuestos } {
  const valores = { ...actual };
  const propuestos: Propuestos = {};
  const poner = (campo: CampoCaratula, dato: string | null | undefined, origen: OrigenPropuesta) => {
    const nuevo = limpio(dato);
    if (!nuevo || !vacio(valores[campo])) return;
    valores[campo] = nuevo;
    propuestos[campo] = origen;
  };

  poner("tituloHabilitante", plan?.tituloHabilitante, "plan");
  poner("resolucionNumber", plan?.resolucionNumber, "plan");
  poner("resolucionDate", claveDeFecha(plan?.resolucionDate), "plan");

  if (vacio(valores.titularName)) {
    if (limpio(plan?.titularName)) poner("titularName", plan?.titularName, "plan");
    else poner("titularName", negocio?.razonSocial ?? negocio?.nombre, "negocio");
  }
  poner("ruc", soloDigitos(limpio(negocio?.ruc)), "negocio");

  const tipo = limpio(plan?.planType).toUpperCase();
  if (tipo === "PO" || tipo === "PMFI" || tipo === "DEMA") {
    // El tipo arranca en «PO» por default: eso no es un dato cargado.
    if (vacio(actual.docGestionName)) {
      valores.docGestionType = tipo;
      propuestos.docGestionType = "plan";
    }
  }
  poner("docGestionName", plan?.planNumber, "plan");

  poner("domicilio", negocio?.direccion, "negocio");
  poner("telefono", negocio?.telefono, "negocio");
  poner("email", negocio?.email, "negocio");
  return { valores, propuestos };
}

/** La carátula tal como la devuelve `/loth/caratula` (lo que el formulario lee). */
export interface CaratulaGuardada {
  id: string;
  registroNumber: string | null;
  tomo: string | null;
  titularName: string;
  representanteLegal?: string | null;
  tituloHabilitante: string | null;
  ruc?: string | null;
  dni?: string | null;
  domicilio?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  telefono?: string | null;
  email?: string | null;
  docGestionType?: string | null;
  docGestionName?: string | null;
  resolucionNumber?: string | null;
  resolucionDate?: string | Date | null;
}

/** Los valores con que arranca el formulario (vacíos si la carátula no existe). */
export function valoresDeCaratula(c: CaratulaGuardada | null): CaratulaValores {
  return {
    tituloHabilitante: c?.tituloHabilitante ?? "",
    resolucionNumber: c?.resolucionNumber ?? "",
    resolucionDate: claveDeFecha(c?.resolucionDate),
    titularName: c?.titularName ?? "",
    ruc: c?.ruc ?? "",
    dni: c?.dni ?? "",
    representanteLegal: c?.representanteLegal ?? "",
    registroNumber: c?.registroNumber ?? "",
    tomo: c?.tomo ?? "",
    // «PO» y «Ucayali» son el arranque de siempre, no datos cargados.
    docGestionType: c?.docGestionType ?? "PO",
    docGestionName: c?.docGestionName ?? "",
    domicilio: c?.domicilio ?? "",
    departamento: c?.departamento ?? "Ucayali",
    provincia: c?.provincia ?? "",
    distrito: c?.distrito ?? "",
    telefono: c?.telefono ?? "",
    email: c?.email ?? "",
  };
}

/**
 * Del Directorio (`ForestParty`): el titular ya tiene RUC, domicilio y título
 * escritos ahí, y escribirlos dos veces es cómo «Maderera El Aguajal SAC» y
 * «MADERERA EL AGUAJAL S.A.C.» terminan siendo dos titulares. Rellena sólo lo
 * vacío (el departamento «Ucayali» de arranque cuenta como vacío); el nombre
 * del titular sí se reemplaza, porque es lo que se eligió.
 */
export function completarDesdeDirectorio(prev: CaratulaValores, p: Parte): CaratulaValores {
  const sinPisar = (actual: string, nuevo: string | null | undefined) => (actual.trim() ? actual : (nuevo ?? ""));
  return {
    ...prev,
    titularName: p.nombre || prev.titularName,
    representanteLegal: sinPisar(prev.representanteLegal, p.representante),
    ruc: sinPisar(prev.ruc, p.docTipo === "RUC" ? p.docNumero : null),
    dni: sinPisar(prev.dni, p.representanteDni ?? (p.docTipo === "DNI" ? p.docNumero : null)),
    tituloHabilitante: sinPisar(prev.tituloHabilitante, p.tituloHabilitante),
    resolucionNumber: sinPisar(prev.resolucionNumber, p.resolucion),
    domicilio: sinPisar(prev.domicilio, p.direccion),
    departamento: sinPisar(prev.departamento === "Ucayali" ? "" : prev.departamento, p.region) || prev.departamento,
    provincia: sinPisar(prev.provincia, p.provincia),
    distrito: sinPisar(prev.distrito, p.distrito),
    telefono: sinPisar(prev.telefono, p.telefono ?? p.whatsapp),
    email: sinPisar(prev.email, p.email),
  };
}
