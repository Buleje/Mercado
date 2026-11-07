/**
 * lib/forestal/ctp-respaldo-diff.ts — COMPARAR un respaldo del Libro CTP con
 * el libro de hoy (ADR-530). Puro: sin base, testeable.
 *
 * Por tabla y por id: `borrada` · `de_baja` · `cambiada` (sin `updatedAt`) ·
 * `nueva`. Después agrupa por lo que el operador reconoce (corrida, salida,
 * ingreso, lote) y decide, grupo por grupo, si se puede traer de vuelta SIN
 * PISAR NADA y sin romper las reglas del libro (`.claude/rules/forestal-serfor.md`):
 * mes cerrado, troza que ya usó otra corrida, código de lote repetido,
 * consumos de una corrida que se editó después, columna nueva sin valor.
 *
 * El plan final de recuperar (con lo marcado) está en `ctp-respaldo-plan.ts`.
 */
import {
  ETIQUETA_TABLA_RESPALDO,
  TABLAS_RESPALDO,
  type ConteoDiffTabla,
  type EstadoDiffRespaldo,
  type GrupoDiffRespaldo,
  type GrupoDiffTipo,
  type TablaRespaldo,
} from "@/lib/forestal/ctp-respaldo-tipos";
import { canonico, esDeBaja, fechaDe, numeroDe, type FilaSerial, type TablasSerial, type ValorSerial } from "@/lib/forestal/ctp-respaldo-serial";

export interface ColumnaHoy {
  nombre: string;
  /** NOT NULL sin default (y no la llena Prisma): sin valor en el respaldo no se puede insertar. */
  obligatoria: boolean;
}

/** Lo que el diff necesita saber de HOY fuera de las tablas del libro. */
export interface ContextoRespaldo {
  /** Nombre del mes cerrado (sin reabrir) en que cae la fecha, o null. */
  mesCerrado: (fecha: Date | null) => string | null;
  /** Ids que existen hoy en otros módulos. Ausente = no se verificó (se asume que existen). */
  externos?: {
    proveedores?: ReadonlySet<string>;
    contratos?: ReadonlySet<string>;
    partes?: ReadonlySet<string>;
    campos?: ReadonlySet<string>;
  };
  columnasHoy?: Partial<Record<TablaRespaldo, readonly ColumnaHoy[]>>;
  columnasRespaldo?: Partial<Record<TablaRespaldo, readonly string[]>>;
}

export type Indice = Record<TablaRespaldo, Map<string, FilaSerial>>;

export function indexar(t: TablasSerial): Indice {
  const out = {} as Indice;
  for (const tabla of TABLAS_RESPALDO) out[tabla] = new Map((t[tabla] ?? []).map((f) => [String(f.id), f]));
  return out;
}

export interface DiffTabla {
  borradas: string[];
  deBaja: string[];
  cambiadas: string[];
  nuevas: string[];
}

const sinUpdated = (f: FilaSerial, claves: string[]) =>
  canonico(Object.fromEntries(claves.filter((k) => k !== "updatedAt").map((k) => [k, f[k]])));

/** Las 4 listas por tabla. Solo compara las columnas que están en las dos fotos. */
export function diffPorTabla(R: Indice, H: Indice): Record<TablaRespaldo, DiffTabla> {
  const out = {} as Record<TablaRespaldo, DiffTabla>;
  for (const t of TABLAS_RESPALDO) {
    const d: DiffTabla = { borradas: [], deBaja: [], cambiadas: [], nuevas: [] };
    for (const [id, r] of R[t]) {
      const h = H[t].get(id);
      if (!h) d.borradas.push(id);
      else if (!esDeBaja(t, r) && esDeBaja(t, h)) d.deBaja.push(id);
      else {
        const claves = Object.keys(r).filter((k) => k in h);
        if (sinUpdated(r, claves) !== sinUpdated(h, claves)) d.cambiadas.push(id);
      }
    }
    for (const id of H[t].keys()) if (!R[t].has(id)) d.nuevas.push(id);
    out[t] = d;
  }
  return out;
}

// ── Lecturas de una fila ────────────────────────────────────────────────────

export const txt = (v: ValorSerial | undefined): string | null => (typeof v === "string" && v ? v : null);
export const vivo = (f: FilaSerial | undefined): boolean => !!f && f.deletedAt == null && f.status !== "anulado";
const r4 = (n: number) => Number(n.toFixed(4));
const r2 = (n: number) => Number(n.toFixed(2));
const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : "sin fecha");

/** Cómo se nombra una troza en un aviso. */
export const nombreTroza = (t: FilaSerial) =>
  txt(t.codificacion) ?? txt(t.codigoPlanta) ?? (t.orden != null ? `N.° ${String(t.orden)}` : String(t.id).slice(-6));

const fila = (R: Indice, H: Indice, t: TablaRespaldo, id: string | null) =>
  id ? (R[t].get(id) ?? H[t].get(id)) : undefined;

// ── A qué grupo pertenece cada fila ─────────────────────────────────────────

function claveDeEntry(R: Indice, H: Indice, id: string | null): string {
  const e = fila(R, H, "ForestCtpEntry", id);
  if (!e || !id) return `otro:${id ?? "?"}`;
  return `${e.section === "despacho" ? "salida" : "corrida"}:${id}`;
}

