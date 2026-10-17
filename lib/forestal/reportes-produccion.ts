/**
 * reportes-produccion.ts — el reporte de la PRODUCCIÓN del aserradero.
 *
 * Pedido de Brandon (2026-09-23): *«un apartado especializado de reportes…
 * resumen de semana, elegir cuántas semanas, gráficos de progreso semanal,
 * mensual, días, rango… lo de madera de los dueños y permisos»*.
 *
 * El Tablero ya mira las cuatro secciones del libro en m³ y la tira de días
 * dice lo de UNA semana. Lo que faltaba es la pregunta del dueño sobre lo que
 * salió de la sierra: *¿cuántos PT sacamos por semana, de quién era la madera y
 * bajo qué permiso?* — en N semanas, un mes o un rango.
 *
 * ## Por qué las cifras cierran con la tira
 *
 * El PT de un DÍA es el de su casillero: `round(m³ del día × 424)`
 * (`jornadasDesdeFilas`). Ese entero se reparte hacia sus especies por el
 * mayor resto, en el MISMO orden que el panel flotante del día
 * (`detalleDeJornada`), y el de cada especie hacia sus celdas dueño·permiso. Todo
 * lo demás —semanas, meses, dueños, permisos, lo filtrado— son SUMAS de esas
 * celdas enteras. Así:
 *   · la semana del reporte = la suma de la cabecera de la tira;
 *   · «Tornillo» + el resto = el total, sin un pie de diferencia;
 *   · un filtro es un recorte de la partición, no otra cuenta.
 *
 * Criterios del libro (los de `detalle-de-jornada.ts`): el m³ sólo cuenta si el
 * asiento está en m³; piezas = `piezasDeLaCorrida`; especies juntas por
 * `claveEspecie`; «no se declaró» dueño NO es «es propia».
 *
 * Fechas date-only en UTC; «hoy» es de Lima y viene de afuera (nada de
 * `Date.now()` acá: los tests no pueden depender del día en que corren).
 *
 * PURO y client-safe: lo arma el servidor y se prueba sin base.
 */

import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { SIN_DUENO, SIN_ESPECIE } from "@/lib/forestal/detalle-de-jornada";
import { nombreCortoDeDueno } from "@/lib/forestal/dueno-de-la-madera";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { variacionPct } from "@/lib/forestal/movimiento-libro";
import {
  DIAS_CORTOS,
  esIsoValido,
  indiceDelDia,
  lunesDe,
  sumarDias,
  tituloDeLaSemana,
} from "@/lib/forestal/semana-de-registro";

// ── Vocabulario ─────────────────────────────────────────────────────────────

export type AgrupacionReporte = "dia" | "semana" | "mes";
export type DimensionReporte = "dueno" | "permiso" | "especie";
export const DIMENSIONES: readonly DimensionReporte[] = ["dueno", "permiso", "especie"];

export type PeriodoReporte =
  | { tipo: "semanas"; semanas: number }
  | { tipo: "mes"; mes: string }
  | { tipo: "rango"; desde: string; hasta: string };

export const SEMANAS_POR_DEFECTO = 8;
export const SEMANAS_MAX = 52;
/** Dos años: más que eso ya no es un reporte de producción sino un archivo. */
export const RANGO_MAX_DIAS = 731;
/** Cuántas series se apilan antes de juntar el resto en «Otros». */
export const TOPE_SERIES = 5;

export const SIN_PERMISO = "Sin permiso declarado";
/* Claves que no pueden chocar con un nombre real: los paréntesis no existen en
   un código de permiso, y `claveEspecie` los borra de cualquier especie. */
