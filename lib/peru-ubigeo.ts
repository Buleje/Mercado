/**
 * Wrapper sobre `ubigeo-peru` (npm) — expone API consistente para el frontend.
 *
 * El paquete trae 2095 entradas INEI con shape:
 *   { departamento: "25", provincia: "01", distrito: "00", nombre: "Coronel Portillo" }
 *
 * Convencion del codigo:
 *   - Departamento: provincia="00" && distrito="00"  (ej. "25/00/00" → Ucayali)
 *   - Provincia:    distrito="00" && provincia!="00" (ej. "25/01/00" → Coronel Portillo)
 *   - Distrito:     todos los campos != "00"          (ej. "25/01/01" → Calleria)
 *
 * Esta abstraccion oculta esa convencion y expone:
 *   - listDepartamentos() : DepartamentoEntry[]
 *   - listProvincias(depCode) : ProvinciaEntry[]
 *   - listDistritos(depCode, provCode) : DistritoEntry[]
 *   - findByName({ departamento, provincia, distrito }) : best-match para reverse-geocode
 */

// @ts-expect-error: paquete sin types — ver shape inline debajo.
import { inei as INEI_RAW } from "ubigeo-peru";

type RawEntry = {
  departamento: string;
  provincia: string;
  distrito: string;
  nombre: string;
};

const ENTRIES: RawEntry[] = INEI_RAW as RawEntry[];

export type DepartamentoEntry = { code: string; nombre: string };
export type ProvinciaEntry = { code: string; departamento: string; nombre: string };
export type DistritoEntry = {
  code: string;
  departamento: string;
  provincia: string;
  nombre: string;
};

// El dataset INEI puede tener duplicados (mismo codigo, distinto orden o
// nombre). Dedupe por code antes de exponer.
const _depMap = new Map<string, DepartamentoEntry>();
for (const e of ENTRIES) {
  if (e.provincia === "00" && e.distrito === "00" && !_depMap.has(e.departamento)) {
    _depMap.set(e.departamento, { code: e.departamento, nombre: e.nombre });
  }
}
const DEPARTAMENTOS: DepartamentoEntry[] = Array.from(_depMap.values()).sort((a, b) =>
  a.nombre.localeCompare(b.nombre, "es"),
);

const PROVINCIAS_BY_DEP: Map<string, ProvinciaEntry[]> = new Map();
const DISTRITOS_BY_DEP_PROV: Map<string, DistritoEntry[]> = new Map();
const _seenProv = new Set<string>(); // depCode/provCode
const _seenDist = new Set<string>(); // depCode/provCode/distCode

for (const e of ENTRIES) {
  if (e.provincia !== "00" && e.distrito === "00") {
    const seenKey = `${e.departamento}/${e.provincia}`;
    if (_seenProv.has(seenKey)) continue;
    _seenProv.add(seenKey);
    const list = PROVINCIAS_BY_DEP.get(e.departamento) ?? [];
    list.push({ code: e.provincia, departamento: e.departamento, nombre: e.nombre });
    PROVINCIAS_BY_DEP.set(e.departamento, list);
  } else if (e.provincia !== "00" && e.distrito !== "00") {
    const seenKey = `${e.departamento}/${e.provincia}/${e.distrito}`;
    if (_seenDist.has(seenKey)) continue;
    _seenDist.add(seenKey);
    const key = `${e.departamento}/${e.provincia}`;
    const list = DISTRITOS_BY_DEP_PROV.get(key) ?? [];
    list.push({
      code: e.distrito,
      departamento: e.departamento,
      provincia: e.provincia,
      nombre: e.nombre,
    });
    DISTRITOS_BY_DEP_PROV.set(key, list);
  }
}

for (const list of PROVINCIAS_BY_DEP.values()) {
  list.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
for (const list of DISTRITOS_BY_DEP_PROV.values()) {
  list.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function listDepartamentos(): DepartamentoEntry[] {
  return DEPARTAMENTOS;
}

export function listProvincias(depCode: string): ProvinciaEntry[] {
  return PROVINCIAS_BY_DEP.get(depCode) ?? [];
}

export function listDistritos(depCode: string, provCode: string): DistritoEntry[] {
  return DISTRITOS_BY_DEP_PROV.get(`${depCode}/${provCode}`) ?? [];
}

/** Normaliza para comparaciones case/diacritic-insensitive. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Busca un departamento por nombre. Tolera mayusculas y acentos.
 */
export function findDepartamentoByName(name: string): DepartamentoEntry | null {
  const target = norm(name);
  return DEPARTAMENTOS.find((d) => norm(d.nombre) === target) ?? null;
}

export function findProvinciaByName(depCode: string, name: string): ProvinciaEntry | null {
  const target = norm(name);
  return (PROVINCIAS_BY_DEP.get(depCode) ?? []).find((p) => norm(p.nombre) === target) ?? null;
}

export function findDistritoByName(
  depCode: string,
  provCode: string,
  name: string,
): DistritoEntry | null {
  const target = norm(name);
  return (
    (DISTRITOS_BY_DEP_PROV.get(`${depCode}/${provCode}`) ?? []).find(
      (d) => norm(d.nombre) === target,
    ) ?? null
  );
}

/**
 * Best-match desde un payload de reverse-geocode (Nominatim u otro).
 * Tolera variaciones tipicas: "Lima Province", "Distrito de Surco", etc.
 */
export function bestMatchFromGeocode(input: {
  state?: string | null; // departamento
  county?: string | null; // provincia
  city?: string | null; // ciudad/distrito
  suburb?: string | null;
  city_district?: string | null;
}): {
  departamento: DepartamentoEntry | null;
  provincia: ProvinciaEntry | null;
  distrito: DistritoEntry | null;
} {
  const dep = input.state ? findDepartamentoByName(input.state.replace(/\s+(province|department)$/i, "")) : null;
  if (!dep) return { departamento: null, provincia: null, distrito: null };

  const provName = input.county ?? input.city ?? null;
  const prov = provName ? findProvinciaByName(dep.code, provName.replace(/^provincia\s+de\s+/i, "")) : null;

  if (!prov) return { departamento: dep, provincia: null, distrito: null };

  const distName = input.suburb ?? input.city_district ?? input.city ?? null;
  const dist = distName
    ? findDistritoByName(dep.code, prov.code, distName.replace(/^distrito\s+de\s+/i, ""))
    : null;

  return { departamento: dep, provincia: prov, distrito: dist };
}
