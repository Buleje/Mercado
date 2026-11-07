/**
 * Leer la constancia del registro de plantación (ronda 3 de ADR-459).
 *
 * El alta de una plantación pide lo que dice UN papel: la constancia de
 * inscripción en el Registro Nacional de Plantaciones Forestales (D.S.
 * 020-2015-MINAGRI) — código del registro, N° de constancia, fecha, titular,
 * ubicación, superficie y, por especie, árboles, m³ y año de instalación. Se
 * tipeaba entero mirando la hoja. Con la foto o el PDF, la IA lo lee y el
 * formulario se completa.
 *
 * Tres reglas, las mismas del resto del módulo:
 * 1. **Nada inventado.** Lo que no se lee vuelve `null`; el m³ es el que
 *    DECLARA el papel, nunca uno calculado (es la base del saldo y termina
 *    declarado ante SERFOR — regla `verificacion-de-verdad` §2).
 * 2. **No se pisa lo escrito.** Igual que `copiarDePlanPrevio`: se completa lo
 *    vacío y se dice qué.
 * 3. **La ubicación se elige, no se tipea.** «UCAYALI» / «CALLERIA» se buscan
 *    en el padrón INEI y entran con su nombre oficial; lo que no está en el
 *    padrón no entra (un departamento inventado no se puede elegir).
 *
 * PURO: sin React, sin fetch, sin Prisma. El prompt y el schema viven acá para
 * que la ruta y los tests usen exactamente los mismos.
 */

import { z } from "zod";
import { FORESTRY_SPECIES } from "@/data/forestry-species";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { findDepartamentoByName, findDistritoByName, findProvinciaByName } from "@/lib/peru-ubigeo";

/** Una especie del cuadro de la constancia, tal como se leyó. */
export interface EspecieLeida {
  nombreComun: string | null;
  nombreCientifico: string | null;
  arboles: number | null;
  volumenM3: number | null;
  anioInstalacion: number | null;
  superficieHa: number | null;
}

/** Lo que devuelve la ruta: cada campo `null` si el papel no lo trae o no se lee. */
export interface LecturaConstancia {
  codigoRegistro: string | null;
  numeroConstancia: string | null;
  /** AAAA-MM-DD. */
  fechaInscripcion: string | null;
  titular: string | null;
  autoridad: string | null;
  superficieHa: number | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  sector: string | null;
  especies: EspecieLeida[];
  /** Lo dudoso, en palabras («el volumen de la 2ª especie está borroso»). */
  nota: string;
}

/* ── Lo que se le pide a la IA ─────────────────────────────────────────── */

export const PROMPT_CONSTANCIA =
  "Este archivo es la CONSTANCIA DE INSCRIPCIÓN de una plantación forestal en el Registro Nacional de Plantaciones " +
  "Forestales del Perú (la emite la ARFFS o la ATFFS de la región), o la ficha de ese registro. Extrae SOLO lo que está " +
  "escrito en el papel. Si un dato no aparece o no se lee con seguridad, devuelve null: no lo completes, no lo calcules " +
  "ni lo adivines.\n" +
  "- codigoRegistro: el código del registro de la plantación tal como está, con guiones y barras (ej. «19-SEC/REG-PLT-2025-096»).\n" +
  "- numeroConstancia: el número de la constancia o del documento que la emite, como figura (ej. «096-2025-GOREU-GRDE-GRFFS»).\n" +
  "- fechaInscripcion: la fecha de inscripción o de emisión de la constancia, en formato AAAA-MM-DD.\n" +
  "- titular: nombre o razón social del titular de la plantación.\n" +
  "- autoridad: la autoridad que inscribe (ej. «ATFFS Selva Central», «Gerencia Regional Forestal y de Fauna Silvestre»).\n" +
  "- superficieHa: la superficie TOTAL de la plantación en hectáreas.\n" +
  "- departamento, provincia, distrito, sector: dónde está la plantación (sector = caserío, centro poblado, sector o predio).\n" +
  "- especies: una fila por especie del cuadro: nombreComun, nombreCientifico, arboles (número de árboles o plantas), " +
  "volumenM3 (el volumen en m³ que el papel DECLARA para esa especie; si no trae volumen, null — no lo calcules ni lo " +
  "repartas), anioInstalacion (año de instalación o de plantación, 4 dígitos), superficieHa (superficie de esa especie).\n" +
  "- nota: breve, en español, sólo si algo es dudoso o está tapado («el volumen de la 2ª especie está borroso»); si no, vacío.\n" +
  "Los números van como número JSON con punto decimal: «1 234,56», «1.234,56» y «1,234.56» son 1234.56 según cómo " +
  "escriba el papel. No sumes ni completes filas.";