export const CLAVE_SIN_ESPECIE = "(sin especie)";
export const CLAVE_SIN_PERMISO = "(sin permiso)";
export const CLAVE_OTROS = "(otros)";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"] as const;
const MS_DIA = 86_400_000;

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Días entre dos fechas, AMBAS incluidas. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00.000Z`) - Date.parse(`${desde}T00:00:00.000Z`)) / MS_DIA) + 1;
}

function ultimoDiaDelMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a!, m!, 0)).toISOString().slice(0, 10);
}

function mesSiguiente(mes: string, n = 1): string {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1 + n, 1)).toISOString().slice(0, 7);
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ddmmaaaa = (iso: string) => `${ddmm(iso)}/${iso.slice(0, 4)}`;

/** «setiembre 2026». */
export function etiquetaDeMes(mes: string): string {
  return `${MESES[Number(mes.slice(5, 7)) - 1] ?? mes} ${mes.slice(0, 4)}`;
}

/** «01/09 – 23/09/2026», o con los dos años si el rango los cruza. */
export function etiquetaDeRango(desde: string, hasta: string): string {
  return desde.slice(0, 4) === hasta.slice(0, 4)
    ? `${ddmm(desde)} – ${ddmmaaaa(hasta)}`
    : `${ddmmaaaa(desde)} – ${ddmmaaaa(hasta)}`;
}

/** «14–20/09», o «31/08–06/09» cuando la semana cruza de mes. */
export function etiquetaCortaDeSemana(lunes: string): string {
  const domingo = sumarDias(lunes, 6);
  return lunes.slice(5, 7) === domingo.slice(5, 7)
    ? `${lunes.slice(8, 10)}–${ddmm(domingo)}`
    : `${ddmm(lunes)}–${ddmm(domingo)}`;
}

const menor = (a: string, b: string) => (a < b ? a : b);
const mayor = (a: string, b: string) => (a > b ? a : b);

// ── El período ──────────────────────────────────────────────────────────────

export interface RangoDelReporte {
  desde: string;
  hasta: string;
  etiqueta: string;
}

export interface PeriodoResuelto extends RangoDelReporte {
  tipo: PeriodoReporte["tipo"];
  /** Hasta dónde hay hechos: el menor entre `hasta` y hoy. Antes de `desde` = el período no empezó. */
  hastaEfectivo: string;
  /** Días de `desde` a `hastaEfectivo` (0 si no empezó). */
  diasTranscurridos: number;
  /**
   * Con qué se compara el período: el MISMO largo transcurrido, antes.
   * Un mes en curso se compara contra los mismos días del mes anterior; unas
   * semanas en curso, contra las mismas semanas cortadas en el mismo día. Si
   * no, el período que va por la mitad parece un derrumbe.
   */
  previo: RangoDelReporte;
}

/**
 * Traduce lo que se eligió a fechas.
 *
 * Todo lo inválido cae en un default razonable en vez de fallar: el período
 * viene del `localStorage` del dispositivo y una clave vieja no puede dejar la
 * pantalla en blanco.
 */
export function resolverPeriodo(p: PeriodoReporte, hoy: string): PeriodoResuelto {
  let desde: string;
  let hasta: string;
  let etiqueta: string;
  let previo: RangoDelReporte;

  if (p.tipo === "mes") {
    /* Año 19xx/20xx: `Date.UTC` lee 0-99 como 1900+ y el período se escapaba del tope. */
    const mes = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(p.mes) ? p.mes : hoy.slice(0, 7);
    desde = `${mes}-01`;
    hasta = ultimoDiaDelMes(mes);
    etiqueta = etiquetaDeMes(mes);
    const anterior = mesSiguiente(mes, -1);
    const finAnterior = ultimoDiaDelMes(anterior);
    let hastaPrevio = finAnterior;
    if (hoy >= desde && hoy < hasta) {
      const dia = Math.min(Number(hoy.slice(8, 10)), Number(finAnterior.slice(8, 10)));
      hastaPrevio = `${anterior}-${String(dia).padStart(2, "0")}`;
    }
    previo = {
      desde: `${anterior}-01`,
      hasta: hastaPrevio,
      etiqueta:
        hastaPrevio === finAnterior
          ? etiquetaDeMes(anterior)
          : `1–${Number(hastaPrevio.slice(8, 10))} de ${MESES[Number(anterior.slice(5, 7)) - 1]}`,
    };
  } else if (p.tipo === "rango") {
    let a = esIsoValido(p.desde) ? p.desde : sumarDias(hoy, -29);
    let b = esIsoValido(p.hasta) ? p.hasta : hoy;
    if (a > b) [a, b] = [b, a];
    if (diasEntre(a, b) > RANGO_MAX_DIAS) a = sumarDias(b, -(RANGO_MAX_DIAS - 1));
    desde = a;
    hasta = b;
    etiqueta = etiquetaDeRango(a, b);
    const efectivo = hoy < a ? a : menor(b, hoy);
    const largo = diasEntre(a, efectivo);
    previo = {
      desde: sumarDias(a, -largo),
      hasta: sumarDias(a, -1),
      etiqueta: largo === 1 ? "el día anterior" : `los ${largo} días anteriores`,
    };
  } else {
    const n = Math.min(SEMANAS_MAX, Math.max(1, Math.trunc(p.semanas) || SEMANAS_POR_DEFECTO));
    const lunesHoy = lunesDe(hoy);
    desde = sumarDias(lunesHoy, -7 * (n - 1));
    hasta = sumarDias(lunesHoy, 6);
    etiqueta = n === 1 ? "Esta semana" : `Últimas ${n} semanas`;
    const corrimiento = 7 * n;
    previo = {
      desde: sumarDias(desde, -corrimiento),
      hasta: sumarDias(menor(hasta, hoy), -corrimiento),
      etiqueta: n === 1 ? "la semana pasada a igual día" : `las ${n} semanas anteriores a igual día`,
    };
  }

  const hastaEfectivo = hoy < desde ? sumarDias(desde, -1) : menor(hasta, hoy);
  return {
    tipo: p.tipo,
    desde,
    hasta,
    etiqueta,
    hastaEfectivo,
    diasTranscurridos: Math.max(0, diasEntre(desde, hastaEfectivo)),
    previo,
  };
}

/**
 * Qué días hay que leer de la base: el período, el previo y la semana antes
 * del período (la primera fila de la tabla semanal se compara con ella).
 */
export function rangoALeer(p: PeriodoResuelto): { desde: string; hasta: string } {
  return { desde: menor(p.previo.desde, sumarDias(p.desde, -7)), hasta: p.hasta };
}

// ── La entrada ──────────────────────────────────────────────────────────────

/** Una corrida como la lee el servidor, ya traducida. */
export interface CorridaDelReporte {
  /** `YYYY-MM-DD`, día UTC del asiento. */
  dia: string;
  lineNo: number;
  especie: string | null;
  /** `etiquetaDeDueno(...) ?? SIN_DUENO` — la MISMA etiqueta que la tira. */
  dueno: string;
  /** `originCode` tal cual. */
  permiso: string | null;
  /** Volumen declarado en m³; 0 si el asiento está en otra unidad. */
  m3: number;
  /** El asiento declara en otra unidad: cuenta como corrida, no suma m³. */
  otraUnidad: boolean;
  /** `piezasDeLaCorrida(paquetes, pieces)`. */
  piezas: number;
  /** Materia prima atribuida (`volumeInputM3`); 0 si no tiene. */
  entradaM3: number;
}

export interface FiltrosReporte {
  especies?: readonly string[];
  duenos?: readonly string[];
  permisos?: readonly string[];
}

export const claveDeEspecie = (nombre: string | null | undefined): string =>
  claveEspecie(nombre) || CLAVE_SIN_ESPECIE;
export const claveDePermiso = (codigo: string | null | undefined): string =>
  (codigo ?? "").trim() || CLAVE_SIN_PERMISO;

// ── Reparto ─────────────────────────────────────────────────────────────────

/**
 * Reparte un entero entre pesos en m³ por el mayor resto.
 *
 * Es `repartirPt` (detalle-de-jornada) con una red: si el punto flotante deja
 * un resto mayor que la cantidad de renglones, sigue dando vueltas en vez de
 * perder el PT que sobra — las cifras tienen que cerrar siempre.
 */
export function repartirEntero(m3s: readonly number[], total: number): number[] {
  if (m3s.length === 0) return [];
  const crudos = m3s.map((m) => m * PT_POR_M3);
  const pisos = crudos.map((c) => Math.floor(c));
  let resto = total - pisos.reduce((a, b) => a + b, 0);
  const orden = crudos
    .map((c, i) => ({ i, fraccion: c - Math.floor(c) }))
    .sort((a, b) => b.fraccion - a.fraccion || a.i - b.i);
  while (resto > 0) {
    for (const { i } of orden) {
      if (resto <= 0) break;
      pisos[i] = (pisos[i] ?? 0) + 1;
      resto -= 1;
    }
  }
  /* Al revés (sólo por ruido de flotante): se saca de los de menor fracción. */
  while (resto < 0) {
    let quitado = false;
    for (let k = orden.length - 1; k >= 0 && resto < 0; k--) {
      const i = orden[k]!.i;
      if ((pisos[i] ?? 0) > 0) {
        pisos[i] = (pisos[i] ?? 0) - 1;
        resto += 1;
        quitado = true;
      }
    }
    if (!quitado) break;
  }
  return pisos;
}

/** La pieza más chica del reporte: un día · especie · dueño · permiso. */
interface Celda {
  dia: string;
  especie: string;
  dueno: string;
  permiso: string;
  corridas: number;
  piezas: number;
  m3: number;
  pt: number;
  otraUnidad: number;
  entradaM3: number;
  salidaConEntradaM3: number;
  corridasConEntrada: number;
}

/**
 * Las celdas de UN día. Las filas llegan en el orden del libro (N.º), que es
 * el orden en que la tira suma su m³.
 */
function celdasDelDia(dia: string, filas: readonly CorridaDelReporte[]): Celda[] {
  let totalM3 = 0;
  for (const f of filas) totalM3 += f.m3;
  const ptDia = Math.round(totalM3 * PT_POR_M3);

  const especies = new Map<string, { nombre: string; lineNo: number; corridas: number; m3: number; filas: CorridaDelReporte[] }>();
  for (const f of filas) {
    const nombre = (f.especie ?? "").trim();
    const clave = claveDeEspecie(nombre);
    const e = especies.get(clave) ?? {
      nombre: clave === CLAVE_SIN_ESPECIE ? SIN_ESPECIE : nombre,
      lineNo: f.lineNo,
      corridas: 0,
      m3: 0,
      filas: [],
    };
    if (clave !== CLAVE_SIN_ESPECIE && f.lineNo < e.lineNo) {
      e.nombre = nombre;
      e.lineNo = f.lineNo;
    }
    e.corridas += 1;
    e.m3 += f.m3;
    e.filas.push(f);
    especies.set(clave, e);
  }
  /* El orden de `detalleDeJornada`: así el PT de cada especie del día es el
     mismo que dice el panel flotante de la tira. */
  const listaEspecies = [...especies.entries()].sort(
    ([, a], [, b]) => b.m3 - a.m3 || b.corridas - a.corridas || a.nombre.localeCompare(b.nombre, "es"),
  );
  const ptEspecies = repartirEntero(
    listaEspecies.map(([, e]) => e.m3),
    ptDia,
  );

  const celdas: Celda[] = [];
  listaEspecies.forEach(([clave, e], i) => {
    const porCelda = new Map<string, Celda>();
    for (const f of e.filas) {
      const permiso = claveDePermiso(f.permiso);
      const llave = `${f.dueno}\u0000${permiso}`;
      const c = porCelda.get(llave) ?? {
        dia,
        especie: clave,
        dueno: f.dueno,
        permiso,
        corridas: 0,
        piezas: 0,
        m3: 0,
        pt: 0,
        otraUnidad: 0,
        entradaM3: 0,
        salidaConEntradaM3: 0,
        corridasConEntrada: 0,
      };
      c.corridas += 1;
      c.piezas += f.piezas;
      c.m3 += f.m3;
      if (f.otraUnidad) c.otraUnidad += 1;
      /* Rendimiento: sólo corridas con materia prima atribuida Y declaradas en
         m³ — dividir PT por m³ da un porcentaje que parece un dato y no lo es. */
      if (f.entradaM3 > 0 && !f.otraUnidad) {
        c.entradaM3 += f.entradaM3;
        c.salidaConEntradaM3 += f.m3;
        c.corridasConEntrada += 1;
      }
      porCelda.set(llave, c);
    }
    const lista = [...porCelda.entries()]
      .sort(([ka, a], [kb, b]) => b.m3 - a.m3 || b.corridas - a.corridas || ka.localeCompare(kb, "es"))
      .map(([, c]) => c);
    const pts = repartirEntero(
      lista.map((c) => c.m3),
      ptEspecies[i] ?? 0,
    );
    lista.forEach((c, j) => {
      c.pt = pts[j] ?? 0;
      celdas.push(c);
    });
  });
  return celdas;
}

// ── La salida ───────────────────────────────────────────────────────────────

export interface CifrasReporte {
  corridas: number;
  piezas: number;
  m3: number;
  pt: number;
}

export interface CuboReporte extends CifrasReporte {
  /** Inicio del cubo (`YYYY-MM-DD`). */
  clave: string;
  /** Para el eje: «Lun 14/09», «14–20/09», «set 26». */
  etiqueta: string;
  /** Para leer: «lunes 14/09», «14 – 20 de setiembre 2026», «setiembre 2026». */
  titulo: string;
  /** Lo que el cubo tiene DENTRO del período (recortado). */
  desde: string;
  hasta: string;
  dias: number;
  /** Contiene a hoy: el día de hoy todavía no terminó. */
  enCurso: boolean;
  /** El período lo corta (no por hoy, por sus bordes). */
  parcial: boolean;
  ptAcumulado: number;
  /** PT por serie de cada dimensión (las claves de `series`). */
  pila: Record<DimensionReporte, Record<string, number>>;
}

export interface SemanaReporte extends CifrasReporte {
  lunes: string;
  etiqueta: string;
  desde: string;
  hasta: string;
  dias: number;
  diasConProduccion: number;
  enCurso: boolean;
  parcial: boolean;
  /** PT de los MISMOS días de la semana anterior. */
  ptSemanaAnterior: number;
  /** Contra esos mismos días; `null` si la anterior estuvo en cero. */
  variacionPct: number | null;
}

export interface ParteReporte extends CifrasReporte {
  clave: string;
  /** Lo corto, para una leyenda: «WASACO». */
  etiqueta: string;
  /** Lo completo: «De tercero · WASACO». */
  titulo: string;
  /** Es el renglón de lo NO declarado (sin dueño, sin permiso, sin especie). */
  sinDato: boolean;
  /** Parte del PT del período, en %, un decimal. */
  pct: number;
}

export interface SerieReporte {
  clave: string;
  etiqueta: string;
  tipo: "dato" | "sin-dato" | "otros";
}

export interface OpcionReporte {
  value: string;
  label: string;
  hint: string;
}

export interface ReporteDeProduccion {
  periodo: PeriodoResuelto;
  agrupacion: AgrupacionReporte;
  filtros: { especies: string[]; duenos: string[]; permisos: string[] };
  totales: CifrasReporte & {
    diasConProduccion: number;
    /** Redondeado; `null` sin días trabajados. */
    ptPorDiaTrabajado: number | null;
    corridasOtraUnidad: number;
  };
  /** Lo mismo con los mismos filtros, en `periodo.previo`. */
  previo: CifrasReporte;
  /** Sólo sobre corridas con materia prima atribuida; `null` si no hay ninguna. */
  rendimiento: { corridas: number; entradaM3: number; salidaM3: number; pct: number } | null;
  mejorDia: { dia: string; pt: number } | null;
  mejorSemana: { lunes: string; etiqueta: string; pt: number } | null;
  cubos: CuboReporte[];
  semanas: SemanaReporte[];
  partes: Record<DimensionReporte, ParteReporte[]>;
  series: Record<DimensionReporte, SerieReporte[]>;
  /** Las opciones de los filtros: lo que HAY en el período, sin recortar. */
  opciones: Record<DimensionReporte, OpcionReporte[]>;
  /** La lectura se cortó por el tope: se DICE. */
  truncado: boolean;
}

const vacias = (): CifrasReporte => ({ corridas: 0, piezas: 0, m3: 0, pt: 0 });
function sumar(acc: CifrasReporte, c: CifrasReporte): void {
  acc.corridas += c.corridas;
  acc.piezas += c.piezas;
  acc.m3 += c.m3;
  acc.pt += c.pt;
}
const redondear = <T extends CifrasReporte>(c: T): T => ({ ...c, m3: r4(c.m3) });

function inicioDeCubo(dia: string, g: AgrupacionReporte): string {
  if (g === "semana") return lunesDe(dia);
  if (g === "mes") return `${dia.slice(0, 7)}-01`;
  return dia;
}
function finDeCubo(inicio: string, g: AgrupacionReporte): string {
  if (g === "semana") return sumarDias(inicio, 6);
  if (g === "mes") return ultimoDiaDelMes(inicio.slice(0, 7));
  return inicio;
}
function siguienteCubo(inicio: string, g: AgrupacionReporte): string {
  if (g === "semana") return sumarDias(inicio, 7);
  if (g === "mes") return `${mesSiguiente(inicio.slice(0, 7))}-01`;
  return sumarDias(inicio, 1);
}
function etiquetasDeCubo(inicio: string, g: AgrupacionReporte): { etiqueta: string; titulo: string } {
  if (g === "semana") return { etiqueta: etiquetaCortaDeSemana(inicio), titulo: tituloDeLaSemana(inicio) };
  if (g === "mes") {
    const m = Number(inicio.slice(5, 7)) - 1;
    return { etiqueta: `${MESES_CORTOS[m]} ${inicio.slice(2, 4)}`, titulo: etiquetaDeMes(inicio.slice(0, 7)) };
  }
  const i = indiceDelDia(inicio);
  const largo = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][i];
  return { etiqueta: `${DIAS_CORTOS[i]} ${ddmm(inicio)}`, titulo: `${largo} ${ddmm(inicio)}` };
}

/** La clave de la celda en una dimensión. */
const claveEn = (c: Celda, d: DimensionReporte): string =>
  d === "dueno" ? c.dueno : d === "permiso" ? c.permiso : c.especie;

const esSinDato = (d: DimensionReporte, clave: string): boolean =>
  d === "dueno" ? clave === SIN_DUENO : d === "permiso" ? clave === CLAVE_SIN_PERMISO : clave === CLAVE_SIN_ESPECIE;

/**
 * Arma el reporte entero.
 *
 * `corridas` trae TODO lo leído (`rangoALeer`): el período, el previo y la
 * semana de antes. Cada parte mira sólo sus días.
 */
export function armarReporte(input: {
  corridas: readonly CorridaDelReporte[];
  periodo: PeriodoResuelto;
  agrupacion: AgrupacionReporte;
  filtros?: FiltrosReporte;
  hoy: string;
  truncado?: boolean;
}): ReporteDeProduccion {
  const { periodo, agrupacion, hoy } = input;
  const filtros = {
    especies: [...new Set(input.filtros?.especies ?? [])],
    duenos: [...new Set(input.filtros?.duenos ?? [])],
    permisos: [...new Set(input.filtros?.permisos ?? [])],
  };

  /* 1. Las celdas, día por día, con TODAS las corridas: el PT del día no
        depende de lo que se filtre. */
  const porDia = new Map<string, CorridaDelReporte[]>();
  for (const c of input.corridas) {
    if (!esIsoValido(c.dia)) continue;
    const lista = porDia.get(c.dia) ?? [];
    lista.push(c);
    porDia.set(c.dia, lista);
  }
  const todas: Celda[] = [];
  for (const [dia, filas] of porDia) {
    filas.sort((a, b) => a.lineNo - b.lineNo);
    todas.push(...celdasDelDia(dia, filas));
  }

  /* Los nombres a mostrar: el de la corrida más vieja del período. */
  const nombreEspecie = new Map<string, string>();
  for (const c of [...input.corridas].sort((a, b) => a.dia.localeCompare(b.dia) || a.lineNo - b.lineNo)) {
    const clave = claveDeEspecie(c.especie);
    if (!nombreEspecie.has(clave)) {
      nombreEspecie.set(clave, clave === CLAVE_SIN_ESPECIE ? SIN_ESPECIE : (c.especie ?? "").trim());
    }
  }
  const titulo = (d: DimensionReporte, clave: string): string => {
    if (d === "dueno") return clave;
    if (d === "permiso") return clave === CLAVE_SIN_PERMISO ? SIN_PERMISO : clave;
    return nombreEspecie.get(clave) ?? clave;
  };
  const etiquetaCorta = (d: DimensionReporte, clave: string): string =>
    d === "dueno" ? nombreCortoDeDueno(clave) : titulo(d, clave);

  /* 2. El filtro: un recorte de la partición. */
  const pasa = (c: Celda) =>
    (filtros.especies.length === 0 || filtros.especies.includes(c.especie)) &&
    (filtros.duenos.length === 0 || filtros.duenos.includes(c.dueno)) &&
    (filtros.permisos.length === 0 || filtros.permisos.includes(c.permiso));
  const dentro = (dia: string, desde: string, hasta: string) => dia >= desde && dia <= hasta;
  const enPeriodo = (c: Celda) => dentro(c.dia, periodo.desde, periodo.hastaEfectivo);

  const filtradas = todas.filter(pasa);
  const delPeriodo = filtradas.filter(enPeriodo);

  /* PT (y lo demás) por día, filtrado: lo usan cubos, semanas y comparaciones. */
  const diaFiltrado = new Map<string, CifrasReporte>();
  for (const c of filtradas) {
    const acc = diaFiltrado.get(c.dia) ?? vacias();
    sumar(acc, c);
    diaFiltrado.set(c.dia, acc);
  }

  /* 3. Totales, previo, rendimiento. */
  const totales = vacias();
  let corridasOtraUnidad = 0;
  const rend = { corridas: 0, entradaM3: 0, salidaM3: 0 };
  for (const c of delPeriodo) {
    sumar(totales, c);
    corridasOtraUnidad += c.otraUnidad;
    rend.corridas += c.corridasConEntrada;
    rend.entradaM3 += c.entradaM3;
    rend.salidaM3 += c.salidaConEntradaM3;
  }
  const previo = vacias();
  for (const c of filtradas) if (dentro(c.dia, periodo.previo.desde, periodo.previo.hasta)) sumar(previo, c);

  const diasTrabajados = [...diaFiltrado.entries()].filter(
    ([dia, v]) => dentro(dia, periodo.desde, periodo.hastaEfectivo) && v.corridas > 0,
  );
  let mejorDia: ReporteDeProduccion["mejorDia"] = null;
  for (const [dia, v] of diasTrabajados.sort(([a], [b]) => a.localeCompare(b))) {
    if (v.pt > 0 && (!mejorDia || v.pt > mejorDia.pt)) mejorDia = { dia, pt: v.pt };
  }

  /* 4. Las partes por dimensión y sus series (top N + «Otros»). */
  const partes = {} as Record<DimensionReporte, ParteReporte[]>;
  const series = {} as Record<DimensionReporte, SerieReporte[]>;
  const serieDe = {} as Record<DimensionReporte, Map<string, string>>;
  for (const d of DIMENSIONES) {
    const acc = new Map<string, CifrasReporte>();
    for (const c of delPeriodo) {
      const k = claveEn(c, d);
      const v = acc.get(k) ?? vacias();
      sumar(v, c);
      acc.set(k, v);
    }
    partes[d] = [...acc.entries()]
      .map(([clave, v]) => ({
        ...redondear(v),
        clave,
        etiqueta: etiquetaCorta(d, clave),
        titulo: titulo(d, clave),
        sinDato: esSinDato(d, clave),
        pct: totales.pt > 0 ? r1((v.pt / totales.pt) * 100) : 0,
      }))
      .sort((a, b) => b.pt - a.pt || b.m3 - a.m3 || a.etiqueta.localeCompare(b.etiqueta, "es"));

    /* Lo que falta declarar («sin dueño», «sin permiso») nunca se esconde en
       «Otros» (revisión 23-09): es lo que hay que completar, siempre a la vista. */
    const sinDato = partes[d].filter((p) => p.sinDato);
    const conDato = partes[d].filter((p) => !p.sinDato);
    const lugares = Math.max(0, TOPE_SERIES - sinDato.length);
    const arriba = [...conDato.slice(0, lugares), ...sinDato].sort((a, b) => b.pt - a.pt || b.m3 - a.m3);
    const resto = conDato.slice(lugares);
    const mapa = new Map<string, string>();
    for (const p of arriba) mapa.set(p.clave, p.clave);
    for (const p of resto) mapa.set(p.clave, CLAVE_OTROS);
    serieDe[d] = mapa;
    /* Apiladas: lo declarado abajo, lo que falta declarar y «Otros» arriba —
       así el tramo gris se lee como «lo que no se sabe», no como un dueño más. */
    series[d] = [
      ...arriba.filter((p) => !p.sinDato).map((p) => ({ clave: p.clave, etiqueta: p.etiqueta, tipo: "dato" as const })),
      ...arriba.filter((p) => p.sinDato).map((p) => ({ clave: p.clave, etiqueta: p.etiqueta, tipo: "sin-dato" as const })),
      ...(resto.length > 0
        ? [{ clave: CLAVE_OTROS, etiqueta: `Otros (${resto.length})`, tipo: "otros" as const }]
        : []),
    ];
  }

  /* 5. Los cubos del eje. Se cortan en `hastaEfectivo`: un día que todavía no
        pasó dibujado en cero se lee como «no se produjo». */
  const cubos: CuboReporte[] = [];
  if (periodo.diasTranscurridos > 0) {
    let acumulado = 0;
    for (
      let inicio = inicioDeCubo(periodo.desde, agrupacion);
      inicio <= periodo.hastaEfectivo && cubos.length < 800;
      inicio = siguienteCubo(inicio, agrupacion)
    ) {
      const fin = finDeCubo(inicio, agrupacion);
      const desde = mayor(inicio, periodo.desde);
      const hasta = menor(fin, periodo.hastaEfectivo);
      const cifras = vacias();
      for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
        const v = diaFiltrado.get(d);
        if (v) sumar(cifras, v);
      }
      acumulado += cifras.pt;
      const pila = {} as CuboReporte["pila"];
      for (const dim of DIMENSIONES) {
        pila[dim] = Object.fromEntries(series[dim].map((s) => [s.clave, 0]));
      }
      cubos.push({
        ...redondear(cifras),
        clave: inicio,
        ...etiquetasDeCubo(inicio, agrupacion),
        desde,
        hasta,
        dias: diasEntre(desde, hasta),
        enCurso: hoy >= inicio && hoy <= fin && hoy <= periodo.hasta,
        parcial: inicio < periodo.desde || fin > periodo.hasta,
        ptAcumulado: acumulado,
        pila,
      });
    }
    /* Las pilas: cada celda del período cae en su cubo y en su serie. */
    const indice = new Map(cubos.map((c, i) => [c.clave, i]));
    for (const c of delPeriodo) {
      const i = indice.get(inicioDeCubo(c.dia, agrupacion));
      if (i == null) continue;
      for (const dim of DIMENSIONES) {
        const s = serieDe[dim].get(claveEn(c, dim));
        if (s) cubos[i]!.pila[dim][s] = (cubos[i]!.pila[dim][s] ?? 0) + c.pt;
      }
    }
  }

  /* 6. Las semanas, siempre lunes a domingo, contra los MISMOS días de la
        semana anterior: una semana en curso o cortada por el mes contra una
        entera parece un derrumbe. */
  const semanas: SemanaReporte[] = [];
  if (periodo.diasTranscurridos > 0) {
    /* Techo como el de los cubos: una fecha rara no puede volverse un bucle de miles de semanas. */
    for (let lunes = lunesDe(periodo.desde), n = 0; lunes <= periodo.hastaEfectivo && n < 800; lunes = sumarDias(lunes, 7), n++) {
      const domingo = sumarDias(lunes, 6);
      const desde = mayor(lunes, periodo.desde);
      const hasta = menor(domingo, periodo.hastaEfectivo);
      const cifras = vacias();
      let diasConProduccion = 0;
      let anterior = 0;
      for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
        const v = diaFiltrado.get(d);
        if (v) {
          sumar(cifras, v);
          if (v.corridas > 0) diasConProduccion += 1;
        }
        anterior += diaFiltrado.get(sumarDias(d, -7))?.pt ?? 0;
      }
      semanas.push({
        ...redondear(cifras),
        lunes,
        etiqueta: etiquetaCortaDeSemana(lunes),
        desde,
        hasta,
        dias: diasEntre(desde, hasta),
        diasConProduccion,
        enCurso: hoy >= lunes && hoy <= domingo && hoy <= periodo.hasta,
        parcial: lunes < periodo.desde || domingo > periodo.hasta,
        ptSemanaAnterior: anterior,
        variacionPct: variacionPct(cifras.pt, anterior),
      });
    }
  }
  let mejorSemana: ReporteDeProduccion["mejorSemana"] = null;
  for (const s of semanas) {
    if (s.pt > 0 && (!mejorSemana || s.pt > mejorSemana.pt)) {
      mejorSemana = { lunes: s.lunes, etiqueta: s.etiqueta, pt: s.pt };
    }
  }

  /* 7. Las opciones: lo que hay en el período SIN recortar (si no, elegir una
        especie dejaría el desplegable con una sola y no se podría volver), más
        lo elegido que ya no aparece — el filtro recordado no se esconde. */
  const opciones = {} as Record<DimensionReporte, OpcionReporte[]>;
  const elegidos: Record<DimensionReporte, string[]> = {
    dueno: filtros.duenos,
    permiso: filtros.permisos,
    especie: filtros.especies,
  };
  for (const d of DIMENSIONES) {
    const acc = new Map<string, CifrasReporte>();
    for (const c of todas) {
      if (!enPeriodo(c)) continue;
      const k = claveEn(c, d);
      const v = acc.get(k) ?? vacias();
      sumar(v, c);
      acc.set(k, v);
    }
    for (const k of elegidos[d]) if (!acc.has(k)) acc.set(k, vacias());
    opciones[d] = [...acc.entries()]
      .sort(([ka, a], [kb, b]) => b.pt - a.pt || b.corridas - a.corridas || ka.localeCompare(kb, "es"))
      .map(([clave, v]) => ({
        value: clave,
        label: titulo(d, clave),
        hint:
          v.corridas === 0
            ? "sin corridas en el período"
            : `${v.corridas} corrida${v.corridas === 1 ? "" : "s"} · ${v.pt.toLocaleString("es-PE")} PT`,
      }));
  }

  return {
    periodo,
    agrupacion,
    filtros,
    totales: {
      ...redondear(totales),
      diasConProduccion: diasTrabajados.length,
      ptPorDiaTrabajado: diasTrabajados.length > 0 ? Math.round(totales.pt / diasTrabajados.length) : null,
      corridasOtraUnidad,
    },
    previo: redondear(previo),
    rendimiento:
      rend.corridas > 0 && rend.entradaM3 > 0
        ? {
            corridas: rend.corridas,
            entradaM3: r4(rend.entradaM3),
            salidaM3: r4(rend.salidaM3),
            pct: r1((rend.salidaM3 / rend.entradaM3) * 100),
          }
        : null,
    mejorDia,
    mejorSemana,
    cubos,
    semanas,
    partes,
    series,
    opciones,
    truncado: input.truncado ?? false,
  };
}
