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
 * ADR-459 (2-10-2026, Brandon: «quiero mejoras para esa página»): cada troza
 * sabe de qué permiso (plan de manejo) es, cuántos días lleva en el patio
 * contados en días de Pucallpa, y el buscador entiende lo que tipea la pistola
 * al leer la etiqueta (`TROZA <código>` + la ficha, o la dirección del QR chico).
 *
 * Relacionado: skill `serfor-osinfor-compliance` §3 (el saldo se deriva de los
 * tres registros, nunca es un contador propio).
 */

import { limaDateKey } from "@/lib/utils";
import type { LothEntryDTO } from "./loth-constants";
import { claveDeCodigo, esFichaDeTroza, esLineaDeFicha, leerEscaneo } from "./leer-escaneo-troza";

export type EstadoTroza = "disponible" | "despachada" | "consumida" | "descartada" | "fantasma";

export interface TrozaTablero {
  code: string;
  treeCode: string | null;
  especie: string | null;
  volumenM3: number | null;
  /** Fecha del trozado (o del despacho, si es fantasma). */
  fecha: string | null;
  /** El día del trozado en Pucallpa (`YYYY-MM-DD`): lo que se muestra como «Trozada el». */
  diaTrozado: string | null;
  estado: EstadoTroza;
  /** Con qué GTF salió, si salió. */
  gtf: string | null;
  /** Fecha de la salida (despacho o consumo). */
  fechaSalida: string | null;
  /** Días que la troza lleva en patio sin moverse (sólo si está disponible). */
  diasEnPatio: number | null;
  /** Línea del libro que la creó, para poder ir hasta ella. */
  lineNo: number | null;
  /** id de la línea de Trozado (la que se imprime en la etiqueta). */
  trozadoId: string | null;
  /** Plan de manejo (permiso) de la línea que la creó; `null` = sin plan. */
  planId: string | null;
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

/**
 * Desde cuántos días una troza en el patio pide atención (ámbar) y cuándo ya
 * es urgente (rojo). La madera rolliza en la selva se mancha (mancha azul) y
 * se raja entre la segunda y la cuarta semana sin moverse.
 */
export const UMBRAL_PATIO_DIAS = { atencion: 15, critico: 30 } as const;

export type AntiguedadPatio = "atencion" | "critico";

/** «Todos los permisos»: sin filtro de plan. */
export const PLAN_TODOS = null;
/** Las trozas cuya línea no tiene plan de manejo. */
export const PLAN_SIN_PLAN = "sin-plan";

const viva = (e: LothEntryDTO) => e.status !== "anulado";

const MS_DIA = 86_400_000;

/**
 * El día de una fecha del libro, como lo vive Pucallpa (`YYYY-MM-DD`).
 *
 * `entryDate` llega de dos formas: medianoche UTC cuando se eligió el día en el
 * formulario (date-only: leerlo en Lima lo corre un día atrás) o la hora real
 * del asiento (`now()`: a las 20:00 de Pucallpa el UTC ya es mañana). Se
 * distinguen por la hora: 00:00:00.000 UTC exacto es un día sin hora.
 */
export function diaDelLibro(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const medianocheUtc =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return medianocheUtc ? d.toISOString().slice(0, 10) : limaDateKey(d) || null;
}

/** Días enteros entre dos días `YYYY-MM-DD` (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / MS_DIA);
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
  const hoyKey = limaDateKey(hoy);

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
    const diaTrozado = diaDelLibro(tro?.entryDate ?? null);

    filas.push({
      code,
      treeCode: origen?.treeCode ?? null,
      especie: origen?.speciesCommon ?? null,
      volumenM3: tro?.volumeM3 != null ? Number(tro.volumeM3) : null,
      fecha: tro?.entryDate ?? origen?.entryDate ?? null,
      diaTrozado,
      estado,
      gtf: des?.gtfNumber ?? null,
      fechaSalida,
      diasEnPatio: estado === "disponible" && diaTrozado && hoyKey ? Math.max(0, diasEntre(diaTrozado, hoyKey)) : null,
      lineNo: origen?.lineNo ?? null,
      trozadoId: tro?.id ?? null,
      planId: origen?.planId ?? null,
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

/** ¿Cuánto preocupa el tiempo que lleva en el patio? `null` = todavía no (o ya salió). */
export function antiguedadEnPatio(f: Pick<TrozaTablero, "estado" | "diasEnPatio">): AntiguedadPatio | null {
  if (f.estado !== "disponible" || f.diasEnPatio == null) return null;
  if (f.diasEnPatio >= UMBRAL_PATIO_DIAS.critico) return "critico";
  if (f.diasEnPatio >= UMBRAL_PATIO_DIAS.atencion) return "atencion";
  return null;
}

/** Las trozas del permiso elegido. `null` = todas; `PLAN_SIN_PLAN` = las de líneas sin plan. */
export function filtrarPorPlan(filas: readonly TrozaTablero[], plan: string | null): TrozaTablero[] {
  if (plan == null) return [...filas];
  if (plan === PLAN_SIN_PLAN) return filas.filter((f) => f.planId == null);
  return filas.filter((f) => f.planId === plan);
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
      m3: sumaM3(conVolumen),
      sinVolumen: propias.length - conVolumen.length,
    };
  });
}

