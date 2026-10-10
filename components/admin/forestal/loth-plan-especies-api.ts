/**
 * Las especies de un plan de manejo: la fila que se tipea y las tres escrituras
 * (agregar, corregir, quitar).
 *
 * Lo comparten tres pantallas que antes tenían cada una su `fetch` copiado:
 * el alta del registro de plantación (`LothPlanFormPlantacion`), la pestaña
 * «Registro y saldo» (`LothPlantacionRegistro`) y el editor de especies
 * autorizadas de un PO (`LothPlanEspecies`). Una regla de validación escrita
 * tres veces se desafina en la tercera.
 *
 * La fila guarda TEXTO (lo que hay en los inputs) y se convierte a números
 * recién al guardar: un «120,5» a medio escribir no puede volverse 120 en el
 * camino.
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { FORESTRY_SPECIES, findSpeciesByCommonName, type ForestrySpecies } from "@/data/forestry-species";
import { claveEspecie } from "@/lib/forestal/loth-constants";

const API = "/api/admin/forestal/plan/species";

/** Una especie del registro mientras se escribe. */
export interface FilaEspecie {
  /** Clave de React; no viaja al servidor. */
  uid: string;
  speciesCommon: string;
  speciesScientific: string;
  /**
   * ¿El científico lo completó el sistema? Mientras sí, cambiar el nombre lo
   * vuelve a completar; si la persona lo escribió, se respeta.
   */
  cientificoAuto: boolean;
  cites: boolean;
  /**
   * ¿CITES lo decidió el sistema por el nombre? Mientras sí, se recalcula con el
   * nombre FINAL: tipeando «Cedro macho» se pasa por «Cedro» (CITES) y antes
   * quedaba prendido para siempre. Si la persona lo tocó, manda la persona.
   */
  citesAuto: boolean;
  volumenM3: string;
  arboles: string;
  anioInstalacion: string;
  superficieHa: string;
  precioM3: string;
}

/** Lo que se manda al servidor (POST del plan con `species`, o POST/PATCH de una especie). */
export interface EspecieParaGuardar {
  speciesCommon: string;
  speciesScientific: string | null;
  cites: boolean;
  volumenAutorizadoM3: number;
  arbolesAutorizados: number | null;
  anioInstalacion: number | null;
  superficieHa: number | null;
  precioVentaSoles: number | null;
}

let secuencia = 0;

export function filaVacia(nombre = "", cientifico: string | null = null): FilaEspecie {
  secuencia += 1;
  const base: FilaEspecie = {
    uid: `esp-${secuencia}`,
    speciesCommon: "",
    speciesScientific: "",
    cientificoAuto: true,
    cites: false,
    citesAuto: true,
    volumenM3: "",
    arboles: "",
    anioInstalacion: "",
    superficieHa: "",
    precioM3: "",
  };
  return nombre ? conNombre(base, nombre, cientifico) : base;
}

/** Una fila sin nada escrito no es un error: simplemente no se manda. */
export function filaEnBlanco(f: FilaEspecie): boolean {
  return [f.speciesCommon, f.volumenM3, f.arboles, f.anioInstalacion, f.superficieHa, f.precioM3].every((v) => !v.trim());
}

