/**
 * lib/semaforo/evaluar.ts — de las cifras medidas al color y «qué hacer» (ADR-508).
 *
 * Puro y determinista: la DB trae las cifras (`CifrasSemaforo`), acá se decide el
 * color con los umbrales del negocio. Reglas de color:
 *  · mayor: ≥ verde → verde · ≥ amarillo → amarillo · si no, rojo.
 *  · menor: ≤ verde → verde · ≤ amarillo → amarillo · si no, rojo.
 *  · rango: verde..verdeHasta → verde · hasta amarillo → amarillo · más → rojo;
 *    debajo del piso verde → amarillo «bajo» (con su propia acción).
 *  · umbral faltante → «sin_meta» (gris, muestra el valor) · valor faltante → «sin_dato».
 */
import { INDICADORES, type ColorSemaforo, type IndicadorId, type Sentido, type TramoAccion, type Unidad, type UmbralIndicador } from "./indicadores";
import type { ConfigSemaforo } from "./config";
import { sumarDias } from "@/lib/agenda/recurrencia";

export interface CifrasSemaforo {
  /** Ventas del mostrador + pedidos que entran, en el período. */
  pedidos: number;
  ventas: number;
  costo: number;
  /** Parte de `costo` que es estimada (55 % de ventas sin costo anotado). */
  costoEstimado: number;
  gastos: number;
  anuncios: number;
  clientesNuevos: number;
  /** Ventana larga: desde el lanzamiento o los últimos 90 días. */
  recompra: { clientes: number; volvieron: number; desde: string };
  productosA: { conStock: number; agotados: number; nombres: string[] };
  vencidosDanados: number;
  stock: { valorCosto: number; productosConStock: number };
  sinRotar: { n: number; nombres: string[] };
  /** Desde el lanzamiento hasta `hasta`. `null` sin lanzamiento o antes de él. */
  acumulado: { ventas: number; costo: number; gastos: number } | null;
}

export interface IndicadorDTO {
  id: IndicadorId;
  nombre: string;
  unidad: Unidad;
  sentido: Sentido;
  valor: number | null;
  color: ColorSemaforo;
  /** La frase del color (o «Pon tu meta» / por qué no hay dato). */
  queHacer: string;
  /** «Verde 8 o más · Amarillo 5 a 7 · Rojo menos de 5». */
  regla: string;
  mide: string;
  /** Cómo salió el número: «12 en 7 días», «anotada el 13 oct». */
  detalle: string | null;
  umbral: UmbralIndicador;
}

export interface PeriodoSemaforo {
  desde: string;
  hasta: string;
  hoy: string;
}

