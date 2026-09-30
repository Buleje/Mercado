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

  /* ── Lo que el libro ya sabe de la troza (2026-09-30) ──────────────────
     Todo es `null` cuando falta: una troza sin largo NO mide 0 m, y un
     Excel para OSINFOR con ceros inventados dice algo que nadie midió. */
  especieCientifica: string | null;
  /** Ø de la sección mayor y menor, y el largo aprovechable, en metros (línea de Trozado). */
  diamMayorM: number | null;
  diamMenorM: number | null;
  largoM: number | null;
  /** Código de despacho, si el libro lo anotó distinto del de la troza. */
  codigoDespacho: string | null;
  /** Plan de manejo de la línea (su N°) y la parcela de corta. */
  planId: string | null;
  plan: string | null;
  parcela: string | null;
  /** Fecha de la tala del árbol del que sale la troza (sección Tala). */
  fechaTala: string | null;
  /** Días del trozado a la salida — cuánto estuvo en el patio la que ya salió. */
  diasTrozadoASalida: number | null;
  /** Días de la tala a la salida: lo que tarda la madera en salir del monte. */
  diasTalaASalida: number | null;
  /** Fecha de la GTF (puede no coincidir con la línea de despacho). */
  fechaGuia: string | null;
  /** Del despacho: sólo la GTF los tiene; la línea del libro no los guarda. */
  placa: string | null;
  transportista: string | null;
  conductor: string | null;
  destino: string | null;
  /** ¿La línea de Trozado tiene foto de evidencia? */
  conFoto: boolean;
}

/**
 * Lo que el tablero usa de una GTF. La línea de despacho del libro sólo tiene
 * el N° de guía: placa, transportista y destino viven en `ForestGtf`.
 */
export interface GuiaTablero {
  gtfNumber: string;
  gtfDate: string | null;
  placa: string | null;
  transportista: string | null;
  conductor: string | null;
  destino: string | null;
  parcela: string | null;
  anulada: boolean;
}

/** Lo que el tablero usa de un plan de manejo. */
export interface PlanTablero {
  id: string;
  planNumber: string | null;
  parcelaCorta: string | null;
}

export interface ContextoTablero {
  guias?: readonly GuiaTablero[] | null;
  planes?: readonly PlanTablero[] | null;
}

/* ── Normalizar lo que llega de la API ──────────────────────────────────── */

const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Una fila de `/api/admin/forestal/gtf` → `GuiaTablero`.
 *
 * La guía se anota de dos formas: el formulario corto llena las columnas
 * (`placaVehiculo`, `transportista`, `destino`) y el formato SERFOR completo
 * las llena dentro de `gtfDatos`. Se lee primero la columna y, si viene
 * vacía, el casillero del formato — así una guía de cualquiera de las dos
 * formas trae su placa.
 */
export function guiaDesdeApi(raw: unknown): GuiaTablero | null {
  const g = obj(raw);
  const numero = txt(g?.gtfNumber);
  if (!g || !numero) return null;
  const datos = obj(g.gtfDatos);
  const vehiculo = obj(datos?.vehiculo);
  const transp = obj(datos?.transportista);
  const destinatario = obj(datos?.destinatario);
  const traslado = obj(datos?.traslado);
  return {
    gtfNumber: numero,
    gtfDate: txt(g.gtfDate),
    placa: txt(g.placaVehiculo) ?? txt(vehiculo?.placa),
    transportista: txt(g.transportista) ?? txt(transp?.nombre),
    conductor: txt(g.conductor) ?? txt(vehiculo?.conductor),
    destino: txt(g.destino) ?? txt(traslado?.puntoLlegada) ?? txt(destinatario?.nombre),
    parcela: txt(g.parcelaCorta),
    anulada: g.status === "anulada",
  };
}

/** Una fila de `/api/admin/forestal/plan` → `PlanTablero`. */
export function planDesdeApi(raw: unknown): PlanTablero | null {
  const p = obj(raw);
  const id = txt(p?.id);
  if (!p || !id) return null;
  return { id, planNumber: txt(p.planNumber), parcelaCorta: txt(p.parcelaCorta) };
}

