/**
 * loth-extraccion-shared — lo que comparten las piezas de la vista «Extracción»
 * del Libro TH (ADR-454): el formato de las cifras, el tono de cada nivel, las
 * filas de la tabla y los datos de los gráficos. El ⓘ de los avisos vive en
 * `loth-extraccion-ayuda.ts` y las hojas del Excel en `loth-extraccion-excel.ts`.
 *
 * Puro (sin React): se prueba solo en `__tests__/forestal-loth-extraccion-vista`.
 *
 * Ninguna función de acá SUMA filas del servidor para fabricar un total: los
 * totales vienen hechos (`total`, `especies`, `permisos[].total`). Lo único que
 * se resta es dentro de UNA misma fila, para dibujar tramos que no se pisan
 * (talado − trozado = lo talado que todavía no es troza), y eso es dibujo.
 */

import type {
  AvisoExtraccion,
  BaseDelTope,
  ExtraccionResponse,
  FilaExtraccion,
  NivelAvance,
  PermisoExtraccion,
  SaldoContra,
} from "@/lib/forestal/loth-extraccion-tipos";
import { periodoAnterior, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { formatNumber } from "@/lib/format";
import { limaDateKey } from "@/lib/utils";

// ─── Cifras ──────────────────────────────────────────────────────────────────

/** m³ con tres decimales, como el libro («400.519»). */
export const fm3 = (n: number | null | undefined): string => formatNumber(n, 3);
/** Porcentaje con un decimal como máximo («8.2 %»); sin dato, «—». */
export const fpct = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? "—" : `${formatNumber(n, { max: 1 })} %`;
export const plural = (n: number, uno: string, varios: string): string =>
  `${formatNumber(n)} ${n === 1 ? uno : varios}`;
/** El eje de un gráfico: sin decimales pasando 10, uno por debajo. */
export const ejeM3 = (v: number): string =>
  Math.abs(v) >= 1000 ? `${formatNumber(v / 1000, { max: 1 })}k` : formatNumber(v, { max: Math.abs(v) >= 10 ? 0 : 1 });

// ─── Tono de un nivel ────────────────────────────────────────────────────────

export type Tono = "ok" | "atencion" | "error" | "neutro";

/**
 * Un saldo contra el CENSO que queda negativo dice «se midió más de lo
 * estimado» (el censo es una fórmula, la tala es Smalian): ámbar, nunca rojo.
 */
export function tonoDeSaldo(s: SaldoContra): Tono {
  if (s.nivel === "sin_base") return "neutro";
  if (s.nivel === "ok") return "ok";
  return "atencion";
}

/** El avance se pinta rojo sólo si pasa lo AUTORIZADO; pasar el censo es ámbar. */
export function tonoDeAvance(a: SaldoContra, base: BaseDelTope | null): Tono {
  if (a.nivel === "sin_base") return "neutro";
  if (a.nivel === "ok") return "ok";
  if (a.nivel === "exceso" && base === "autorizado") return "error";
  return "atencion";
}

/** Texto chico de color: `-ink` (AA en 12-16 px, trae su variante oscura). */
export const TEXTO_TONO: Record<Tono, string> = {
  ok: "text-[var(--text-primary)]",
  atencion: "text-[var(--data-warning-ink)]",
  error: "text-[var(--data-error-ink)]",
  neutro: "text-[var(--text-tertiary)]",
};

export const BARRA_TONO: Record<Tono, string> = {
  ok: "bg-[var(--accent)]",
  atencion: "bg-[var(--data-warning-500)]",
  error: "bg-[var(--data-error-500)]",
  neutro: "bg-[var(--text-tertiary)]",
};

export const NOMBRE_NIVEL: Record<NivelAvance, string> = {
  sin_base: "sin base",
  ok: "en marcha",
  atencion: "pasó el 80 %",
  tope: "llegó al tope",
  exceso: "se pasó",
};

// ─── El permiso ──────────────────────────────────────────────────────────────

/** Cómo se nombra una fila de permiso: el N° del plan, si no el alias o el titular. */
export function nombrePermiso(p: Pick<PermisoExtraccion, "planId" | "planNumber" | "alias" | "titular">): string {
  if (!p.planId) return "Sin plan";
  return p.planNumber?.trim() || p.alias?.trim() || p.titular?.trim() || "Plan sin número";
}

/**
 * El nombre en el eje de un gráfico (≈16 letras): el FINAL del código, que es
 * lo que distingue un permiso de otro («…PLT-2025-096», no «19-SEC/REG-PLT»).
 */
export function nombreCorto(nombre: string, max = 16): string {
  if (nombre.length <= max) return nombre;
  const cola = nombre.slice(-(max - 1));
  /* Se corta en un separador, no a mitad de un tramo («…EG-PLT» no se lee). */
  const i = cola.search(/[-/ ]/);
  return `…${i >= 0 && i < cola.length - 4 ? cola.slice(i + 1) : cola}`;
}

/** La segunda línea de la fila: de quién es y bajo qué permiso. */
export function detallePermiso(p: PermisoExtraccion): string | null {
  if (!p.planId) return "Líneas del libro sin árbol del censo";
  const partes = [p.titular?.trim() || null, p.permiso ? `permiso ${p.permiso.codigo}` : "sin permiso unido"];
  return partes.filter(Boolean).join(" · ") || null;
}

// ─── El pedido ───────────────────────────────────────────────────────────────

/**
 * El día que eligió la persona. El período del libro son instantes armados en
 * hora LOCAL (medianoche y 23:59, `resolveCtpPeriod`): se lee con las piezas
 * locales. Pasarlo por la zona de Lima correría un día a quien tenga el
 * navegador en otra zona (medianoche UTC = 19:00 del día anterior en Lima).
 */
export function diaLocal(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}

/**
 * Los parámetros del GET (`AAAA-MM-DD`). `hasta` no pasa de hoy: el mes en
 * curso termina el 30, pero la madera talada llega hasta hoy.
 */
export function paramsDeExtraccion(planId: string | null, period: CtpPeriod, hoy: string = limaDateKey()): URLSearchParams {
  const q = new URLSearchParams();
  if (planId) q.set("planId", planId);
  if (!period.from || !period.to) return q;
  const desde = diaLocal(period.from);
  const hastaCrudo = diaLocal(period.to);
  if (!desde || !hastaCrudo) return q;
  const hasta = hastaCrudo > hoy ? hoy : hastaCrudo;
  if (desde > hasta) return q;
  q.set("desde", desde);
  q.set("hasta", hasta);
  const ant = periodoAnterior(period);
  const antDesde = ant?.from ? diaLocal(ant.from) : "";
  const antHasta = ant?.to ? diaLocal(ant.to) : "";
  if (antDesde && antHasta && antDesde <= antHasta) {
    q.set("antDesde", antDesde);
    q.set("antHasta", antHasta);
  }
  return q;
}

/** Acepta el cuerpo tal cual o envuelto (`{ extraccion }`); lo que no se parezca, `null`. */
export function leerExtraccion(json: unknown): ExtraccionResponse | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const cuerpo = (Array.isArray(o.permisos) ? o : o.extraccion) as Record<string, unknown> | undefined;
  if (!cuerpo || !Array.isArray(cuerpo.permisos) || !cuerpo.total || !Array.isArray(cuerpo.especies)) return null;
  return cuerpo as unknown as ExtraccionResponse;
}