/** «120,5» y «120.5» son lo mismo; vacío es `null`, no 0. */
export function numeroDe(v: string): number | null {
  const t = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Lo que está mal en una fila, en palabras, o `null` si se puede guardar.
 * Las mismas reglas que valida el servidor (`plan/species`): volumen > 0,
 * árboles entero ≥ 0, año 1900–2100, superficie y precio ≥ 0.
 */
export function problemaDeFila(f: FilaEspecie): string | null {
  if (!f.speciesCommon.trim()) return "Falta la especie";
  const vol = numeroDe(f.volumenM3);
  if (vol == null) return "Falta el volumen registrado";
  if (!(vol > 0)) return "El volumen tiene que ser mayor que 0";
  const arb = numeroDe(f.arboles);
  if (arb != null && (!Number.isInteger(arb) || arb < 0)) return "El N° de árboles va entero";
  const anio = numeroDe(f.anioInstalacion);
  if (anio != null && (!Number.isInteger(anio) || anio < 1900 || anio > 2100)) return "El año va entre 1900 y 2100";
  const sup = numeroDe(f.superficieHa);
  if (sup != null && !(sup >= 0)) return "La superficie no puede ser negativa";
  const precio = numeroDe(f.precioM3);
  if (precio != null && !(precio >= 0)) return "El precio no puede ser negativo";
  return null;
}

export function aEspecieParaGuardar(f: FilaEspecie): EspecieParaGuardar {
  const n = (v: string) => {
    const x = numeroDe(v);
    return x == null || Number.isNaN(x) ? null : x;
  };
  return {
    speciesCommon: f.speciesCommon.trim(),
    speciesScientific: f.speciesScientific.trim() || null,
    cites: f.cites,
    volumenAutorizadoM3: n(f.volumenM3) ?? 0,
    arbolesAutorizados: n(f.arboles),
    anioInstalacion: n(f.anioInstalacion),
    superficieHa: n(f.superficieHa),
    precioVentaSoles: n(f.precioM3),
  };
}

/** Σ m³ de las filas que tienen un volumen válido: el total que se ve en vivo. */
export function totalM3(filas: readonly FilaEspecie[]): number {
  return filas.reduce((a, f) => {
    const v = numeroDe(f.volumenM3);
    return v != null && v > 0 ? a + v : a;
  }, 0);
}

/**
 * Las especies escritas dos veces («Bolaina» y «bolaina »): el saldo se lleva
 * POR especie, y dos filas de la misma partirían su volumen en dos.
 */
export function especiesRepetidas(filas: readonly FilaEspecie[], yaRegistradas: readonly string[] = []): string[] {
  const vistas = new Map<string, number>();
  for (const n of yaRegistradas) vistas.set(claveEspecie(n), 1);
  const rep = new Set<string>();
  for (const f of filas) {
    const k = claveEspecie(f.speciesCommon);
    if (!k) continue;
    if (vistas.has(k)) rep.add(f.speciesCommon.trim());
    vistas.set(k, (vistas.get(k) ?? 0) + 1);
  }
  return [...rep];
}

/**
 * Cambia el nombre de la especie y, si el científico lo había puesto el
 * sistema (o está vacío), lo completa del catálogo del negocio o del de SERFOR.
 * CITES sigue al nombre mientras lo decida el sistema; si la persona lo tocó,
 * se respeta.
 */
export function conNombre(f: FilaEspecie, nombre: string, cientificoDelCatalogo?: string | null): FilaEspecie {
  const sistema = especieSerfor(nombre);
  const sugerido = cientificoDelCatalogo || sistema?.scientificName || "";
  const pisar = f.cientificoAuto || !f.speciesScientific.trim();
  return {
    ...f,
    speciesCommon: nombre,
    speciesScientific: pisar ? sugerido : f.speciesScientific,
    cientificoAuto: pisar,
    cites: f.citesAuto ? Boolean(sistema?.cites) : f.cites,
    citesAuto: f.citesAuto,
  };
}

/**
 * La especie del catálogo de SERFOR por su nombre, con o sin tilde: la lista de
 * fábrica escribe «Marupá» y el catálogo «Marupa» — por texto exacto no se
 * encontraban y el científico quedaba vacío (medido en el navegador, 02-10).
 */
function especieSerfor(nombre: string): ForestrySpecies | undefined {
  const exacta = findSpeciesByCommonName(nombre);
  if (exacta) return exacta;
  const k = claveEspecie(nombre);
  if (!k) return undefined;
  return FORESTRY_SPECIES.find((s) => claveEspecie(s.commonName) === k || (s.altNames ?? []).some((a) => claveEspecie(a) === k));
}

/** La persona prende o apaga CITES a mano: desde ahí el nombre ya no lo cambia. */
export const conCites = (f: FilaEspecie, cites: boolean): FilaEspecie => ({ ...f, cites, citesAuto: false });

/** Una especie guardada, vuelta fila para corregirla. */
export function filaDesdeEspecie(s: {
  id: string;
  speciesCommon: string;
  speciesScientific: string | null;
  cites: boolean;
  volumenAutorizadoM3: string | null;
  arbolesAutorizados: number | null;
  anioInstalacion?: number | null;
  superficieHa?: string | null;
  precioVentaSoles: string | null;
}): FilaEspecie {
  return {
    uid: s.id,
    speciesCommon: s.speciesCommon,
    speciesScientific: s.speciesScientific ?? "",
    cientificoAuto: false,
    cites: s.cites,
    // Lo guardado ya es una decisión: cambiar el nombre no la pisa.
    citesAuto: false,
    volumenM3: s.volumenAutorizadoM3 ?? "",
    arboles: s.arbolesAutorizados != null ? String(s.arbolesAutorizados) : "",
    anioInstalacion: s.anioInstalacion != null ? String(s.anioInstalacion) : "",
    superficieHa: s.superficieHa ?? "",
    precioM3: s.precioVentaSoles ?? "",
  };
}

// ─── Escrituras ────────────────────────────────────────────────────────────

export type ResultadoEscritura = { ok: true } | { ok: false; error: string };

/** El error del servidor en palabras: `validation_error` no le dice nada a nadie. */
async function errorDe(r: Response, accion: string): Promise<string> {
  const body = (await r.json().catch(() => ({}))) as { error?: unknown; message?: unknown; issues?: { path?: unknown[] }[] };
  if (typeof body.message === "string" && body.message) return body.message;
  if (body.error === "validation_error") {
    const campo = body.issues?.[0]?.path?.join(".");
    return `No se pudo ${accion}: revisa ${campo ? `el campo «${campo}»` : "los números"}.`;
  }
  if (typeof body.error === "string" && body.error) return `No se pudo ${accion} (${body.error}).`;
  return `No se pudo ${accion} (error ${r.status}).`;
}

async function escribir(init: RequestInit & { url: string }, accion: string): Promise<ResultadoEscritura> {
  try {
    const { url, ...resto } = init;
    const r = await fetch(url, { credentials: "include", ...resto });
    if (!r.ok) return { ok: false, error: await errorDe(r, accion) };
    return { ok: true };
  } catch {
    return { ok: false, error: `No se pudo ${accion} — revisa tu conexión.` };
  }
}

const JSON_HEADERS = () => csrfHeaders({ "Content-Type": "application/json" });

export function agregarEspecie(
  planId: string,
  e: EspecieParaGuardar & { valorEstadoNaturalSoles?: number | null },
): Promise<ResultadoEscritura> {
  return escribir(
    { url: API, method: "POST", headers: JSON_HEADERS(), body: JSON.stringify({ planId, ...e }) },
    `agregar ${e.speciesCommon}`,
  );
}

export function corregirEspecie(
  id: string,
  cambios: Partial<EspecieParaGuardar> & { valorEstadoNaturalSoles?: number | null },
): Promise<ResultadoEscritura> {
  return escribir(
    { url: API, method: "PATCH", headers: JSON_HEADERS(), body: JSON.stringify({ id, ...cambios }) },
    "guardar la especie",
  );
}

export function quitarEspecie(id: string, nombre: string): Promise<ResultadoEscritura> {
  return escribir(
    { url: `${API}?id=${encodeURIComponent(id)}`, method: "DELETE", headers: csrfHeaders() },
    `quitar ${nombre}`,
  );
}

/**
 * Agrega varias especies de una, en orden. Devuelve cuáles no entraron: si la
 * tercera falla, las dos primeras YA están guardadas y hay que decirlo así, no
 * «falló todo».
 */
export async function agregarVarias(
  planId: string,
  especies: readonly EspecieParaGuardar[],
): Promise<{ guardadas: number; errores: string[]; fallidas: number[] }> {
  let guardadas = 0;
  const errores: string[] = [];
  /** Índices (en `especies`) de las que no entraron: para reintentar sólo ésas. */
  const fallidas: number[] = [];
  for (const [i, e] of especies.entries()) {
    const r = await agregarEspecie(planId, e);
    if (r.ok) guardadas += 1;
    else {
      errores.push(r.error);
      fallidas.push(i);
    }
  }
  return { guardadas, errores, fallidas };
}