/** Decimal serializado → número; vacío, basura o ≤ 0 → null (no se midió). */
function medida(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Días entre dos fechas del libro, contados por FECHA (date-only, UTC). */
export function diasEntre(desde: string | null | undefined, hasta: string | null | undefined): number | null {
  if (!desde || !hasta) return null;
  const a = Date.parse(`${desde.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
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
export function construirTablero(
  entries: readonly LothEntryDTO[],
  hoy: Date = new Date(),
  contexto: ContextoTablero = {},
): TrozaTablero[] {
  const trozadas = new Map<string, LothEntryDTO>();
  const despachos = new Map<string, LothEntryDTO>();
  const consumos = new Map<string, LothEntryDTO>();
  /* Las talas por código de árbol. Un mismo código puede repetirse en otro
     plan (cada POA numera desde 001): por eso se guardan todas y se elige la
     del mismo plan que la troza. */
  const talas = new Map<string, LothEntryDTO[]>();

  // Una guía anulada no ampara nada: su placa no es la del viaje.
  const guias = new Map<string, GuiaTablero>();
  for (const g of contexto.guias ?? []) if (!g.anulada) guias.set(g.gtfNumber.trim(), g);
  const planes = new Map<string, PlanTablero>();
  for (const p of contexto.planes ?? []) planes.set(p.id, p);

  for (const e of entries) {
    if (!viva(e)) continue;
    if (e.section === "tala" && e.treeCode?.trim()) {
      const k = e.treeCode.trim();
      talas.set(k, [...(talas.get(k) ?? []), e]);
      continue;
    }
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
    const planId = origen?.planId ?? null;
    const treeCode = origen?.treeCode?.trim() || null;
    const candidatas = treeCode ? (talas.get(treeCode) ?? []) : [];
    const tala = candidatas.find((t) => planId != null && t.planId === planId) ?? candidatas[0] ?? null;
    const gtf = des?.gtfNumber?.trim() || null;
    const guia = gtf ? (guias.get(gtf) ?? null) : null;
    const plan = planId ? (planes.get(planId) ?? null) : null;

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
      especieCientifica: origen?.speciesScientific?.trim() || null,
      diamMayorM: medida(tro?.diamMayorM),
      diamMenorM: medida(tro?.diamMenorM),
      largoM: medida(tro?.lengthM),
      codigoDespacho: des?.despachoCode?.trim() || null,
      planId,
      plan: plan?.planNumber ?? null,
      parcela: plan?.parcelaCorta ?? guia?.parcela ?? null,
      fechaTala: tala?.entryDate ?? null,
      diasTrozadoASalida: tro && fechaSalida ? diasEntre(tro.entryDate, fechaSalida) : null,
      diasTalaASalida: tala && fechaSalida ? diasEntre(tala.entryDate, fechaSalida) : null,
      fechaGuia: guia?.gtfDate ?? null,
      placa: guia?.placa ?? null,
      transportista: guia?.transportista ?? null,
      conductor: guia?.conductor ?? null,
      destino: guia?.destino ?? null,
      conFoto: Boolean(tro?.photoUrl?.trim()),
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

/**
 * Filtra el tablero. El texto busca por código de troza, de árbol, especie,
 * GTF, placa y destino (en un control de carretera se pregunta por la placa).
 */
export function filtrarTablero(filas: readonly TrozaTablero[], f: FiltroTablero): TrozaTablero[] {
  const q = (f.texto ?? "").trim().toLowerCase();
  return filas.filter((fila) => {
    if (f.estados && f.estados.length > 0 && !f.estados.includes(fila.estado)) return false;
    if (f.especie && fila.especie !== f.especie) return false;
    if (!q) return true;
    return [fila.code, fila.treeCode, fila.gtf, fila.especie, fila.placa, fila.destino].some((v) =>
      (v ?? "").toLowerCase().includes(q),
    );
  });
}

/** Las especies presentes en el tablero, para el filtro. */
export function especiesDelTablero(filas: readonly TrozaTablero[]): string[] {
  const set = new Set<string>();
  for (const f of filas) if (f.especie) set.add(f.especie);
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}