// ─── La tabla ────────────────────────────────────────────────────────────────

export interface FilaTabla {
  id: string;
  etiqueta: string;
  detalle: string | null;
  fila: FilaExtraccion;
  /** Sólo en el modo «permisos»: el plan que se abre en sus especies. */
  permiso: PermisoExtraccion | null;
  hijos: FilaExtraccion[];
}

export interface VistaTabla {
  modo: "permisos" | "especies";
  filas: FilaTabla[];
  /** El pie: siempre una fila que mandó el servidor, nunca una suma de acá. */
  pie: { etiqueta: string; fila: FilaExtraccion } | null;
}

/**
 * Qué filas muestra la tabla. «Todos»: una por permiso, que se abre en sus
 * especies. Un permiso: una por especie. Con una especie elegida, cada permiso
 * muestra SU fila de esa especie y el pie es la especie en todo el alcance
 * (`especies` de la respuesta, sumada en el servidor).
 */
/** ¿La respuesta es de UN permiso (se eligió uno) y no de «Todos»? */
export function esUnPermiso(d: ExtraccionResponse): boolean {
  return Boolean(d.alcance.planId || d.alcance.contratoId) && d.permisos.length <= 1;
}

export function vistaDeTabla(d: ExtraccionResponse, especie: string | null): VistaTabla {
  if (esUnPermiso(d)) {
    const p = d.permisos[0] ?? null;
    const todas = p?.especies ?? d.especies;
    const filas = (especie ? todas.filter((e) => e.clave === especie) : todas).map((e) => ({
      id: e.clave,
      etiqueta: e.etiqueta,
      detalle: e.fueraDelPlan ? "fuera del plan" : null,
      fila: e,
      permiso: null,
      hijos: [],
    }));
    return { modo: "especies", filas, pie: { etiqueta: especie ? "Total del permiso" : "Total", fila: p?.total ?? d.total } };
  }
  const filas: FilaTabla[] = [];
  for (const p of d.permisos) {
    const id = p.planId ?? "sin-plan";
    if (especie) {
      const e = p.especies.find((x) => x.clave === especie);
      if (!e) continue;
      filas.push({ id, etiqueta: nombrePermiso(p), detalle: e.etiqueta, fila: e, permiso: p, hijos: [] });
    } else {
      filas.push({ id, etiqueta: nombrePermiso(p), detalle: detallePermiso(p), fila: p.total, permiso: p, hijos: p.especies });
    }
  }
  const deLaEspecie = especie ? d.especies.find((e) => e.clave === especie) ?? null : null;
  const pie = especie
    ? deLaEspecie
      ? { etiqueta: `Total · ${deLaEspecie.etiqueta}`, fila: deLaEspecie }
      : null
    : { etiqueta: `Total · ${plural(d.permisos.length, "permiso", "permisos")}`, fila: d.total };
  return { modo: "permisos", filas, pie };
}