function claveDeRegistro(R: Indice, H: Indice, rid: string): string {
  if (fila(R, H, "WoodEntry", rid)) return `ingreso:${rid}`;
  if (fila(R, H, "ForestCtpEntry", rid)) return claveDeEntry(R, H, rid);
  for (const t of ["ForestLoteAserrio", "ForestLoteMixto", "ForestProdLote"] as const) if (fila(R, H, t, rid)) return `lote:${rid}`;
  const troza = fila(R, H, "WoodEntryTroza", rid);
  if (troza) return `ingreso:${txt(troza.woodEntryId)}`;
  const paq = fila(R, H, "ForestCtpPaquete", rid);
  if (paq) return claveDeEntry(R, H, txt(paq.ctpEntryId));
  return `otro:${rid}`;
}

export function claveDeFila(R: Indice, H: Indice, t: TablaRespaldo, f: FilaSerial): string {
  switch (t) {
    case "WoodEntry":
      return `ingreso:${String(f.id)}`;
    case "WoodEntryTroza":
      return `ingreso:${txt(f.woodEntryId)}`;
    case "ForestCtpEntry":
      return claveDeEntry(R, H, String(f.id));
    case "ForestCtpPaquete":
    case "ForestCtpApartado":
    case "ForestCtpConsumo":
    case "ForestCuentaMov":
      return claveDeEntry(R, H, txt(f.ctpEntryId));
    case "ForestCtpDespachoOrigen":
      return claveDeEntry(R, H, txt(f.despachoEntryId));
    case "ForestCtpReproceso":
      return claveDeEntry(R, H, txt(f.destinoEntryId));
    case "ForestLoteAserrio":
    case "ForestLoteMixto":
    case "ForestProdLote":
      return `lote:${String(f.id)}`;
    case "ForestProdLoteMiembro":
      return `lote:${txt(f.loteId)}`;
    case "CampoPersonalizadoValor":
      return claveDeRegistro(R, H, txt(f.registroId) ?? "?");
    case "ForestGuiaGuardada":
      return `otro:${String(f.id)}`;
  }
}

/** La fila cabeza de un grupo (la corrida, el ingreso, el lote), del respaldo o de hoy. */
export function cabezaDe(R: Indice, H: Indice, clave: string): { tabla: TablaRespaldo; fila: FilaSerial } | null {
  const [tipo, id] = [clave.slice(0, clave.indexOf(":")), clave.slice(clave.indexOf(":") + 1)];
  const tablas: TablaRespaldo[] =
    tipo === "ingreso" ? ["WoodEntry"]
    : tipo === "corrida" || tipo === "salida" ? ["ForestCtpEntry"]
    : tipo === "lote" ? ["ForestLoteAserrio", "ForestLoteMixto", "ForestProdLote"]
    : ["ForestGuiaGuardada"];
  for (const t of tablas) {
    const f = fila(R, H, t, id);
    if (f) return { tabla: t, fila: f };
  }
  return null;
}

/** Fecha del libro de una fila (la de su padre si no tiene): decide el mes cerrado. */
export function fechaDeFila(R: Indice, H: Indice, t: TablaRespaldo, f: FilaSerial): Date | null {
  const deEntry = (id: ValorSerial | undefined) => fechaDe(fila(R, H, "ForestCtpEntry", txt(id))?.entryDate);
  switch (t) {
    case "WoodEntry":
    case "ForestCtpEntry":
      return fechaDe(f.entryDate);
    case "WoodEntryTroza":
      return fechaDe(fila(R, H, "WoodEntry", txt(f.woodEntryId))?.entryDate);
    case "ForestCtpPaquete":
    case "ForestCtpApartado":
    case "ForestCtpConsumo":
      return deEntry(f.ctpEntryId);
    case "ForestCuentaMov":
      return deEntry(f.ctpEntryId) ?? fechaDe(f.fecha);
    case "ForestCtpDespachoOrigen":
      return deEntry(f.despachoEntryId);
    case "ForestCtpReproceso":
      return deEntry(f.destinoEntryId);
    case "ForestProdLoteMiembro":
      return deEntry(f.produccionEntryId);
    case "ForestLoteAserrio":
      return fechaDe(f.fechaApertura) ?? fechaDe(f.createdAt);
    case "ForestLoteMixto":
      return fechaDe(f.abiertoEn) ?? fechaDe(f.createdAt);
    case "ForestProdLote":
      return fechaDe(f.fechaInicio) ?? fechaDe(f.createdAt);
    case "ForestGuiaGuardada":
      return fechaDe(f.gtfDate) ?? fechaDe(f.createdAt);
    case "CampoPersonalizadoValor": {
      const c = cabezaDe(R, H, claveDeRegistro(R, H, txt(f.registroId) ?? "?"));
      return c ? fechaDeFila(R, H, c.tabla, c.fila) : null;
    }
  }
}

// ── Etiquetas y cifras del grupo ────────────────────────────────────────────

