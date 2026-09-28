/**
 * El censo visto DESDE EL LIBRO: qué árbol se puede talar, cuál ya se taló
 * (en qué línea, cuántas trozas salieron, cuántas se despacharon) y cuál no se
 * debe tocar aunque siga en pie.
 *
 * Por qué no alcanza el `estado` del censo: el censo pasa a «talado» con un
 * fire-and-forget después de asentar la línea (`markTreeStatusByCode`), y si
 * eso falla —o el censo se reimporta— queda «en pie» un árbol ya tumbado.
 * Medido el 28-09 en el tenant de QA: el 85-TOR figuraba en pie, disponible en
 * el buscador de la tala, con su línea N° 1 asentada, 4 trozas y 2 despachadas;
 * elegirlo terminaba en el rechazo de T3 al guardar. Acá manda el libro.
 *
 * Puro a propósito: la DB class arma el resumen, el modal «Ver censo» y la
 * ficha del árbol lo leen, y los tests lo prueban sin montar nada.
 */

import { analizarPoa, type PoaCategoria, type PoaConfig } from "./loth-poa";
import { distanceM, fromUtm, parseUtmZone } from "./loth-utm";
import { formatDateNumeric, formatWeekday } from "@/lib/format";

// ─── Lo que el libro ya hizo con cada árbol ──────────────────────────────────

/** Una línea del libro, en el mínimo que hace falta para contar su uso. */
export interface LineaParaUso {
  section: string;
  lineNo: number;
  entryDate: Date | string;
  treeCode: string | null;
  trozaCode: string | null;
  volumeM3: number | null;
}

export interface UsoArbolCenso {
  treeCode: string;
  /** La línea de tala (una sola: T3). `fecha` es `AAAA-MM-DD`. */
  tala: { lineNo: number; fecha: string; volumeM3: number | null } | null;
  trozas: number;
  trozasM3: number;
  despachadas: number;
  consumidas: number;
}

/** El árbol de una troza: «85-TOR-A» → «85-TOR», «111-A» → «111». */
export function arbolDeTroza(trozaCode: string): string {
  const t = trozaCode.trim();
  return t.includes("-") ? t.replace(/-[A-Za-z0-9]+$/, "") : t;
}

function diaIso(v: Date | string): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/**
 * Suma, por árbol, lo que el libro asentó: la tala, las trozas del trozado y
 * cuántas de esas trozas salieron (despacho) o se consumieron.
 *
 * El despacho y el consumo sólo traen el código de troza: su árbol sale del
 * trozado que la creó y, si no hay, del propio código («85-TOR-A» → «85-TOR»).
 */
export function resumirUsoDelCenso(lineas: readonly LineaParaUso[]): UsoArbolCenso[] {
  const porArbol = new Map<string, UsoArbolCenso>();
  const uso = (code: string): UsoArbolCenso => {
    let u = porArbol.get(code);
    if (!u) {
      u = { treeCode: code, tala: null, trozas: 0, trozasM3: 0, despachadas: 0, consumidas: 0 };
      porArbol.set(code, u);
    }
    return u;
  };
  const arbolDe = new Map<string, string>();
  const ordenadas = [...lineas].sort((a, b) => a.lineNo - b.lineNo);

  for (const l of ordenadas) {
    if (l.section !== "tala" || !l.treeCode?.trim()) continue;
    const u = uso(l.treeCode.trim());
    if (!u.tala) u.tala = { lineNo: l.lineNo, fecha: diaIso(l.entryDate), volumeM3: l.volumeM3 };
  }
  for (const l of ordenadas) {
    if (l.section !== "trozado") continue;
    const troza = l.trozaCode?.trim() ?? "";
    const arbol = l.treeCode?.trim() || (troza ? arbolDeTroza(troza) : "");
    if (!arbol) continue;
    if (troza) arbolDe.set(troza, arbol);
    const u = uso(arbol);
    u.trozas += 1;
    u.trozasM3 += l.volumeM3 ?? 0;
  }
  for (const l of ordenadas) {
    if (l.section !== "despacho_troza" && l.section !== "consumo_troza") continue;
    const troza = l.trozaCode?.trim();
    if (!troza) continue;
    const u = uso(arbolDe.get(troza) ?? arbolDeTroza(troza));
    if (l.section === "despacho_troza") u.despachadas += 1;
    else u.consumidas += 1;
  }
  for (const u of porArbol.values()) u.trozasM3 = Number(u.trozasM3.toFixed(4));
  return [...porArbol.values()];
}