/** Σ m³ redondeado a 4 decimales (el libro guarda 3; el 4º absorbe el float). */
export function sumaM3(filas: readonly Pick<TrozaTablero, "volumenM3">[]): number {
  return Math.round(filas.reduce((a, f) => a + (f.volumenM3 ?? 0), 0) * 10000) / 10000;
}

export interface ResumenViejas {
  /** En el patio hace ≥ 15 días (incluye las de ≥ 30). */
  n: number;
  m3: number;
  /** De ésas, las de ≥ 30 días. */
  criticas: number;
}

/** Las que llevan demasiado en el patio. */
export function resumirViejas(filas: readonly TrozaTablero[]): ResumenViejas {
  const viejas = filas.filter((f) => antiguedadEnPatio(f) != null);
  return { n: viejas.length, m3: sumaM3(viejas), criticas: viejas.filter((f) => antiguedadEnPatio(f) === "critico").length };
}

export interface FiltroTablero {
  texto?: string;
  estados?: readonly EstadoTroza[];
  especie?: string | null;
  /** Sólo las que llevan ≥ 15 días en el patio. */
  soloViejas?: boolean;
}

/**
 * Qué escribió (o «tipeó» la pistola) en el buscador.
 *
 *   · `etiqueta` — la ficha del QR grande (`TROZA 85-TOR-C` + líneas; la
 *     pistola sin Enter la pega toda en el campo) o la dirección del QR chico
 *     (`…/verificar/85-TOR-C`): vale el código, exacto.
 *   · `linea-ficha` — una línea suelta de la ficha (`🌳 Tornillo`): la pistola
 *     con Enter manda la ficha renglón por renglón; esas no buscan nada.
 *   · `sin-codigo` — la ficha de una pieza sin código (`TROZA —`).
 *   · `texto` — un tipeo: busca por «contiene».
 */
export type BusquedaTablero =
  | { tipo: "vacio" }
  | { tipo: "etiqueta"; codigo: string }
  | { tipo: "linea-ficha" }
  | { tipo: "sin-codigo" }
  | { tipo: "texto"; q: string };

export function leerBusquedaTablero(texto: string | null | undefined): BusquedaTablero {
  const crudo = (texto ?? "").trim();
  if (!crudo) return { tipo: "vacio" };
  const esDireccion = /^[a-z][a-z0-9+.-]*:\/\//i.test(crudo) || crudo.startsWith("/verificar/");
  if (esFichaDeTroza(crudo) || esDireccion) {
    const l = leerEscaneo(crudo);
    if (l?.tipo === "codigo") return { tipo: "etiqueta", codigo: l.codigo };
    return esFichaDeTroza(crudo) ? { tipo: "sin-codigo" } : { tipo: "texto", q: crudo.toLowerCase() };
  }
  if (esLineaDeFicha(crudo)) return { tipo: "linea-ficha" };
  return { tipo: "texto", q: crudo.toLowerCase() };
}

/** La troza con ese código exacto (sin mirar mayúsculas, tildes ni espacios). */
export function trozaPorCodigo(filas: readonly TrozaTablero[], codigo: string): TrozaTablero | null {
  const clave = claveDeCodigo(codigo);
  if (!clave) return null;
  return filas.find((f) => claveDeCodigo(f.code) === clave) ?? null;
}

/**
 * Qué troza señala una lectura al apretar Enter (o al terminar de leer la
 * pistola). Un tipeo cuenta como lectura sólo si es un código exacto: así la
 * pistola de barras (Code128 = el código pelado + Enter) también elige.
 */
export type LecturaTablero =
  | { estado: "una"; fila: TrozaTablero }
  | { estado: "ninguna"; codigo: string }
  | { estado: "ignorar" };

export function resolverLectura(filas: readonly TrozaTablero[], texto: string | null | undefined): LecturaTablero {
  const b = leerBusquedaTablero(texto);
  if (b.tipo === "etiqueta") {
    const fila = trozaPorCodigo(filas, b.codigo);
    return fila ? { estado: "una", fila } : { estado: "ninguna", codigo: b.codigo };
  }
  if (b.tipo === "texto") {
    const fila = trozaPorCodigo(filas, texto ?? "");
    return fila ? { estado: "una", fila } : { estado: "ignorar" };
  }
  return { estado: "ignorar" };
}

/** Filtra el tablero. El texto busca por código de troza, de árbol, especie y GTF; una etiqueta, por código exacto. */
export function filtrarTablero(filas: readonly TrozaTablero[], f: FiltroTablero): TrozaTablero[] {
  const b = leerBusquedaTablero(f.texto);
  const clave = b.tipo === "etiqueta" ? claveDeCodigo(b.codigo) : null;
  const q = b.tipo === "texto" ? b.q : "";
  return filas.filter((fila) => {
    if (f.estados && f.estados.length > 0 && !f.estados.includes(fila.estado)) return false;
    if (f.especie && fila.especie !== f.especie) return false;
    if (f.soloViejas && antiguedadEnPatio(fila) == null) return false;
    if (clave) return claveDeCodigo(fila.code) === clave;
    if (b.tipo === "sin-codigo") return false;
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

/** Los planes distintos de unas trozas (para avisar que una guía sale de UN permiso). */
export function planesDe(filas: readonly Pick<TrozaTablero, "planId">[]): (string | null)[] {
  return [...new Set(filas.map((f) => f.planId ?? null))];
}