export function etiquetaEntry(e: FilaSerial): string {
  const fecha = fmt(fechaDe(e.entryDate));
  if (e.section === "despacho") return `salida ${fecha} · GTF ${txt(e.gtfNumber) ?? "s/n"}`;
  const que = txt(e.speciesCommon) ?? txt(e.productType) ?? "";
  return `corrida ${fecha}${que ? ` · ${que}` : ""}${e.lineNo != null ? ` (N.° ${String(e.lineNo)})` : ""}`;
}

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function etiquetaYCifras(
  R: Indice,
  H: Indice,
  clave: string,
  tipo: GrupoDiffTipo,
  filas: FilaGrupo[],
): Pick<GrupoDiffRespaldo, "etiqueta" | "fecha" | "pt" | "m3" | "piezas"> {
  const cab = cabezaDe(R, H, clave);
  const fuente = cab && R[cab.tabla].has(String(cab.fila.id)) ? R : H;
  const id = cab ? String(cab.fila.id) : "";
  const fecha = cab ? fechaDeFila(R, H, cab.tabla, cab.fila)?.toISOString().slice(0, 10) ?? null : null;
  const suma = (xs: FilaSerial[], c: string) => xs.reduce((s, x) => s + (numeroDe(x[c]) ?? 0), 0);
  if (!cab) {
    const t = filas[0]?.tabla;
    return { etiqueta: t ? `${ETIQUETA_TABLA_RESPALDO[t]} sin registro` : "Otros", fecha: null, pt: null, m3: null, piezas: null };
  }
  const f = cab.fila;
  if (tipo === "ingreso") {
    const trozas = [...fuente.WoodEntryTroza.values()].filter((t) => t.woodEntryId === id);
    const pt = suma(trozas, "oxPt");
    return {
      etiqueta: `GTF ${txt(f.gtfNumber) ?? "s/n"}${txt(f.providerName) ? ` · ${txt(f.providerName)}` : ""}`,
      fecha,
      pt: pt > 0 ? r2(pt) : null,
      m3: numeroDe(f.volumeM3) != null ? r4(numeroDe(f.volumeM3) ?? 0) : null,
      piezas: numeroDe(f.pieces) ?? (trozas.length || null),
    };
  }
  if (tipo === "corrida" || tipo === "salida") {
    const paq = [...fuente.ForestCtpPaquete.values()].filter((p) => p.ctpEntryId === id);
    const ptPaq = suma(paq, "pieTablar");
    const enPt = /pt|pie/i.test(txt(f.unit) ?? "");
    const m3Paq = suma(paq, "volumenM3");
    const m3 = tipo === "corrida" ? (numeroDe(f.volumeInputM3) ?? (m3Paq || null)) : m3Paq || null;
    return {
      etiqueta: mayus(etiquetaEntry(f)),
      fecha,
      pt: ptPaq > 0 ? r2(ptPaq) : enPt ? numeroDe(f.quantity) : null,
      m3: m3 != null ? r4(m3) : null,
      piezas: numeroDe(f.pieces) ?? (paq.length ? suma(paq, "cantidad") : null),
    };
  }
  if (tipo === "lote") {
    const nombre =
      cab.tabla === "ForestLoteAserrio" ? `Lote de aserrío ${txt(f.code) ?? ""}`
      : cab.tabla === "ForestLoteMixto" ? `Lote mixto ${txt(f.code) ?? ""}`
      : `Lote ${txt(f.loteCode) ?? ""}`;
    const campo = cab.tabla === "ForestLoteMixto" ? "loteMixtoId" : "loteAserrioId";
    const trozas = cab.tabla === "ForestProdLote" ? [] : [...fuente.WoodEntryTroza.values()].filter((t) => t[campo] === id);
    return { etiqueta: nombre.trim(), fecha, pt: null, m3: trozas.length ? r4(suma(trozas, "volumenM3")) : null, piezas: trozas.length || null };
  }
  return { etiqueta: `Guía a medio llenar ${txt(f.gtfNumber) ?? ""}`.trim(), fecha, pt: null, m3: null, piezas: null };
}

// ── Análisis por grupo ──────────────────────────────────────────────────────

export interface FilaGrupo {
  tabla: TablaRespaldo;
  id: string;
  estado: EstadoDiffRespaldo;
}

export interface Rehook {
  trozaId: string;
  campo: "consumidaEnId" | "despachadaEnId";
  entryId: string;
  fecha: ValorSerial;
  /** A qué apunta HOY (una corrida muerta o null): el UPDATE lo exige en el WHERE. */
  actual: string | null;
  /** A qué apunta HOY el OTRO campo (consumo ↔ salida en rollo): también va en el WHERE. */
  otroActual: string | null;
}

/** Lo que traería un grupo si se marca (antes de mirar los demás marcados). */
export interface PlanGrupo {
  clave: string;
  etiqueta: string;
  inserts: { tabla: TablaRespaldo; fila: FilaSerial }[];
  restores: { tabla: TablaRespaldo; fila: FilaSerial }[];
  rehooks: Rehook[];
  /** Grupos que tienen que volver con este (el ingreso de sus trozas, la corrida de una salida). */
  requiere: Set<string>;
  avisos: string[];
  bloqueo: string | null;
  /** Por qué no trae nada aunque haya filas borradas (consumos de una corrida editada). */
  sinNada: string | null;
}