// ─── El árbol listo para elegir ──────────────────────────────────────────────

/** Un árbol del censo, con números ya leídos (el GET los manda como texto). */
export interface ArbolCensoTala {
  id: string;
  treeCode: string;
  speciesCommon: string;
  speciesScientific: string | null;
  speciesNative: string | null;
  cites: boolean;
  dapM: number | null;
  hcM: number | null;
  volM3: number | null;
  utmZona: string | null;
  utmX: number | null;
  utmY: number | null;
  condicion: string | null;
  notes: string | null;
  estadoCenso: string;
}

export type Disponibilidad = "disponible" | "talado" | "descartado";

/** Lo que hay que saber antes de tumbarlo. `infraccion` pide confirmar fuerte. */
export interface Reparo {
  nivel: "infraccion" | "aviso";
  titulo: string;
  detalle: string;
}

export interface ArbolParaElegir extends ArbolCensoTala {
  categoria: PoaCategoria | null;
  dmcCm: number | null;
  uso: UsoArbolCenso | null;
  disponibilidad: Disponibilidad;
  /** Por qué no se elige; `null` si está disponible. */
  motivoNoDisponible: string | null;
  reparo: Reparo | null;
  /** El censo dice una cosa y el libro otra (el libro manda). */
  desfase: string | null;
}