const TEXTO = { anyOf: [{ type: "string" }, { type: "null" }] };
const NUMERO = { anyOf: [{ type: "number" }, { type: "null" }] };
const ENTERO = { anyOf: [{ type: "integer" }, { type: "null" }] };

const CAMPOS_ESPECIE = ["nombreComun", "nombreCientifico", "arboles", "volumenM3", "anioInstalacion", "superficieHa"] as const;
const CAMPOS_LECTURA = [
  "codigoRegistro",
  "numeroConstancia",
  "fechaInscripcion",
  "titular",
  "autoridad",
  "superficieHa",
  "departamento",
  "provincia",
  "distrito",
  "sector",
  "especies",
  "nota",
] as const;

/**
 * JSON Schema para la salida estructurada. La skill `claude-api` lo pide con
 * `additionalProperties: false` en cada objeto, sin mínimos ni máximos (no los
 * soporta): los rangos se validan acá, en `normalizarLectura`.
 */
export const JSON_SCHEMA_CONSTANCIA: Record<string, unknown> = {
  type: "object",
  properties: {
    codigoRegistro: TEXTO,
    numeroConstancia: TEXTO,
    fechaInscripcion: TEXTO,
    titular: TEXTO,
    autoridad: TEXTO,
    superficieHa: NUMERO,
    departamento: TEXTO,
    provincia: TEXTO,
    distrito: TEXTO,
    sector: TEXTO,
    especies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nombreComun: TEXTO,
          nombreCientifico: TEXTO,
          arboles: ENTERO,
          volumenM3: NUMERO,
          anioInstalacion: ENTERO,
          superficieHa: NUMERO,
        },
        required: [...CAMPOS_ESPECIE],
        additionalProperties: false,
      },
    },
    nota: { type: "string" },
  },
  required: [...CAMPOS_LECTURA],
  additionalProperties: false,
};

/* ── Lo que vuelve, tolerado ───────────────────────────────────────────── */

/**
 * Un número que el modelo devolvió como texto → número, o `null`.
 *
 * Con los dos separadores, el decimal es el que va último («1.234,56» y
 * «1,234.56» son 1234.56). Con uno solo repetido, son miles («1,234,567»).
 * Con UNA sola coma, es decimal aunque la sigan tres cifras: en el libro
 * forestal «14,853» son 14,853 m³, no catorce mil (pasó con la hoja del
 * regente, 28-09).
 */