export interface Analisis {
  R: Indice;
  H: Indice;
  diff: Record<TablaRespaldo, DiffTabla>;
  grupos: GrupoDiffRespaldo[];
  planes: Map<string, PlanGrupo>;
}

/** Padres por FK: [columna, tabla, obligatoria]. Las no obligatorias son `SetNull`. */
export const PADRES: Partial<Record<TablaRespaldo, readonly (readonly [string, TablaRespaldo, boolean])[]>> = {
  WoodEntryTroza: [
    ["woodEntryId", "WoodEntry", true],
    ["trozaOrigenId", "WoodEntryTroza", true],
    ["loteAserrioId", "ForestLoteAserrio", false],
    ["loteMixtoId", "ForestLoteMixto", false],
    ["consumidaEnId", "ForestCtpEntry", false],
    ["despachadaEnId", "ForestCtpEntry", false],
  ],
  ForestLoteAserrio: [["loteMixtoId", "ForestLoteMixto", false]],
  ForestCtpPaquete: [["ctpEntryId", "ForestCtpEntry", true]],
  ForestCtpApartado: [
    ["ctpEntryId", "ForestCtpEntry", true],
    ["paqueteId", "ForestCtpPaquete", true],
  ],
  ForestCtpConsumo: [
    ["ctpEntryId", "ForestCtpEntry", true],
    ["woodEntryId", "WoodEntry", true],
  ],
  ForestCtpDespachoOrigen: [
    ["despachoEntryId", "ForestCtpEntry", true],
    ["produccionEntryId", "ForestCtpEntry", true],
  ],
  ForestCtpReproceso: [
    ["origenEntryId", "ForestCtpEntry", true],
    ["destinoEntryId", "ForestCtpEntry", true],
  ],
  ForestProdLoteMiembro: [
    ["loteId", "ForestProdLote", true],
    ["produccionEntryId", "ForestCtpEntry", true],
  ],
};

/** Puentes que se REESCRIBEN al editar (borran y crean con id nuevo): [tabla, columna de su dueño, qué son]. */
const PUENTES_REESCRITOS: readonly (readonly [TablaRespaldo, string, string])[] = [
  ["ForestCtpConsumo", "ctpEntryId", "consumos"],
  ["ForestCtpDespachoOrigen", "despachoEntryId", "orígenes"],
  ["ForestCtpReproceso", "destinoEntryId", "reprocesos"],
  /* Editar un lote comercial borra y vuelve a crear sus miembros (`forest-lote.db.ts`). */
  ["ForestProdLoteMiembro", "loteId", "miembros"],
];

export const TOLERANCIA_M3 = 0.001;

/**
 * Guías (ingresos) que con lo recuperado quedarían con más m³ consumidos que
 * los que entraron, y que antes no lo estaban. `vivaDespues` dice si una
 * corrida queda viva tras recuperar. Mismo cálculo por grupo y para el total.
 */
export function guiasExcedidas(
  R: Indice,
  H: Indice,
  consumosNuevos: readonly FilaSerial[],
  vivaDespues: (entryId: string) => boolean,
): string[] {
  const antes = new Map<string, number>();
  const despues = new Map<string, number>();
  const sumar = (m: Map<string, number>, w: string, v: number) => m.set(w, (m.get(w) ?? 0) + v);
  for (const c of H.ForestCtpConsumo.values()) {
    const w = txt(c.woodEntryId) ?? "";
    const e = txt(c.ctpEntryId) ?? "";
    const v = numeroDe(c.volumeM3) ?? 0;
    if (vivo(H.ForestCtpEntry.get(e))) sumar(antes, w, v);
    if (vivaDespues(e)) sumar(despues, w, v);
  }
  for (const c of consumosNuevos) if (vivaDespues(txt(c.ctpEntryId) ?? "")) sumar(despues, txt(c.woodEntryId) ?? "", numeroDe(c.volumeM3) ?? 0);
  const out: string[] = [];
  for (const [w, d] of despues) {
    const ingreso = H.WoodEntry.get(w) ?? R.WoodEntry.get(w);
    const tope = numeroDe(ingreso?.volumeM3);
    const a = antes.get(w) ?? 0;
    if (tope != null && d > tope + TOLERANCIA_M3 && d > a + TOLERANCIA_M3) {
      out.push(`la guía GTF ${txt(ingreso?.gtfNumber) ?? "s/n"} quedaría con ${r4(d)} m³ consumidos de ${r4(tope)} m³ que entraron`);
    }
  }
  return out;
}

