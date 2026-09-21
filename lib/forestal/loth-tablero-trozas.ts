/**
 * Tablero de control del permiso — en qué estado está cada troza.
 *
 * El libro ya sabía todo esto, pero repartido en tres secciones: la troza nace
 * en **Trozado**, sale en **Despacho de trozas** y desaparece en **Consumo**.
 * Para contestar «¿qué me queda en el patio?» había que leer las tres y cruzar
 * códigos a mano. Acá se cruzan una vez y cada troza queda con **un** estado.
 *
 * No es un contador aparte: se deriva de las líneas del libro, que siguen
 * siendo la única fuente. Si una línea se anula, la troza cambia de estado sola.
 *
 * Relacionado: skill `serfor-osinfor-compliance` §3 (el saldo se deriva de los
 * tres registros, nunca es un contador propio).
 */

import type { LothEntryDTO } from "./loth-constants";

export type EstadoTroza = "disponible" | "despachada" | "consumida" | "descartada" | "fantasma";

export interface TrozaTablero {
  code: string;
  treeCode: string | null;
  especie: string | null;
  volumenM3: number | null;
  /** Fecha del trozado (o del despacho, si es fantasma). */
  fecha: string | null;
  estado: EstadoTroza;
  /** Con qué GTF salió, si salió. */
  gtf: string | null;
  /** Fecha de la salida (despacho o consumo). */
  fechaSalida: string | null;
  /** Días que la troza lleva en patio sin moverse (sólo si está disponible). */
  diasEnPatio: number | null;
  /** Línea del libro que la creó, para poder ir hasta ella. */
  lineNo: number | null;
  cites: boolean;
}

export interface ResumenEstado {
  estado: EstadoTroza;
  label: string;
  /** Cuántas trozas. */
  n: number;
  /** Suma de volumen; las que no tienen volumen no suman (no son 0). */
  m3: number;
  /** Trozas sin volumen registrado: se cuentan pero no se pueden sumar. */
  sinVolumen: number;
}

export const ESTADOS_META: Record<EstadoTroza, { label: string; ayuda: string; orden: number }> = {
  disponible: {
    label: "Disponible",
    ayuda: "Trozada y todavía en el patio: no se despachó ni se consumió",
    orden: 1,
  },
  despachada: {
    label: "Despachada",
    ayuda: "Salió del área con una GTF",
    orden: 2,
  },
  consumida: {
    label: "Consumida",
    ayuda: "Se transformó o se usó dentro del área",
    orden: 3,
  },
  descartada: {
    label: "Descartada",
    ayuda: "Se registró como no aprovechable",
    orden: 4,
  },
  fantasma: {
    label: "Sin trozado",
    ayuda: "Aparece despachada o consumida sin una línea de Trozado que la respalde",
    orden: 5,
  },
};

const viva = (e: LothEntryDTO) => e.status !== "anulado";

/** Días entre una fecha y hoy, en días enteros. */
function diasDesde(iso: string | null, hoy: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((hoy.getTime() - t) / 86_400_000));
}

/**
 * Cruza las tres secciones y devuelve una fila por troza.
 *
 * El orden de precedencia importa: una troza despachada **y** consumida es un
 * error de libro, no un estado nuevo; gana «despachada» porque es la que tiene
 * un documento (la GTF) del otro lado, y el descuadre se ve igual porque la
 * línea de consumo sigue estando en su sección.
 */