/** «lunes 28/09» — la fecha date-only del libro, sin correrse un día en Lima. */
export function diaDelLibro(fecha: string | null | undefined): string {
  if (!fecha) return "";
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatWeekday(d, { largo: true, soloFecha: true })} ${formatDateNumeric(d, { soloFecha: true }).slice(0, 5)}`;
}

const normal = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** La condición que el REGENTE declaró y que deja al árbol en pie. */
function condicionQueLoProtege(condicion: string | null): "semillero" | "remanente" | null {
  const c = normal(condicion);
  if (c.startsWith("semiller")) return "semillero";
  if (c.startsWith("remanente")) return "remanente";
  return null;
}

function reparoDe(a: ArbolCensoTala, categoria: PoaCategoria | null, dmcCm: number | null): Reparo | null {
  const protegido = condicionQueLoProtege(a.condicion);
  if (protegido === "semillero") {
    return {
      nivel: "infraccion",
      titulo: "El regente lo declaró semillero",
      detalle: "Queda en pie para que el bosque se regenere. Talarlo es infracción.",
    };
  }
  if (protegido === "remanente") {
    return {
      nivel: "infraccion",
      titulo: "El regente lo declaró remanente",
      detalle: "Queda para la próxima cosecha: este plan no autoriza tumbarlo.",
    };
  }
  if (categoria === "bajo_dmc") {
    const dap = a.dapM != null ? Math.round(a.dapM * 100) : null;
    return {
      nivel: "infraccion",
      titulo: "Bajo el diámetro mínimo de corta",
      detalle: `DAP ${dap ?? "—"} cm, el mínimo de ${a.speciesCommon} es ${dmcCm ?? "—"} cm. Sin un motivo escrito el libro no lo acepta.`,
    };
  }
  if (categoria === "semillero") {
    /* El cálculo del plan reserva los más gruesos de cada especie. Si el censo
       del regente lo declara aprovechable, NO es una infracción: es un aviso.
       Medido 28-09 en Blas: 11 reservados por el cálculo, 0 declarados
       semilleros por el regente (los 65 dicen «Aprovechable»). */
    return {
      nivel: "aviso",
      titulo: "Reservado como semillero en el plan",
      detalle: "Es de los más gruesos de su especie. Confirma con el regente antes de tumbarlo.",
    };
  }
  return null;
}

/**
 * Cruza el censo con el libro y con el POA.
 *
 * El POA se calcula con el estado DEL LIBRO: un árbol ya talado no puede
 * ocupar el lugar de un semillero (si no, el cálculo reserva un tocón y deja
 * sin reserva al árbol que sí está en pie).
 */
export function prepararArboles(
  arboles: readonly ArbolCensoTala[],
  usos: readonly UsoArbolCenso[],
  config?: Partial<PoaConfig>,
): ArbolParaElegir[] {
  const usoDe = new Map(usos.map((u) => [u.treeCode, u]));
  const estadoReal = (a: ArbolCensoTala) => (usoDe.get(a.treeCode)?.tala ? "talado" : a.estadoCenso);
  const poa = analizarPoa({
    trees: arboles.map((a) => ({
      id: a.id,
      treeCode: a.treeCode,
      speciesCommon: a.speciesCommon,
      dapM: a.dapM,
      volumenEstimadoM3: a.volM3,
      estado: estadoReal(a),
    })),
    species: [],
    areaHa: null,
    config,
  });
  const cat = new Map(poa.arboles.map((p) => [p.id, p]));

  return arboles.map((a) => {
    const uso = usoDe.get(a.treeCode) ?? null;
    const p = cat.get(a.id);
    const categoria = p?.categoria ?? null;
    const dmcCm = p?.dmcCm ?? null;
    let disponibilidad: Disponibilidad = "disponible";
    let motivoNoDisponible: string | null = null;
    let desfase: string | null = null;
    if (uso?.tala) {
      disponibilidad = "talado";
      motivoNoDisponible = `Talado el ${diaDelLibro(uso.tala.fecha)} · línea N° ${uso.tala.lineNo}`;
      if (a.estadoCenso !== "talado") desfase = "El censo todavía lo tiene en pie, pero el libro ya lo taló.";
    } else if (a.estadoCenso === "talado") {
      disponibilidad = "talado";
      motivoNoDisponible = "Marcado talado en el censo, sin línea en el libro";
    } else if (a.estadoCenso === "descartado") {
      disponibilidad = "descartado";
      motivoNoDisponible = "Descartado en el censo";
    }
    return {
      ...a,
      categoria,
      dmcCm,
      uso,
      disponibilidad,
      motivoNoDisponible,
      reparo: disponibilidad === "disponible" ? reparoDe(a, categoria, dmcCm) : null,
      desfase,
    };
  });
}

// ─── Filtros, orden y totales del modal ──────────────────────────────────────

export type FiltroCenso = "disponibles" | "talados" | "todos" | "semilleros" | "bajo_dmc";

export const FILTROS_CENSO: { key: FiltroCenso; label: string }[] = [
  { key: "disponibles", label: "Disponibles" },
  { key: "talados", label: "Talados" },
  { key: "todos", label: "Todos" },
  { key: "semilleros", label: "Semilleros" },
  { key: "bajo_dmc", label: "Bajo DMC" },
];

function pasaFiltro(a: ArbolParaElegir, filtro: FiltroCenso): boolean {
  switch (filtro) {
    case "disponibles":
      return a.disponibilidad === "disponible";
    case "talados":
      return a.disponibilidad === "talado";
    case "semilleros":
      return a.categoria === "semillero" || condicionQueLoProtege(a.condicion) === "semillero";
    case "bajo_dmc":
      return a.categoria === "bajo_dmc";
    default:
      return true;
  }
}

export function contarFiltros(arboles: readonly ArbolParaElegir[]): Record<FiltroCenso, number> {
  const n = { disponibles: 0, talados: 0, todos: 0, semilleros: 0, bajo_dmc: 0 } as Record<FiltroCenso, number>;
  for (const a of arboles) for (const f of FILTROS_CENSO) if (pasaFiltro(a, f.key)) n[f.key] += 1;
  return n;
}

/** Filtro rápido + buscador (código, especie común / científica / nativa, condición). */
export function filtrarCenso(arboles: readonly ArbolParaElegir[], filtro: FiltroCenso, texto: string): ArbolParaElegir[] {
  const q = normal(texto);
  return arboles.filter((a) => {
    if (!pasaFiltro(a, filtro)) return false;
    if (!q) return true;
    return normal(`${a.treeCode} ${a.speciesCommon} ${a.speciesScientific ?? ""} ${a.speciesNative ?? ""} ${a.condicion ?? ""}`).includes(q);
  });
}

export type ColumnaCenso = "codigo" | "especie" | "dap" | "hc" | "vol" | "condicion" | "categoria" | "estado" | "distancia";

const CODIGO = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/**
 * Orden por columna. El código es NATURAL («2» antes que «13»); los vacíos
 * van siempre al final, subiendo o bajando: un árbol sin DAP no es «el más
 * delgado».
 */
export function ordenarCenso(
  arboles: readonly ArbolParaElegir[],
  columna: ColumnaCenso,
  dir: "asc" | "desc",
  distancias?: ReadonlyMap<string, number>,
): ArbolParaElegir[] {
  const signo = dir === "asc" ? 1 : -1;
  const num = (a: ArbolParaElegir): number | null => {
    if (columna === "dap") return a.dapM;
    if (columna === "hc") return a.hcM;
    if (columna === "vol") return a.volM3;
    if (columna === "distancia") return distancias?.get(a.id) ?? null;
    return null;
  };
  const texto = (a: ArbolParaElegir): string => {
    if (columna === "especie") return a.speciesCommon;
    if (columna === "condicion") return a.condicion ?? "";
    if (columna === "categoria") return a.categoria ?? "";
    if (columna === "estado") return a.disponibilidad;
    return a.treeCode;
  };
  const esNumero = columna === "dap" || columna === "hc" || columna === "vol" || columna === "distancia";
  return [...arboles].sort((x, y) => {
    if (esNumero) {
      const a = num(x);
      const b = num(y);
      if (a == null && b == null) return CODIGO.compare(x.treeCode, y.treeCode);
      if (a == null) return 1;
      if (b == null) return -1;
      return (a - b) * signo || CODIGO.compare(x.treeCode, y.treeCode);
    }
    const a = texto(x);
    const b = texto(y);
    if (!a && b) return 1;
    if (a && !b) return -1;
    return CODIGO.compare(a, b) * signo || CODIGO.compare(x.treeCode, y.treeCode);
  });
}

export function totalesCenso(arboles: readonly ArbolParaElegir[]): { arboles: number; m3: number } {
  return {
    arboles: arboles.length,
    m3: Number(arboles.reduce((s, a) => s + (a.volM3 ?? 0), 0).toFixed(4)),
  };
}

// ─── Dónde está el árbol ─────────────────────────────────────────────────────

/** Latitud/longitud del árbol desde su UTM (zona del censo; sin zona, 18 sur). */
export function latLngDelArbol(a: Pick<ArbolCensoTala, "utmZona" | "utmX" | "utmY">): [number, number] | null {
  if (a.utmX == null || a.utmY == null || a.utmX <= 0 || a.utmY <= 0) return null;
  const { zone, south } = parseUtmZone(a.utmZona);
  const [la, ln] = fromUtm(a.utmX, a.utmY, zone, south);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  return [la, ln];
}

export function distanciaAlArbol(a: Pick<ArbolCensoTala, "utmZona" | "utmX" | "utmY">, lat: number, lng: number): number | null {
  const p = latLngDelArbol(a);
  return p ? distanceM(p, [lat, lng]) : null;
}

/**
 * Más lejos que esto del árbol censado, la pantalla pregunta si es el árbol
 * correcto. Un GPS de teléfono bajo el dosel yerra de 10 a 30 m; la
 * coordenada del regente, otro tanto. 50 m ya no es ruido.
 */
export const DISTANCIA_ALERTA_M = 50;

// ─── Lo medido contra lo censado ─────────────────────────────────────────────

export interface Comparacion {
  censo: number | null;
  medido: number | null;
  /** (medido − censo) / censo, en %. `null` si falta uno de los dos. */
  difPct: number | null;
}

function comparar(censo: number | null, medido: number | null): Comparacion {
  const ok = censo != null && censo > 0 && medido != null && medido > 0;
  return { censo, medido, difPct: ok ? Number((((medido - censo) / censo) * 100).toFixed(1)) : null };
}

/**
 * Cuánto se aparta el volumen medido del estimado para que la ficha lo marque.
 * El censo estima con DAP, altura comercial y un factor de forma; la tala mide
 * el fuste real. 30 % de diferencia ya no es la cinta: es otro árbol, una
 * medida mal anotada o un fuste hueco — y vale una línea en observaciones.
 */
export const DIFERENCIA_ALERTA_PCT = 30;

export function compararConCenso(
  a: Pick<ArbolCensoTala, "dapM" | "hcM" | "volM3">,
  medido: { diamMayorM: number | null; longitudM: number | null; volumenM3: number | null },
): { dap: Comparacion; largo: Comparacion; volumen: Comparacion; muyDistinto: boolean } {
  const volumen = comparar(a.volM3, medido.volumenM3);
  return {
    dap: comparar(a.dapM, medido.diamMayorM),
    largo: comparar(a.hcM, medido.longitudM),
    volumen,
    muyDistinto: volumen.difPct != null && Math.abs(volumen.difPct) >= DIFERENCIA_ALERTA_PCT,
  };
}