export function aNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let t = v.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(t)) return null;
  const comas = (t.match(/,/g) ?? []).length;
  const puntos = (t.match(/\./g) ?? []).length;
  if (comas > 0 && puntos > 0) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (comas > 1) {
    t = t.replace(/,/g, "");
  } else if (comas === 1) {
    t = t.replace(",", ".");
  } else if (puntos > 1) {
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const texto = z.preprocess((v) => (v == null ? null : String(v)), z.string().nullable()).catch(null);
const numero = z.preprocess(aNumero, z.number().nullable()).catch(null);

const EspecieCrudaSchema = z.object({
  nombreComun: texto.default(null),
  nombreCientifico: texto.default(null),
  arboles: numero.default(null),
  volumenM3: numero.default(null),
  anioInstalacion: numero.default(null),
  superficieHa: numero.default(null),
});

/** Lo que devuelve el modelo, sin confiar en él: un `null`, un número en texto o un campo de menos no tumban la lectura. */
export const LecturaCrudaSchema = z.object({
  codigoRegistro: texto.default(null),
  numeroConstancia: texto.default(null),
  fechaInscripcion: texto.default(null),
  titular: texto.default(null),
  autoridad: texto.default(null),
  superficieHa: numero.default(null),
  departamento: texto.default(null),
  provincia: texto.default(null),
  distrito: texto.default(null),
  sector: texto.default(null),
  especies: z.array(EspecieCrudaSchema).catch([]).default([]),
  nota: texto.default(null),
});
export type LecturaCruda = z.infer<typeof LecturaCrudaSchema>;

/** Hasta cuántas especies se aceptan de una lectura: un registro real trae 1-6. */
const MAX_ESPECIES = 40;

const limpio = (v: string | null, max = 160): string | null => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Un número dentro de lo que el mundo real permite, o `null`. */
const enRango = (n: number | null, min: number, max: number, entero = false): number | null =>
  n == null || n < min || n > max || (entero && !Number.isInteger(n)) ? null : n;

/** AAAA-MM-DD o DD/MM/AAAA → AAAA-MM-DD de una fecha que existe; si no, `null`. */
export function fechaIso(v: string | null): string | null {
  const t = (v ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  let [a, me, d] = m ? [m[1], m[2], m[3]] : ["", "", ""];
  if (!m) {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
    if (!m) return null;
    [d, me, a] = [m[1], m[2], m[3]];
  }
  const anio = Number(a);
  const mes = Number(me);
  const dia = Number(d);
  if (anio < 1950 || anio > 2100) return null;
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * La lectura cruda → lo que se muestra. Recorta, valida rangos y descarta
 * filas vacías. NO completa nada: lo que no pasa el rango queda `null`.
 */
export function normalizarLectura(c: LecturaCruda): LecturaConstancia {
  const especies: EspecieLeida[] = [];
  for (const e of c.especies) {
    const fila: EspecieLeida = {
      nombreComun: limpio(e.nombreComun, 80),
      nombreCientifico: limpio(e.nombreCientifico, 120),
      arboles: enRango(e.arboles, 0, 10_000_000, true),
      volumenM3: enRango(e.volumenM3, 0.001, 10_000_000),
      anioInstalacion: enRango(e.anioInstalacion, 1900, 2100, true),
      superficieHa: enRango(e.superficieHa, 0.0001, 1_000_000),
    };
    if (!fila.nombreComun && !fila.nombreCientifico) continue;
    especies.push(fila);
    if (especies.length >= MAX_ESPECIES) break;
  }
  return {
    codigoRegistro: limpio(c.codigoRegistro, 80),
    numeroConstancia: limpio(c.numeroConstancia, 120),
    fechaInscripcion: fechaIso(c.fechaInscripcion),
    titular: limpio(c.titular, 160),
    autoridad: limpio(c.autoridad, 160),
    superficieHa: enRango(c.superficieHa, 0.0001, 1_000_000),
    departamento: limpio(c.departamento, 60),
    provincia: limpio(c.provincia, 60),
    distrito: limpio(c.distrito, 60),
    sector: limpio(c.sector, 120),
    especies,
    nota: limpio(c.nota, 240) ?? "",
  };
}

/** ¿Se leyó algo que sirva? Una foto de otra cosa devuelve todo `null`. */
export function lecturaVacia(l: LecturaConstancia): boolean {
  const campos = [
    l.codigoRegistro, l.numeroConstancia, l.fechaInscripcion, l.titular, l.autoridad, l.superficieHa,
    l.departamento, l.provincia, l.distrito, l.sector,
  ];
  return l.especies.length === 0 && campos.every((v) => v == null);
}

/* ── Llenar el formulario sin pisar ────────────────────────────────────── */

/** Los campos del alta que puede llenar la constancia (subconjunto del formulario del plan). */
export interface CamposDeConstancia {
  planNumber: string;
  resolucionNumber: string;
  resolucionDate: string;
  titularName: string;
  arffs: string;
  areaHa: string;
  region: string;
  provincia: string;
  distrito: string;
  sector: string;
}

/** Un número para un input: «12.5», sin ceros de más ni notación científica. */
const numeroATexto = (n: number | null): string => (n == null ? "" : String(Number(n.toFixed(4))));

/**
 * Completa el formulario con la constancia — y dice qué completó y qué no
 * pudo. Nunca pisa lo escrito. La región «Ucayali» con la que arranca el alta
 * nadie la eligió: mientras no tenga provincia ni distrito, cuenta como vacía
 * (la misma regla que `copiarDePlanPrevio`).
 */
export function completarPlanDesdeConstancia<T extends CamposDeConstancia>(
  prev: T,
  l: LecturaConstancia,
  opts: { regionPorDefecto: string },
): { campos: T; completados: string[]; avisos: string[] } {
  const completados: string[] = [];
  const avisos: string[] = [];
  const sinPisar = (actual: string, nuevo: string | null, rotulo: string): string => {
    if (actual.trim() || !nuevo) return actual;
    completados.push(rotulo);
    return nuevo;
  };

  const campos: T = {
    ...prev,
    planNumber: sinPisar(prev.planNumber, l.codigoRegistro, "código del registro"),
    resolucionNumber: sinPisar(prev.resolucionNumber, l.numeroConstancia, "N° de constancia"),
    resolucionDate: sinPisar(prev.resolucionDate, l.fechaInscripcion, "fecha de inscripción"),
    titularName: sinPisar(prev.titularName, l.titular, "titular"),
    arffs: sinPisar(prev.arffs, l.autoridad, "autoridad"),
    areaHa: sinPisar(prev.areaHa, l.superficieHa == null ? null : numeroATexto(l.superficieHa), "superficie"),
    sector: sinPisar(prev.sector, l.sector, "sector"),
  };

  /* La ubicación encadenada: departamento → provincia → distrito, cada uno
     buscado en el padrón DENTRO del anterior. */
  const regionLibre = !prev.region.trim() || (prev.region === opts.regionPorDefecto && !prev.provincia.trim() && !prev.distrito.trim());
  const dep = l.departamento ? findDepartamentoByName(l.departamento) : null;
  if (l.departamento && !dep) avisos.push(`el departamento «${l.departamento}» no está en el padrón: elígelo en la lista`);
  if (dep && regionLibre) {
    if (dep.nombre !== prev.region) completados.push("departamento");
    campos.region = dep.nombre;
  } else if (dep && findDepartamentoByName(prev.region)?.code !== dep.code) {
    avisos.push(`la constancia dice ${dep.nombre} y el formulario ${prev.region}: se dejó ${prev.region}`);
  }

  const depFinal = findDepartamentoByName(campos.region);
  const prov = depFinal && l.provincia ? findProvinciaByName(depFinal.code, l.provincia) : null;
  if (l.provincia && !prov && depFinal) avisos.push(`la provincia «${l.provincia}» no está en ${depFinal.nombre}: elígela en la lista`);
  if (prov && !campos.provincia.trim()) {
    campos.provincia = prov.nombre;
    completados.push("provincia");
  }

  const provFinal = depFinal ? findProvinciaByName(depFinal.code, campos.provincia) : null;
  const dist = depFinal && provFinal && l.distrito ? findDistritoByName(depFinal.code, provFinal.code, l.distrito) : null;
  if (l.distrito && !dist && provFinal) avisos.push(`el distrito «${l.distrito}» no está en ${provFinal.nombre}: elígelo en la lista`);
  if (dist && !campos.distrito.trim()) {
    campos.distrito = dist.nombre;
    completados.push("distrito");
  }

  return { campos, completados, avisos };
}

/** El nombre común de una especie por su científico, del catálogo de SERFOR (no se inventa: sale de la lista oficial). */
function comunPorCientifico(cientifico: string | null): string | null {
  const k = claveEspecie(cientifico);
  if (!k) return null;
  return FORESTRY_SPECIES.find((s) => claveEspecie(s.scientificName) === k)?.commonName ?? null;
}

/**
 * Qué especies leídas son NUEVAS y cuáles ya están escritas en el formulario.
 * La comparación es SÓLO contra lo que ya estaba escrito: si el papel trae la
 * misma especie dos veces (dos bloques, dos años), las dos entran como filas
 * y el formulario avisa «está dos veces» — juntarlas en silencio perdería el
 * volumen de una.
 */
export function especiesParaAgregar(
  leidas: readonly EspecieLeida[],
  yaEscritas: readonly string[],
): { nuevas: EspecieLeida[]; existentes: EspecieLeida[] } {
  const escritas = new Set(yaEscritas.map(claveEspecie).filter(Boolean));
  const nuevas: EspecieLeida[] = [];
  const existentes: EspecieLeida[] = [];
  for (const e of leidas) {
    const conNombre = { ...e, nombreComun: e.nombreComun ?? comunPorCientifico(e.nombreCientifico) };
    const k = claveEspecie(conNombre.nombreComun);
    (k && escritas.has(k) ? existentes : nuevas).push(conNombre);
  }
  return { nuevas, existentes };
}

/** Las celdas de una fila de especie que la constancia puede completar (subconjunto de la fila del formulario). */
export interface FilaDeEspecie {
  uid: string;
  speciesCommon: string;
  arboles: string;
  volumenM3: string;
  anioInstalacion: string;
  superficieHa: string;
}

/**
 * Suma la lectura a las filas del formulario:
 * - la especie que ya estaba escrita se COMPLETA en sus celdas vacías (quien
 *   escribió «Bolaina» y no su volumen recibe el volumen del papel); lo
 *   escrito no se toca;
 * - la que no estaba entra como fila nueva (`nueva` arma la fila con su uid);
 * - las filas en blanco se van si entra alguna nueva (la constancia trae con
 *   qué llenarlas).
 * Devuelve qué hizo, en palabras, para decirlo.
 */
export function sumarEspeciesLeidas<F extends FilaDeEspecie>(
  filas: readonly F[],
  leidas: readonly EspecieLeida[],
  nueva: (e: EspecieLeida) => F,
  enBlanco: (f: F) => boolean,
): { filas: F[]; uidsLeidos: string[]; nuevas: string[]; completadas: string[]; yaEstaban: string[] } {
  const escritas = filas.filter((f) => !enBlanco(f));
  const { nuevas, existentes } = especiesParaAgregar(leidas, escritas.map((f) => f.speciesCommon));
  const porClave = new Map<string, EspecieLeida>();
  for (const e of existentes) {
    const k = claveEspecie(e.nombreComun);
    if (!porClave.has(k)) porClave.set(k, e);
  }

  const completadas: string[] = [];
  const yaEstaban: string[] = [];
  const uidsLeidos: string[] = [];
  const actualizadas = escritas.map((f) => {
    const e = porClave.get(claveEspecie(f.speciesCommon));
    if (!e) return f;
    porClave.delete(claveEspecie(f.speciesCommon));
    const t = textoDeFila(e);
    const celdas: [keyof FilaDeEspecie & keyof TextoDeFila, string][] = [
      ["volumenM3", "m³"],
      ["arboles", "árboles"],
      ["anioInstalacion", "año"],
      ["superficieHa", "superficie"],
    ];
    const cambios: Partial<F> = {};
    const campos: string[] = [];
    for (const [k, rotulo] of celdas) {
      if (!f[k].trim() && t[k]) {
        (cambios as Record<string, string>)[k] = t[k];
        campos.push(rotulo);
      }
    }
    if (campos.length === 0) {
      yaEstaban.push(f.speciesCommon.trim());
      return f;
    }
    completadas.push(`${f.speciesCommon.trim()} (${campos.join(", ")})`);
    uidsLeidos.push(f.uid);
    return { ...f, ...cambios };
  });

  const agregadas = nuevas.map(nueva);
  uidsLeidos.push(...agregadas.map((f) => f.uid));
  const sinBlancas = agregadas.length > 0 ? actualizadas : filas.map((f) => actualizadas.find((a) => a.uid === f.uid) ?? f);
  return {
    filas: agregadas.length > 0 ? [...sinBlancas, ...agregadas] : sinBlancas,
    uidsLeidos,
    nuevas: agregadas.map((f) => f.speciesCommon.trim() || "sin nombre"),
    completadas,
    yaEstaban,
  };
}

/** Una especie leída en TEXTO, como la guardan los inputs de la fila. */
export interface TextoDeFila {
  nombre: string;
  cientifico: string;
  arboles: string;
  volumenM3: string;
  anioInstalacion: string;
  superficieHa: string;
}

export function textoDeFila(e: EspecieLeida): TextoDeFila {
  return {
    nombre: e.nombreComun ?? "",
    cientifico: e.nombreCientifico ?? "",
    arboles: e.arboles == null ? "" : String(e.arboles),
    volumenM3: numeroATexto(e.volumenM3),
    anioInstalacion: e.anioInstalacion == null ? "" : String(e.anioInstalacion),
    superficieHa: numeroATexto(e.superficieHa),
  };
}