function planDeGrupo(R: Indice, H: Indice, ctx: ContextoRespaldo, clave: string, etiqueta: string, filas: FilaGrupo[]): PlanGrupo {
  const plan: PlanGrupo = { clave, etiqueta, inserts: [], restores: [], rehooks: [], requiere: new Set(), avisos: [], bloqueo: null, sinNada: null };
  const bloquear = (m: string) => {
    plan.bloqueo ??= m;
  };
  const cab = cabezaDe(R, H, clave);
  const entryId = cab?.tabla === "ForestCtpEntry" ? String(cab.fila.id) : null;

  /* 1) Candidatas: borradas → insertar; dadas de baja → deshacer la baja.
        Los puentes que la corrida reescribió hoy NO: contarían dos veces. */
  const excluidos = new Set<string>();
  const loteId = cab?.tabla === "ForestProdLote" ? String(cab.fila.id) : null;
  for (const [t, col, que] of PUENTES_REESCRITOS) {
    const esLote = t === "ForestProdLoteMiembro";
    const duenoId = esLote ? loteId : entryId;
    if (!duenoId || !filas.some((x) => x.tabla === t && x.estado === "borrada")) continue;
    /* Un lote se reescribe con ids nuevos; los miembros que siguen con su id
       (los de otras corridas cuando se vació una) no dicen que se editó. */
    if ([...H[t].values()].some((f) => f[col] === duenoId && (!esLote || !R[t].has(String(f.id))))) {
      excluidos.add(t);
      const quien = esLote ? "el lote" : cab?.fila.section === "despacho" ? "la salida" : "la corrida";
      plan.avisos.push(`Los ${que} viejos de ${etiqueta} no vuelven: ${quien} se editó después y sus ${que} de hoy mandan.`);
      plan.sinNada = `${mayus(quien)} se editó después; sus ${que} de hoy mandan.`;
    }
  }
  for (const x of filas) {
    if (x.estado === "borrada" && !excluidos.has(x.tabla)) {
      const f = R[x.tabla].get(x.id);
      if (f) plan.inserts.push({ tabla: x.tabla, fila: f });
    } else if (x.estado === "de_baja") {
      const f = R[x.tabla].get(x.id);
      if (f) plan.restores.push({ tabla: x.tabla, fila: f });
    }
  }

  /* 1b) Cobro de aserrío (ForestCuentaMov de la corrida): vuelve SOLO con su
        corrida y si hoy no tiene otro vivo. Quitar el cobro lo da de baja
        (`forest-aserrio.db.ts`): traerlo solo cobraría un aserrío que la
        corrida ya no declara, y otro vivo choca con el índice parcial
        `ForestCuentaMov_tenantId_ctpEntryId_vivo_key`. */
  const vuelveLaCorrida =
    !!entryId &&
    (plan.restores.some((r) => r.tabla === "ForestCtpEntry" && String(r.fila.id) === entryId) ||
      plan.inserts.some((i) => i.tabla === "ForestCtpEntry" && String(i.fila.id) === entryId && vivo(i.fila)));
  const cobroSirve = (f: FilaSerial) =>
    vuelveLaCorrida &&
    ![...H.ForestCuentaMov.values()].some((h) => h.id !== f.id && h.deletedAt == null && h.ctpEntryId != null && h.ctpEntryId === f.ctpEntryId);
  let cobrosFuera = 0;
  const sinCobroAjeno = (xs: { tabla: TablaRespaldo; fila: FilaSerial }[]) =>
    xs.filter((x) => {
      if (x.tabla !== "ForestCuentaMov" || txt(x.fila.ctpEntryId) == null || cobroSirve(x.fila)) return true;
      cobrosFuera++;
      return false;
    });
  plan.inserts = sinCobroAjeno(plan.inserts);
  plan.restores = sinCobroAjeno(plan.restores);
  if (cobrosFuera > 0) {
    plan.avisos.push(
      vuelveLaCorrida
        ? `El cobro de aserrío viejo de ${etiqueta} no vuelve: hoy ya tiene otro.`
        : `El cobro de aserrío de ${etiqueta} no vuelve: la corrida sigue y hoy no lo declara.`,
    );
    plan.sinNada ??= vuelveLaCorrida ? "Hoy ya tiene otro cobro de aserrío." : "El cobro de aserrío se quitó después: hoy la corrida no lo declara.";
  }

  /* 2) Hija sin padre (ni hoy ni en el respaldo) → se salta; padre que vuelve
        con otro grupo → ese grupo es requisito. */
  plan.inserts = plan.inserts.filter(({ tabla, fila: f }) => {
    for (const [col, tp, obligatoria] of PADRES[tabla] ?? []) {
      const pid = txt(f[col]);
      if (!obligatoria || !pid || H[tp].has(pid)) continue;
      const padre = R[tp].get(pid);
      if (!padre) {
        plan.avisos.push(`${ETIQUETA_TABLA_RESPALDO[tabla]} de ${etiqueta}: una fila no vuelve porque ya no existe a qué colgarla.`);
        return false;
      }
      const cp = claveDeFila(R, H, tp, padre);
      if (cp !== clave) plan.requiere.add(cp);
    }
    return true;
  });

  /* 3) Mes cerrado: nunca se toca ni se reabre. */
  for (const { tabla, fila: f } of [...plan.inserts, ...plan.restores]) {
    const mes = ctx.mesCerrado(fechaDeFila(R, H, tabla, f));
    if (mes) bloquear(`El mes ${mes} está cerrado: lo de ese mes ya se presentó a SERFOR y no se toca.`);
  }

  /* 4) Columnas: una obligatoria de hoy que el respaldo no tiene. */
  for (const t of new Set(plan.inserts.map((i) => i.tabla))) {
    const hoy = ctx.columnasHoy?.[t];
    if (!hoy) continue;
    const tenia = new Set(ctx.columnasRespaldo?.[t] ?? Object.keys(plan.inserts.find((i) => i.tabla === t)?.fila ?? {}));
    const falta = hoy.find((c) => c.obligatoria && !tenia.has(c.nombre));
    if (falta) bloquear(`Este respaldo es anterior a un dato que hoy el libro pide (${ETIQUETA_TABLA_RESPALDO[t]} · ${falta.nombre}): no se puede traer.`);
  }

  /* 5) Códigos únicos: lote de aserrío entre vivos (ADR-396), lote comercial y paquete en todo el libro. */
  for (const { tabla, fila: f } of [...plan.inserts, ...plan.restores]) {
    const otro = (t: TablaRespaldo, col: string, soloVivos: boolean) =>
      [...H[t].values()].find((h) => h.id !== f.id && h[col] != null && h[col] === f[col] && (!soloVivos || h.deletedAt == null));
    if (tabla === "ForestLoteAserrio" && otro(tabla, "code", true)) {
      bloquear(`El código de lote ${txt(f.code)} ya lo usa otro lote vivo: no puede haber dos.`);
    }
    const esInsert = plan.inserts.some((i) => i.fila === f);
    if (esInsert && tabla === "ForestProdLote" && otro(tabla, "loteCode", false)) bloquear(`El código de lote ${txt(f.loteCode)} ya existe.`);
    if (esInsert && tabla === "ForestCtpPaquete" && otro(tabla, "codigo", false)) bloquear(`El paquete ${txt(f.codigo)} ya existe en otra corrida.`);
  }

  /* 5b) Un paquete sale en UNA guía: mismo criterio que `exigirPaqueteLibreEnTx`
         (salida vigente con ese código que no sea salida de trozas sin aserrar). */
  for (const { tabla, fila: f } of [...plan.inserts, ...plan.restores]) {
    if (tabla !== "ForestCtpEntry" || f.section !== "despacho" || f.deletedAt != null || f.status !== "registrado") continue;
    const codigo = txt(f.codigoProducto)?.trim();
    if (!codigo) continue;
    const esPaquete = [...H.ForestCtpPaquete.values(), ...R.ForestCtpPaquete.values()].some((p) => p.codigo === codigo && p.deletedAt == null);
    if (!esPaquete) continue;
    const llevaTrozas = (id: string, I: Indice) => [...I.WoodEntryTroza.values()].some((t) => t.despachadaEnId === id);
    if (llevaTrozas(String(f.id), R)) continue;
    const otra = [...H.ForestCtpEntry.values()].find(
      (e) =>
        e.id !== f.id &&
        e.section === "despacho" &&
        e.deletedAt == null &&
        e.status === "registrado" &&
        e.codigoProducto === codigo &&
        !llevaTrozas(String(e.id), H),
    );
    if (otra) bloquear(`El paquete ${codigo} ya va en la ${etiquetaEntry(otra)}: un paquete sale en una sola guía.`);
  }

  /* 5c) L1 de lotes comerciales: una corrida en otro lote vivo de hoy no puede
         sumar más de lo que produjo. Cuentan los miembros que entran y los de
         un lote anulado que vuelve. */
  const loteVivo = (id: string) => {
    const l = H.ForestProdLote.get(id);
    return !!l && l.deletedAt == null && l.status !== "anulado";
  };
  const lotesQueVuelven = new Set(plan.restores.filter((r) => r.tabla === "ForestProdLote").map((r) => String(r.fila.id)));
  const miembrosQueEntran = [
    ...plan.inserts.filter((i) => i.tabla === "ForestProdLoteMiembro").map((i) => i.fila),
    ...[...H.ForestProdLoteMiembro.values()].filter((m) => lotesQueVuelven.has(txt(m.loteId) ?? "")),
  ];
  for (const m of miembrosQueEntran) {
    const corridaId = txt(m.produccionEntryId) ?? "";
    const enOtros = [...H.ForestProdLoteMiembro.values()].filter(
      (h) => h.produccionEntryId === corridaId && h.loteId !== m.loteId && loteVivo(txt(h.loteId) ?? ""),
    );
    if (enOtros.length === 0) continue;
    const yaEnLotes = enOtros.reduce((s, h) => s + (numeroDe(h.quantity) ?? 0), 0);
    const corrida = fila(R, H, "ForestCtpEntry", corridaId);
    const producido = numeroDe(corrida?.quantity);
    if (producido == null || r4(numeroDe(m.quantity) ?? 0) > r4(producido - yaEnLotes)) {
      const codigoLote = txt(H.ForestProdLote.get(txt(enOtros[0].loteId) ?? "")?.loteCode);
      bloquear(
        `La ${corrida ? etiquetaEntry(corrida) : "corrida"} ya está en ${codigoLote ? `el lote ${codigoLote}` : "otro lote"}: no puede ir en dos lotes por más de lo que produjo.`,
      );
    }
  }

  /* 6) Trozas de la corrida: vuelven a ella solo si hoy están libres. */
  const traeCabeza = !!entryId && [...plan.inserts, ...plan.restores].some((i) => i.tabla === "ForestCtpEntry");
  const traeMadera =
    traeCabeza ||
    plan.inserts.some((i) => i.tabla === "ForestCtpConsumo" || i.tabla === "ForestCtpDespachoOrigen");
  if (entryId && traeMadera) {
    for (const campo of ["consumidaEnId", "despachadaEnId"] as const) {
      for (const t of R.WoodEntryTroza.values()) {
        if (t[campo] !== entryId) continue;
        const h = H.WoodEntryTroza.get(String(t.id));
        const nombre = nombreTroza(t);
        if (!h) {
          const cp = claveDeFila(R, H, "WoodEntryTroza", t);
          if (cp !== clave) plan.requiere.add(cp);
          continue;
        }
        const actual = txt(h[campo]);
        if (actual === entryId) continue;
        if (campo === "consumidaEnId") {
          if (h.noRecepcionada === true) bloquear(`La troza ${nombre} hoy figura como no recibida: no puede volver a la corrida.`);
          if (h.descarte === true) bloquear(`La troza ${nombre} hoy es descarte: no puede volver a la corrida.`);
          const hoyRetrozada = [...H.WoodEntryTroza.values()].some((x) => x.trozaOrigenId === t.id);
          const antesRetrozada = [...R.WoodEntryTroza.values()].some((x) => x.trozaOrigenId === t.id);
          if (hoyRetrozada && !antesRetrozada) bloquear(`La troza ${nombre} se retrozó después: hoy van sus pedazos.`);
        }
        const otra = actual ? H.ForestCtpEntry.get(actual) : undefined;
        if (otra && vivo(otra)) {
          bloquear(`La troza ${nombre} ya entró en la ${etiquetaEntry(otra)}.`);
          continue;
        }
        /* El OTRO camino de la troza (aserrada ↔ vendida en rollo): si hoy
           salió por ahí, volverla dejaría la misma troza aserrada y vendida. */
        const otroCampo = campo === "consumidaEnId" ? "despachadaEnId" : "consumidaEnId";
        const otroActual = txt(h[otroCampo]);
        const otraVia = otroActual ? H.ForestCtpEntry.get(otroActual) : undefined;
        if (otraVia && vivo(otraVia)) {
          bloquear(`La troza ${nombre} ya ${otroCampo === "despachadaEnId" ? "salió en rollo en" : "entró en"} la ${etiquetaEntry(otraVia)}.`);
          continue;
        }
        const campoFecha = campo === "consumidaEnId" ? "fechaConsumo" : "fechaDespacho";
        plan.rehooks.push({ trozaId: String(t.id), campo, entryId, fecha: t[campoFecha] ?? null, actual, otroActual });
      }
    }
  }

  /* 6b) Pedazos (retrozos) que vuelven: si la madre hoy entró en una corrida
         o salió en una guía viva, la purga borró los pedazos y dejó la madre
         (T1: contar las dos es la misma madera dos veces). */
  for (const { tabla, fila: f } of plan.inserts) {
    if (tabla !== "WoodEntryTroza") continue;
    const madre = H.WoodEntryTroza.get(txt(f.trozaOrigenId) ?? "");
    if (!madre) continue;
    /* La madre se volvió a trozar después: dos juegos de pedazos = la misma madera dos veces. */
    const pedazosNuevos = [...H.WoodEntryTroza.values()].some((x) => x.trozaOrigenId === madre.id && !R.WoodEntryTroza.has(String(x.id)));
    if (pedazosNuevos) bloquear(`La troza ${nombreTroza(madre)} se volvió a trozar después; sus pedazos de hoy mandan.`);
    for (const c of ["consumidaEnId", "despachadaEnId"] as const) {
      const en = H.ForestCtpEntry.get(txt(madre[c]) ?? "");
      if (en && vivo(en)) bloquear(`La troza madre ${nombreTroza(madre)} ya entró en la ${etiquetaEntry(en)}: sus pedazos no pueden volver.`);
    }
  }

  /* 7) Madera de una guía contada dos veces (m³ por guía). */
  const consumos = plan.inserts.filter((i) => i.tabla === "ForestCtpConsumo").map((i) => i.fila);
  if (consumos.length > 0 || plan.restores.some((r) => r.tabla === "ForestCtpEntry")) {
    const restaurada = new Set(plan.restores.filter((r) => r.tabla === "ForestCtpEntry").map((r) => String(r.fila.id)));
    const insertada = new Set(plan.inserts.filter((i) => i.tabla === "ForestCtpEntry" && vivo(i.fila)).map((i) => String(i.fila.id)));
    const exceso = guiasExcedidas(R, H, consumos, (e) => restaurada.has(e) || insertada.has(e) || vivo(H.ForestCtpEntry.get(e)));
    if (exceso.length > 0) bloquear(`${mayus(exceso[0])}: esa madera ya la usó otra corrida.`);
  }
  return plan;
}

