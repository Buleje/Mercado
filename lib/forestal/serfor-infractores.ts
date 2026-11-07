/**
 * serfor-infractores — ¿el titular de un permiso figura en el Registro Nacional
 * de Infractores en materia forestal y de fauna silvestre (SERFOR)?
 *
 * Fuente: datos abiertos del Estado (datosabiertos.gob.pe, conjunto «Registro
 * Nacional de Infractores…»), un CSV público sin clave que SERFOR vuelve a subir
 * con otro número (INFRACTORES_<n>.csv). Junta las sanciones firmes de las
 * ARFFS, OSINFOR, SERNANP y SERFOR.
 *
 * Medido 04-11-2026 (INFRACTORES_202.csv, «Fecha modificada» 13-10-2026):
 * 6.303 filas, 4.658 documentos distintos, resoluciones hasta el 15-07-2026
 * (1.415 de 2025). 752 filas sin documento (solo nombre), 2.008 con título
 * habilitante. Hay celdas partidas con un salto de línea dentro de comillas
 * («17-TAM/C-OPB-A-⏎020-05», «AGROFORESTAL COLPA⏎S.A.C.») y fechas
 * «01/01/1900» de relleno.
 *
 * Cómo se compara (de más a menos seguro):
 *   1. DOCUMENTO: DNI (8) o RUC (11). Un RUC de persona natural (10 + DNI + dígito)
 *      es la misma persona que su DNI.
 *   2. PERMISO: el título habilitante, sin espacios ni saltos de línea.
 *   3. NOMBRE: mismas palabras en cualquier orden (≥ 2), sin tildes ni puntos.
 *      Si las dos partes tienen documento y no coincide, es un homónimo y NO cuenta.
 *
 * PURO y client-safe (sin fetch, sin Date.now).
 */

import { parsearCsv } from "@/lib/documentos/hoja-calculo";

export const ENLACE_REGISTRO_INFRACTORES =
  "https://www.datosabiertos.gob.pe/dataset/registro-nacional-de-infractores-en-materia-forestal-y-de-fauna-silvestre-serfor";

/** Una sanción tal como la publica SERFOR, ya limpia. */
export interface SancionSerfor {
  infractor: string;
  /** Solo dígitos (DNI 8 o RUC 11); null si no lo publica o no es un documento. */
  documento: string | null;
  /** Título habilitante sin espacios; null si no lo publica. */
  tituloHab: string | null;
  resolucion: string;
  /** YYYY-MM-DD; null si no la publica. */
  fecha: string | null;
  /** ARFFS · OSINFOR · SERNANP · SERFOR. */
  organo: string | null;
  /** Dónde: «GORE UCAYALI», «ATFFS SELVA CENTRAL»… */
  ambito: string | null;
}

/** «permiso_otro» = el permiso tiene una sanción, pero a nombre de OTRA persona (ex titular, socio). */
export type MotivoCoincidencia = "documento" | "permiso" | "permiso_otro" | "nombre";

export interface CoincidenciaInfractor extends SancionSerfor {
  motivo: MotivoCoincidencia;
}

export interface BusquedaInfractor {
  documento?: string | null;
  nombre?: string | null;
  codigo?: string | null;
}

export interface ResumenInfractores {
  /**
   * «segura» = por su documento o por el permiso (sin otro dueño a la vista) · «del_permiso» = el
   * permiso tiene sanciones a otras personas · «por_nombre» = mismo nombre, hay que confirmar ·
   * «ninguna» = se buscó y no está · «sin_datos» = no había con qué buscar (nunca se pinta de verde).
   */
  certeza: "segura" | "del_permiso" | "por_nombre" | "ninguna" | "sin_datos";
  titulo: string;
  detalle: string;
  /** Las más nuevas primero (tope `MAX_COINCIDENCIAS`). */
  coincidencias: CoincidenciaInfractor[];
  total: number;
  /** Fecha de la lista de SERFOR que se usó (YYYY-MM-DD), o null si no se sabe. */
  corte: string | null;
  /** Con qué se buscó, para decirlo en la pantalla. */
  buscadoPor: ("documento" | "permiso" | "nombre")[];
}

export const MAX_COINCIDENCIAS = 20;

/** Quita tildes y pasa a mayúsculas. */
function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

/**
 * DNI (8) o RUC (11) en dígitos; cualquier otra cosa no es un documento comparable. Medido en el
 * CSV: «Partida N°12600025» (no es un DNI), «ce 003608864» (carné de extranjería), «00000000000»
 * de relleno y DNI de 7 dígitos con el cero de adelante perdido.
 */
export function documentoDe(crudo: string | null | undefined): string | null {
  const s = (crudo ?? "").trim();
  // Letras = otra cosa (partida, CE…), salvo que digan qué documento es.
  if (/[A-Za-z]/.test(s.replace(/^(D\.?N\.?I\.?|R\.?U\.?C\.?)\s*:?/i, ""))) return null;
  let d = s.replace(/\D/g, "");
  if (d.length === 7) d = `0${d}`;
  if (d.length !== 8 && d.length !== 11) return null;
  return /^(\d)\1+$/.test(d) ? null : d;
}