/** Las especies del alcance, para el filtro de la cabecera (con cuántos árboles aprovechables). */
export function opcionesDeEspecie(d: ExtraccionResponse): { value: string; count: number }[] {
  return d.especies.map((e) => ({ value: e.clave, count: e.censo.aprovechables }));
}


// ─── Avisos ──────────────────────────────────────────────────────────────────

const PESO_NIVEL: Record<AvisoExtraccion["nivel"], number> = { error: 0, warning: 1, info: 2 };

/** El aviso trae su arreglo en la línea (hoy: «Unir» / «Elegir permiso», ADR-455). */
export function avisoConBoton(a: AvisoExtraccion): boolean {
  return a.tipo === "plan_sin_permiso" && Boolean(a.planId);
}

/**
 * Primero lo rojo, después lo ámbar, al final lo informativo. A igual nivel, el
 * que se arregla con un clic (se ven tres: en Blas «Todos» el «Unir» quedaba
 * 5.º de 6, escondido en «N más») y después la cifra mayor.
 */
export function ordenarAvisos(avisos: readonly AvisoExtraccion[]): AvisoExtraccion[] {
  return [...avisos].sort(
    (a, b) =>
      PESO_NIVEL[a.nivel] - PESO_NIVEL[b.nivel] ||
      Number(avisoConBoton(b)) - Number(avisoConBoton(a)) ||
      Math.abs(b.cifraM3 ?? 0) - Math.abs(a.cifraM3 ?? 0),
  );
}

// ─── Gráficos ────────────────────────────────────────────────────────────────

const TOPE_ESPECIES = 8;

export interface BarraEspecie {
  nombre: string;
  /** `null` = «Otras»: no se puede elegir como filtro. */
  clave: string | null;
  aprovechable: number;
  talado: number;
  trozado: number;
  despachado: number;
}

/** Las 8 especies con más base; el resto, juntas en «Otras (n)» sólo para el dibujo. */
export function barrasPorEspecie(especies: readonly FilaExtraccion[]): BarraEspecie[] {
  const orden = [...especies].sort((a, b) => b.censo.aprovechableM3 - a.censo.aprovechableM3 || b.talado.m3 - a.talado.m3);
  const barra = (e: FilaExtraccion): BarraEspecie => ({
    nombre: e.etiqueta,
    clave: e.clave,
    aprovechable: e.censo.aprovechableM3,
    talado: e.talado.m3,
    trozado: e.trozado.m3,
    despachado: e.despachado.m3,
  });
  const propias = orden.slice(0, TOPE_ESPECIES).map(barra);
  const resto = orden.slice(TOPE_ESPECIES);
  if (resto.length === 0) return propias;
  const suma = (f: (e: FilaExtraccion) => number) => resto.reduce((a, e) => a + f(e), 0);
  return [
    ...propias,
    {
      nombre: `Otras (${resto.length})`,
      clave: null,
      aprovechable: suma((e) => e.censo.aprovechableM3),
      talado: suma((e) => e.talado.m3),
      trozado: suma((e) => e.trozado.m3),
      despachado: suma((e) => e.despachado.m3),
    },
  ];
}

export interface TramosPuntaAPunta {
  nombre: string;
  id: string;
  despachado: number;
  consumido: number;
  monte: number;
  /** Talado que no llegó a troza: árboles sin trozar + la merma del trozado. */
  sinTrozar: number;
  porTalar: number;
}

/**
 * Tramos que no se pisan: cada troza cae en UNA salida (despachada, consumida
 * o en el monte) y lo talado que no es troza va aparte. Suman lo talado más lo
 * que falta talar, o sea la base (o lo talado, si se midió más que el censo).
 */
export function tramosDe(nombre: string, id: string, f: FilaExtraccion): TramosPuntaAPunta {
  const pos = (n: number) => (n > 0 ? n : 0);
  return {
    nombre,
    id,
    despachado: f.despachado.m3,
    consumido: f.consumidoTh.m3,
    monte: f.enElMonte.m3,
    sinTrozar: pos(f.talado.m3 - f.trozado.m3),
    porTalar: pos(f.censo.aprovechableM3 - f.talado.m3),
  };
}