export function evaluarColor(
  valor: number | null,
  u: UmbralIndicador,
  sentido: Sentido,
): { color: ColorSemaforo; tramo: TramoAccion | null } {
  if (valor === null || !Number.isFinite(valor)) return { color: "sin_dato", tramo: null };
  if (u.verde === null || u.amarillo === null) return { color: "sin_meta", tramo: null };
  if (sentido === "mayor") {
    if (valor >= u.verde) return { color: "verde", tramo: "verde" };
    if (valor >= u.amarillo) return { color: "amarillo", tramo: "amarillo" };
    return { color: "rojo", tramo: "rojo" };
  }
  if (sentido === "menor") {
    if (valor <= u.verde) return { color: "verde", tramo: "verde" };
    if (valor <= u.amarillo) return { color: "amarillo", tramo: "amarillo" };
    return { color: "rojo", tramo: "rojo" };
  }
  const techo = u.verdeHasta ?? u.verde;
  if (valor < u.verde) return { color: "amarillo", tramo: "bajo" };
  if (valor <= techo) return { color: "verde", tramo: "verde" };
  if (valor <= u.amarillo) return { color: "amarillo", tramo: "amarillo" };
  return { color: "rojo", tramo: "rojo" };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"] as const;

/** «2026-11-09» → «9 nov» (meses a mano: `Intl` cambia por versión de ICU). Lo usa también la vista. */
export function diaMes(key: string): string {
  return `${Number(key.slice(8, 10))} ${MESES[Number(key.slice(5, 7)) - 1] ?? ""}`;
}

export function formatearValor(n: number, unidad: Unidad): string {
  const entero = Number.isInteger(n) || unidad === "cantidad" || unidad === "dias";
  const txt = (entero ? Math.round(n) : r2(n)).toLocaleString("es-PE", { maximumFractionDigits: 2 });
  if (unidad === "soles") return `S/ ${txt}`;
  if (unidad === "porcentaje") return `${txt} %`;
  if (unidad === "dias") return `${txt} días`;
  return txt;
}

/** El texto del ⓘ con los umbrales vigentes. */
export function textoRegla(u: UmbralIndicador, sentido: Sentido, unidad: Unidad): string {
  if (u.verde === null || u.amarillo === null) return "Sin meta: ponla en Ajustes.";
  const f = (n: number) => formatearValor(n, unidad);
  if (sentido === "mayor") return `Verde ${f(u.verde)} o más · Amarillo desde ${f(u.amarillo)} · Rojo menos de ${f(u.amarillo)}`;
  if (sentido === "menor") {
    const verde = u.verde === 0 ? f(0) : `hasta ${f(u.verde)}`;
    return `Verde ${verde} · Amarillo hasta ${f(u.amarillo)} · Rojo más de ${f(u.amarillo)}`;
  }
  const techo = u.verdeHasta ?? u.verde;
  const n = (x: number) => formatearValor(x, "cantidad");
  return `Verde ${n(u.verde)} a ${f(techo)} · Amarillo hasta ${f(u.amarillo)} (o menos de ${f(u.verde)}) · Rojo más de ${f(u.amarillo)}`;
}

/** Días del período, contando ambos extremos. */
export function diasDelPeriodo(desde: string, hasta: string): number {
  const ms = Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}

const pct = (a: number, b: number): number | null => (b > 0 ? r2((a / b) * 100) : null);
const lista = (nombres: string[], n: number) => {
  const vistos = nombres.slice(0, 3).join(", ");
  return n > 3 ? `${vistos} y ${n - 3} más` : vistos;
};

interface Medida {
  valor: number | null;
  detalle: string | null;
  /** Texto cuando no hay dato (en vez de la acción). */
  sinDato?: string;
  /** Umbral efectivo distinto del guardado (ritmo de la ganancia acumulada). */
  umbral?: UmbralIndicador;
  /** Color forzado por una regla compuesta (rojo sólo con recompra baja). */
  ajustarColor?: (c: { color: ColorSemaforo; tramo: TramoAccion | null }) => { color: ColorSemaforo; tramo: TramoAccion | null };
}

function medir(id: IndicadorId, c: CifrasSemaforo, cfg: ConfigSemaforo, p: PeriodoSemaforo): Medida {
  const dias = diasDelPeriodo(p.desde, p.hasta);
  const ganancia = c.ventas - c.costo - c.gastos;
  switch (id) {
    case "pedidos_semana":
      return dias > 0
        ? { valor: r2((c.pedidos / dias) * 7), detalle: `${c.pedidos} en ${dias} ${dias === 1 ? "día" : "días"}` }
        : { valor: null, detalle: null };
    case "ticket_promedio":
      return c.pedidos > 0
        ? { valor: r2(c.ventas / c.pedidos), detalle: `S/ ${r2(c.ventas).toLocaleString("es-PE")} ÷ ${c.pedidos}` }
        : { valor: null, detalle: null, sinDato: "Sin ventas en el período." };
    case "ganancia_neta":
      return c.ventas > 0
        ? {
            valor: pct(ganancia, c.ventas),
            detalle: `S/ ${r2(ganancia).toLocaleString("es-PE")} de S/ ${r2(c.ventas).toLocaleString("es-PE")}${c.costoEstimado > 0 ? " · costo en parte estimado" : ""}`,
          }
        : { valor: null, detalle: null, sinDato: "Sin ventas en el período." };
    case "productos_a_agotados":
      return c.productosA.conStock > 0
        ? { valor: c.productosA.agotados, detalle: c.productosA.agotados > 0 ? lista(c.productosA.nombres, c.productosA.agotados) : `${c.productosA.conStock} con stock` }
        : { valor: null, detalle: null, sinDato: "Tus productos A no llevan stock: anótalo en Inventario." };
    case "vencidos_danados":
      return { valor: c.vencidosDanados, detalle: null };
    case "recompra":
      return c.recompra.clientes > 0
        ? { valor: pct(c.recompra.volvieron, c.recompra.clientes), detalle: `${c.recompra.volvieron} de ${c.recompra.clientes} desde ${c.recompra.desde}` }
        : { valor: null, detalle: null, sinDato: "Sin ventas con celular del cliente." };
    case "costo_cliente_nuevo":
      if (c.anuncios <= 0) return { valor: null, detalle: null, sinDato: "Anota los anuncios como gasto (categoría Marketing o Publicidad)." };
      return c.clientesNuevos > 0
        ? { valor: r2(c.anuncios / c.clientesNuevos), detalle: `S/ ${r2(c.anuncios).toLocaleString("es-PE")} ÷ ${c.clientesNuevos} nuevos` }
        : { valor: r2(c.anuncios), detalle: `S/ ${r2(c.anuncios).toLocaleString("es-PE")} y ningún cliente nuevo` };
    case "dias_stock": {
      const costoDia = dias > 0 ? c.costo / dias : 0;
      if (c.stock.productosConStock === 0) return { valor: null, detalle: null, sinDato: "Sin stock anotado." };
      if (costoDia <= 0) return { valor: null, detalle: null, sinDato: "Sin ventas en el período para medirlo." };
      return { valor: Math.round(c.stock.valorCosto / costoDia), detalle: `S/ ${Math.round(c.stock.valorCosto).toLocaleString("es-PE")} ÷ S/ ${r2(costoDia).toLocaleString("es-PE")} por día` };
    }
    case "sin_rotar":
      return c.stock.productosConStock > 0
        ? { valor: c.sinRotar.n, detalle: c.sinRotar.n > 0 ? lista(c.sinRotar.nombres, c.sinRotar.n) : null }
        : { valor: null, detalle: null, sinDato: "Sin stock anotado." };
    case "caja":
      return cfg.cajaAnotada
        ? {
            valor: cfg.cajaAnotada.monto,
            detalle: `anotada el ${cfg.cajaAnotada.fecha}${diasDelPeriodo(cfg.cajaAnotada.fecha, p.hoy) > 8 ? " · anótala de nuevo" : ""}`,
          }
        : { valor: null, detalle: null, sinDato: "Anota la caja del lunes en Ajustes." };
    case "ganancia_acumulada":
      return medirAcumulada(c, cfg, p);
  }
}

function medirAcumulada(c: CifrasSemaforo, cfg: ConfigSemaforo, p: PeriodoSemaforo): Medida {
  if (!cfg.lanzamiento) return { valor: null, detalle: null, sinDato: "Pon el día del lanzamiento en Ajustes." };
  if (!c.acumulado) return { valor: null, detalle: null, sinDato: `Empieza a contar el ${diaMes(cfg.lanzamiento)}.` };
  const valor = r2(c.acumulado.ventas - c.acumulado.costo - c.acumulado.gastos);
  const d = cfg.decision;
  if (!d) return { valor, detalle: `desde el ${diaMes(cfg.lanzamiento)}` };
  const total = diasDelPeriodo(cfg.lanzamiento, d.fecha);
  const corridos = diasDelPeriodo(cfg.lanzamiento, p.hasta < d.fecha ? p.hasta : d.fecha);
  const factor = total > 0 ? Math.min(1, corridos / total) : 1;
  const umbral: UmbralIndicador = { verde: r2(d.verde * factor), amarillo: r2(d.amarillo * factor) };
  const recompraPct = c.recompra.clientes > 0 ? (c.recompra.volvieron / c.recompra.clientes) * 100 : null;
  return {
    valor,
    detalle:
      factor < 1
        ? `ritmo al ${diaMes(p.hasta)}: verde desde S/ ${Math.round(umbral.verde ?? 0)} · se decide el ${diaMes(d.fecha)}`
        : `decisión del ${diaMes(d.fecha)}`,
    umbral,
    ajustarColor: (r) => {
      // Rojo de verdad sólo si además casi nadie vuelve (manual §7); si no, ajustar.
      if (r.color !== "rojo" || d.rojoSiRecompraMenorA === null) return r;
      return recompraPct !== null && recompraPct < d.rojoSiRecompraMenorA ? r : { color: "amarillo", tramo: "amarillo" };
    },
  };
}

/** Los indicadores encendidos, en el orden del catálogo. */
export function armarIndicadores(c: CifrasSemaforo, cfg: ConfigSemaforo, p: PeriodoSemaforo): IndicadorDTO[] {
  const salida: IndicadorDTO[] = [];
  for (const def of INDICADORES) {
    const ajuste = cfg.indicadores[def.id];
    if (ajuste.apagado) continue;
    if (def.id === "ganancia_acumulada" && !cfg.lanzamiento) continue;
    const m = medir(def.id, c, cfg, p);
    const umbral = m.umbral ?? { verde: ajuste.verde, amarillo: ajuste.amarillo, verdeHasta: ajuste.verdeHasta };
    const base = evaluarColor(m.valor, umbral, def.sentido);
    const { color, tramo } = m.ajustarColor ? m.ajustarColor(base) : base;
    const queHacer =
      color === "sin_dato" ? (m.sinDato ?? "Sin datos en el período.")
      : color === "sin_meta" ? "Pon tu meta en Ajustes para ver el color."
      : ajuste.acciones[tramo ?? "amarillo"];
    salida.push({
      id: def.id,
      nombre: def.nombre,
      unidad: def.unidad,
      sentido: def.sentido,
      valor: m.valor,
      color,
      queHacer,
      regla: textoRegla(umbral, def.sentido, def.unidad),
      mide: def.mide,
      detalle: m.detalle,
      umbral,
    });
  }
  return salida;
}

export type PeriodoId = "semana" | "mes" | "lanzamiento";

/** Rango de cada chip. «lanzamiento» sin día cargado = últimos 90 días. */
export function rangoDePeriodo(periodo: PeriodoId, hoy: string, lanzamiento: string | null): { desde: string; hasta: string } {
  if (periodo === "semana") return { desde: sumarDias(hoy, -6), hasta: hoy };
  if (periodo === "mes") return { desde: sumarDias(hoy, -29), hasta: hoy };
  return { desde: lanzamiento && lanzamiento <= hoy ? lanzamiento : sumarDias(hoy, -89), hasta: hoy };
}

/** Ventana de la recompra: desde el lanzamiento (si ya pasó) o 90 días. */
export function ventanaRecompra(hasta: string, lanzamiento: string | null): string {
  return lanzamiento && lanzamiento <= hasta ? lanzamiento : sumarDias(hasta, -89);
}

/** Resumen de una línea para la cabecera: «3 en verde · 2 amarillo · 1 rojo». */
export function contarColores(ind: IndicadorDTO[]): Record<ColorSemaforo, number> {
  const r: Record<ColorSemaforo, number> = { verde: 0, amarillo: 0, rojo: 0, sin_meta: 0, sin_dato: 0 };
  for (const i of ind) r[i.color] += 1;
  return r;
}