export const tieneAlgo = (p: PlanGrupo) => p.inserts.length + p.restores.length + p.rehooks.length > 0;

const PRIORIDAD: Record<EstadoDiffRespaldo, number> = { borrada: 0, de_baja: 1, cambiada: 2, nueva: 3 };

/** Comparar entero: listas por tabla, grupos con su «se puede recuperar» y el plan de cada uno. */
export function analizar(respaldo: TablasSerial, hoy: TablasSerial, ctx: ContextoRespaldo): Analisis {
  const R = indexar(respaldo);
  const H = indexar(hoy);
  const diff = diffPorTabla(R, H);

  const porGrupo = new Map<string, FilaGrupo[]>();
  const meter = (t: TablaRespaldo, id: string, estado: EstadoDiffRespaldo, f: FilaSerial) => {
    const k = claveDeFila(R, H, t, f);
    const lista = porGrupo.get(k) ?? [];
    lista.push({ tabla: t, id, estado });
    porGrupo.set(k, lista);
  };
  for (const t of TABLAS_RESPALDO) {
    const d = diff[t];
    for (const id of d.borradas) meter(t, id, "borrada", R[t].get(id) as FilaSerial);
    for (const id of d.deBaja) meter(t, id, "de_baja", R[t].get(id) as FilaSerial);
    for (const id of d.cambiadas) meter(t, id, "cambiada", R[t].get(id) as FilaSerial);
    for (const id of d.nuevas) meter(t, id, "nueva", H[t].get(id) as FilaSerial);
  }

  const grupos: GrupoDiffRespaldo[] = [];
  const planes = new Map<string, PlanGrupo>();
  for (const [clave, filas] of porGrupo) {
    const tipo = clave.slice(0, clave.indexOf(":")) as GrupoDiffTipo;
    const cab = cabezaDe(R, H, clave);
    const filaCab = cab ? filas.find((x) => x.tabla === cab.tabla && x.id === String(cab.fila.id)) : undefined;
    const estado: EstadoDiffRespaldo =
      filaCab && (filaCab.estado === "borrada" || filaCab.estado === "de_baja") ? filaCab.estado
      : filas.some((x) => x.estado === "borrada") ? "borrada"
      : filas.some((x) => x.estado === "de_baja") ? "de_baja"
      : (filaCab?.estado ?? [...filas].sort((a, b) => PRIORIDAD[a.estado] - PRIORIDAD[b.estado])[0].estado);
    const porTabla: Partial<Record<TablaRespaldo, ConteoDiffTabla>> = {};
    for (const x of filas) {
      const c = (porTabla[x.tabla] ??= { borradas: 0, deBaja: 0, cambiadas: 0, nuevas: 0 });
      if (x.estado === "borrada") c.borradas++;
      else if (x.estado === "de_baja") c.deBaja++;
      else if (x.estado === "cambiada") c.cambiadas++;
      else c.nuevas++;
    }
    const base = etiquetaYCifras(R, H, clave, tipo, filas);
    grupos.push({ clave, tipo, estado, ...base, filas: porTabla, recuperable: false, motivo: null });
    if (estado === "borrada" || estado === "de_baja") planes.set(clave, planDeGrupo(R, H, ctx, clave, base.etiqueta, filas));
  }

  /* Un grupo que necesita otro que no puede volver, tampoco vuelve (hasta que no cambie nada). */
  const etiquetaDe = new Map(grupos.map((g) => [g.clave, g.etiqueta]));
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const p of planes.values()) {
      if (p.bloqueo) continue;
      for (const r of p.requiere) {
        const pr = planes.get(r);
        if (!pr || pr.bloqueo || !tieneAlgo(pr)) {
          const nombre = etiquetaDe.get(r) ?? cabezaDe(R, H, r)?.fila.gtfNumber ?? r;
          p.bloqueo = `Necesita ${String(nombre)}, que no se puede traer${pr?.bloqueo ? ` (${pr.bloqueo.replace(/\.$/, "")})` : ""}.`;
          cambio = true;
          break;
        }
      }
    }
  }

  for (const g of grupos) {
    const p = planes.get(g.clave);
    if (!p) {
      g.motivo = g.estado === "cambiada" ? "Existe hoy con otros datos: no se pisa." : "Es posterior al respaldo: no hay nada que recuperar.";
      continue;
    }
    g.recuperable = !p.bloqueo && tieneAlgo(p);
    g.motivo = g.recuperable ? null : (p.bloqueo ?? p.sinNada ?? "No queda nada que traer.");
  }
  grupos.sort((a, b) => PRIORIDAD[a.estado] - PRIORIDAD[b.estado] || (b.fecha ?? "").localeCompare(a.fecha ?? "") || a.clave.localeCompare(b.clave));
  return { R, H, diff, grupos, planes };
}

/** Filas por estado, todas las tablas. */
export function totalesDe(diff: Record<TablaRespaldo, DiffTabla>): Record<EstadoDiffRespaldo, number> {
  const out: Record<EstadoDiffRespaldo, number> = { borrada: 0, de_baja: 0, cambiada: 0, nueva: 0 };
  for (const t of TABLAS_RESPALDO) {
    out.borrada += diff[t].borradas.length;
    out.de_baja += diff[t].deBaja.length;
    out.cambiada += diff[t].cambiadas.length;
    out.nueva += diff[t].nuevas.length;
  }
  return out;
}