export function construirTablero(entries: readonly LothEntryDTO[], hoy: Date = new Date()): TrozaTablero[] {
  const trozadas = new Map<string, LothEntryDTO>();
  const despachos = new Map<string, LothEntryDTO>();
  const consumos = new Map<string, LothEntryDTO>();

  for (const e of entries) {
    if (!viva(e)) continue;
    const code = e.trozaCode?.trim();
    if (!code) continue;
    if (e.section === "trozado" && !trozadas.has(code)) trozadas.set(code, e);
    else if (e.section === "despacho_troza" && !despachos.has(code)) despachos.set(code, e);
    else if (e.section === "consumo_troza" && !consumos.has(code)) consumos.set(code, e);
  }

  const codigos = new Set<string>([...trozadas.keys(), ...despachos.keys(), ...consumos.keys()]);
  const filas: TrozaTablero[] = [];

  for (const code of codigos) {
    const tro = trozadas.get(code) ?? null;
    const des = despachos.get(code) ?? null;
    const con = consumos.get(code) ?? null;

    let estado: EstadoTroza;
    if (!tro) estado = "fantasma";
    else if (des) estado = "despachada";
    else if (con) estado = "consumida";
    else if (tro.discarded) estado = "descartada";
    else estado = "disponible";

    const origen = tro ?? des ?? con;
    const fechaSalida = des?.entryDate ?? con?.entryDate ?? null;

    filas.push({
      code,
      treeCode: origen?.treeCode ?? null,
      especie: origen?.speciesCommon ?? null,
      volumenM3: tro?.volumeM3 != null ? Number(tro.volumeM3) : null,
      fecha: tro?.entryDate ?? origen?.entryDate ?? null,
      estado,
      gtf: des?.gtfNumber ?? null,
      fechaSalida,
      diasEnPatio: estado === "disponible" ? diasDesde(tro?.entryDate ?? null, hoy) : null,
      lineNo: origen?.lineNo ?? null,
      cites: origen?.cites === true,
    });
  }

  // Lo que pide atención primero: lo que sigue en el patio, y dentro de eso lo
  // más viejo. Un tablero ordenado por código deja lo urgente donde caiga.
  return filas.sort((a, b) => {
    const oa = ESTADOS_META[a.estado].orden;
    const ob = ESTADOS_META[b.estado].orden;
    if (oa !== ob) return oa - ob;
    if (a.estado === "disponible" && b.estado === "disponible") {
      return (b.diasEnPatio ?? 0) - (a.diasEnPatio ?? 0);
    }
    return a.code.localeCompare(b.code, "es", { numeric: true });
  });
}

/** Cuántas trozas y cuántos m³ hay en cada estado. */
export function resumirTablero(filas: readonly TrozaTablero[]): ResumenEstado[] {
  const orden = (Object.keys(ESTADOS_META) as EstadoTroza[]).sort(
    (a, b) => ESTADOS_META[a].orden - ESTADOS_META[b].orden,
  );
  return orden.map((estado) => {
    const propias = filas.filter((f) => f.estado === estado);
    const conVolumen = propias.filter((f) => f.volumenM3 != null && f.volumenM3 > 0);
    return {
      estado,
      label: ESTADOS_META[estado].label,
      n: propias.length,
      m3: Math.round(conVolumen.reduce((a, f) => a + (f.volumenM3 ?? 0), 0) * 10000) / 10000,
      sinVolumen: propias.length - conVolumen.length,
    };
  });
}

export interface FiltroTablero {
  texto?: string;
  estados?: readonly EstadoTroza[];
  especie?: string | null;
}

/** Filtra el tablero. El texto busca por código de troza, de árbol y por GTF. */
export function filtrarTablero(filas: readonly TrozaTablero[], f: FiltroTablero): TrozaTablero[] {
  const q = (f.texto ?? "").trim().toLowerCase();
  return filas.filter((fila) => {
    if (f.estados && f.estados.length > 0 && !f.estados.includes(fila.estado)) return false;
    if (f.especie && fila.especie !== f.especie) return false;
    if (!q) return true;
    return (
      fila.code.toLowerCase().includes(q) ||
      (fila.treeCode ?? "").toLowerCase().includes(q) ||
      (fila.gtf ?? "").toLowerCase().includes(q) ||
      (fila.especie ?? "").toLowerCase().includes(q)
    );
  });
}

/** Las especies presentes en el tablero, para el filtro. */
export function especiesDelTablero(filas: readonly TrozaTablero[]): string[] {
  const set = new Set<string>();
  for (const f of filas) if (f.especie) set.add(f.especie);
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}