/** La persona detrás del documento: un RUC 10 de persona natural lleva su DNI adentro. */
export function personaDelDocumento(doc: string): string {
  return doc.length === 11 && doc.startsWith("10") ? doc.slice(2, 10) : doc;
}

/** Código de permiso comparable: mayúsculas, sin espacios ni saltos de línea. */
export function codigoComparable(crudo: string | null | undefined): string | null {
  const c = sinTildes(crudo ?? "").replace(/\s+/g, "");
  return c.length >= 5 ? c : null;
}

/**
 * Nombre comparable: palabras sin tildes ni signos, ordenadas (el padrón escribe
 * «SHARIHUA CAPATAZ, GERMAN» y otro papel «GERMAN SHARIHUA CAPATAZ»). «S.A.C.» y
 * «SAC» quedan iguales. Menos de 2 palabras no alcanza para decir que es la misma.
 */
export function nombreComparable(crudo: string | null | undefined): string | null {
  const palabras = sinTildes(crudo ?? "")
    .replace(/\./g, "")
    .replace(/[^A-Z0-9Ñ]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const unicas = [...new Set(palabras)].sort();
  return unicas.length >= 2 ? unicas.join(" ") : null;
}

/** «31/01/2022» → «2022-01-31»; el relleno «01/01/1900» y lo que no es fecha → null. */
export function fechaIso(crudo: string | null | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((crudo ?? "").trim());
  if (!m) return null;
  const [, d, mes, a] = m;
  if (Number(a) < 1990) return null;
  return `${a}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Texto del CSV → sanciones limpias. Ubica las columnas por su nombre, no por su lugar. */
export function parsearInfractores(texto: string): SancionSerfor[] {
  const filas = parsearCsv(texto.replace(/^﻿/, ""));
  const cab = (filas[0] ?? []).map((c) => sinTildes(c).trim());
  const col = (nombre: string) => cab.indexOf(nombre.toUpperCase());
  const iNombre = col("Infractor");
  const iDoc = col("DocumentoIdentidad");
  const iTitulo = col("tituloHab");
  const iRes = col("Resolucion");
  const iFecha = col("FechaResolucion");
  const iOrgano = col("OrganoSancionador");
  const iAmbito = col("AmbitoInfraccion");
  if (iNombre < 0 || iRes < 0) return [];

  const celda = (f: string[], i: number) => (i >= 0 ? (f[i] ?? "").replace(/\s+/g, " ").trim() : "");
  const out: SancionSerfor[] = [];
  for (const f of filas.slice(1)) {
    const infractor = celda(f, iNombre);
    // Sin número de resolución igual es una sanción publicada: se conserva.
    const resolucion = celda(f, iRes) || "sin número de resolución";
    if (!infractor) continue;
    out.push({
      infractor,
      documento: documentoDe(celda(f, iDoc)),
      // El código se parte en dos líneas dentro de la celda: se junta sin espacios.
      tituloHab: iTitulo >= 0 ? codigoComparable(f[iTitulo]) : null,
      resolucion,
      fecha: fechaIso(celda(f, iFecha)),
      organo: celda(f, iOrgano) || null,
      ambito: celda(f, iAmbito) || null,
    });
  }
  return out;
}

/**
 * La misma sanción llega dos veces con el número escrito distinto («RD N 00692-2021-OSINFOR-08.2»
 * y «00692-2021-OSINFOR/08.2», medido 04-11) y el nombre en otro orden: se junta por
 * número-año de la resolución + la persona.
 */
export function clavesDeSancion(s: SancionSerfor): string[] {
  const numeroAnio = /\d{3,6}-\d{4}/.exec(s.resolucion)?.[0];
  // Sin número-año («035», «11»): el número solo no alcanza; va con la fecha y el permiso.
  const numero = numeroAnio ?? `${sinTildes(s.resolucion).replace(/[^A-Z0-9]/g, "")}|${s.fecha ?? ""}|${s.tituloHab ?? ""}`;
  const nombre = nombreComparable(s.infractor) ?? s.infractor;
  // La misma sanción publicada una vez con documento y otra sin él: cualquiera de las dos claves la junta.
  return [`${numero}|n:${nombre}`, ...(s.documento ? [`${numero}|d:${personaDelDocumento(s.documento)}`] : [])];
}

/**
 * El nombre comparable de cada sanción, calculado una vez por fila (04-11): «Revisar a todos»
 * busca cada ficha contra las 6.303 filas y antes lo recalculaba en cada búsqueda (600 búsquedas
 * = 2,1 s con el hilo trabado, medido por el revisor). La lista vive en caché, así que se reusa.
 */
const nombrePorSancion = new WeakMap<SancionSerfor, string | null>();
function nombreDeSancion(s: SancionSerfor): string | null {
  let n = nombrePorSancion.get(s);
  if (n === undefined) {
    n = nombreComparable(s.infractor);
    nombrePorSancion.set(s, n);
  }
  return n;
}

/** Busca al titular en la lista. `corte` es la fecha de la lista (se muestra tal cual). */
export function buscarInfractor(
  sanciones: SancionSerfor[],
  busqueda: BusquedaInfractor,
  corte: string | null = null,
): ResumenInfractores {
  const doc = documentoDe(busqueda.documento);
  const persona = doc ? personaDelDocumento(doc) : null;
  const codigo = codigoComparable(busqueda.codigo);
  const nombre = nombreComparable(busqueda.nombre);
  const buscadoPor: ResumenInfractores["buscadoPor"] = [
    ...(persona ? (["documento"] as const) : []),
    ...(codigo ? (["permiso"] as const) : []),
    ...(nombre ? (["nombre"] as const) : []),
  ];

  // Primero todas las candidatas con su motivo, ordenadas por fuerza; RECIÉN después se quita la repetida:
  // si no, la misma sanción llegada antes por el nombre tapa a la que llega por el documento y la certeza
  // depende del orden de la lista.
  const peso: Record<MotivoCoincidencia, number> = { documento: 0, permiso: 1, permiso_otro: 2, nombre: 3 };
  const candidatas: CoincidenciaInfractor[] = [];
  for (const s of sanciones) {
    let motivo: MotivoCoincidencia | null = null;
    const suPersona = s.documento ? personaDelDocumento(s.documento) : null;
    // Otro documento de la MISMA clase (DNI con DNI, RUC con RUC) = otra persona. Un DNI contra
    // un RUC 20 no prueba nada: hay asociaciones publicadas con el DNI de su representante.
    const otraPersona = persona != null && suPersona != null && suPersona.length === persona.length && suPersona !== persona;
    if (persona && suPersona === persona) motivo = "documento";
    else if (codigo && s.tituloHab === codigo) motivo = otraPersona ? "permiso_otro" : "permiso";
    else if (nombre && !otraPersona && nombreDeSancion(s) === nombre) motivo = "nombre";
    if (motivo) candidatas.push({ ...s, motivo });
  }
  candidatas.sort(
    (a, b) =>
      peso[a.motivo] - peso[b.motivo] ||
      (b.fecha ?? "").localeCompare(a.fecha ?? "") ||
      a.resolucion.localeCompare(b.resolucion) ||
      a.infractor.localeCompare(b.infractor),
  );

  const vistas = new Set<string>();
  const coincidencias: CoincidenciaInfractor[] = [];
  for (const c of candidatas) {
    const claves = clavesDeSancion(c);
    if (claves.some((k) => vistas.has(k))) continue;
    for (const k of claves) vistas.add(k);
    coincidencias.push(c);
  }

  const cuenta = (m: MotivoCoincidencia[]) => coincidencias.filter((c) => m.includes(c.motivo)).length;
  const seguras = cuenta(["documento", "permiso"]);
  const delPermiso = cuenta(["permiso_otro"]);
  const certeza: ResumenInfractores["certeza"] =
    buscadoPor.length === 0
      ? "sin_datos"
      : seguras > 0
        ? "segura"
        : delPermiso > 0
          ? "del_permiso"
          : coincidencias.length > 0
            ? "por_nombre"
            : "ninguna";
  const n = certeza === "segura" ? seguras : certeza === "del_permiso" ? delPermiso : coincidencias.length;
  const cuantas = n === 1 ? "1 sanción" : `${n} sanciones`;
  const POR: Record<ResumenInfractores["buscadoPor"][number], string> = {
    documento: "su RUC/DNI",
    permiso: "el código del permiso",
    nombre: "su nombre",
  };
  const conQue = buscadoPor.map((b) => POR[b]).join(", ");
  const TITULO: Record<ResumenInfractores["certeza"], string> = {
    segura: `Figura en el Registro de Infractores de SERFOR: ${cuantas}`,
    del_permiso: `El permiso tiene sanciones a otras personas (${cuantas})`,
    por_nombre: `Alguien con el mismo nombre figura en el Registro de Infractores (${cuantas})`,
    ninguna: "No figura en el Registro de Infractores de SERFOR",
    sin_datos: "No se pudo buscar en SERFOR: falta el RUC/DNI o el nombre",
  };
  const DETALLE: Record<ResumenInfractores["certeza"], string> = {
    segura:
      "Coincide su documento o el código del permiso con una sanción firme (ARFFS, OSINFOR, SERNANP o SERFOR). Lee la resolución antes de comprarle.",
    del_permiso:
      "El código del permiso aparece en sanciones a nombre de otra persona (por ejemplo un titular anterior). Lee la resolución para saber si el permiso quedó afectado.",
    por_nombre: "Solo coincide el nombre: puede ser otra persona. Compara el DNI o RUC de la resolución con el de tu proveedor.",
    ninguna: `Se buscó por ${conQue} y no aparece en la lista pública de SERFOR.`,
    sin_datos: "Carga su RUC (11 dígitos) o DNI (8), o su nombre completo, y vuelve a tocar.",
  };
  const titulo = TITULO[certeza];
  const detalle = DETALLE[certeza];

  return {
    certeza,
    titulo,
    detalle,
    coincidencias: coincidencias.slice(0, MAX_COINCIDENCIAS),
    total: coincidencias.length,
    corte,
    buscadoPor,
  };
}
