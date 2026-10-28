/**
 * El borrador de un viaje de la madera (Cubicador › Guardar y Guardadas ›
 * Salidas, Brandon 28-10): lo que se escribe en la ventana antes de mandarlo.
 *
 * «Una parte» es una tabla con una fila por grupo especie × tipo de ESA
 * cubicación. Al escribir las piezas se SUGIERE el pie tablar a su promedio
 * por pieza (`ptProporcional`) y se muestra el m³ que sale de él (÷ 424); si el
 * m³ se escribe a mano, el PT pasa a ser ese m³ × 424 y las piezas ya no lo
 * cambian. «Todo lo que queda» no tiene tabla: lleva el saldo de cada grupo.
 *
 * PURO (sin React): lo prueba `__tests__/forestal-cubicador-salidas-logica.test.ts`.
 */
import { m3DesdePt, ptDesdeM3, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { hoyISO, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import {
  claveGrupo, lineasDeLoQueQueda, ptProporcional, saldoDeLaCubicacion, TOLERANCIA_PT,
  type Cantidad, type GrupoCubicado, type LineaSalida, type SaldoCubicacion, type SaldoGrupo,
  type SalidaCubicacion, type SalidaEntrada,
} from "@/lib/forestal/cubicacion-salidas";

const r2 = (n: number) => Math.round(n * 100) / 100;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export type ModoSalida = "todo" | "parte";

/** Una fila de la tabla «Una parte» (lo escrito tal cual, más el PT que vale). */
export interface FilaBorrador {
  piezas: string;
  /** El m³ que se ve: el sugerido (desde el PT) o el escrito a mano. */
  m3: string;
  /** Pie tablar de la fila (2 decimales): de él sale el m³ de los totales. */
  pt: number;
  /** El m³ se escribió a mano: cambiar las piezas ya no lo toca. */
  aMano: boolean;
}

export const CAMPOS_VIAJE = ["cliente", "placa", "vehiculo", "chofer", "gtf", "destino", "notas"] as const;
export type CampoViaje = (typeof CAMPOS_VIAJE)[number];

export type BorradorSalida = Record<CampoViaje, string> & {
  /** El viaje que se corrige (sin id = nuevo). */
  id?: string;
  fecha: string;
  modo: ModoSalida;
  clienteParteId?: string;
  /** Por clave de grupo (`claveGrupo`). */
  filas: Record<string, FilaBorrador>;
};

/** Lo que vale si un campo queda vacío: el comprador siempre; el camión y la guía, sólo en el primer viaje. */
export type RespaldoViaje = Partial<Record<"cliente" | "clienteParteId" | "placa" | "chofer" | "gtf" | "destino", string>>;

export const FILA_VACIA: FilaBorrador = { piezas: "", m3: "", pt: 0, aMano: false };

/** «1,5» o «1.5» → 1.5; vacío, negativo o basura → 0. */
export function leerNumero(texto: string): number {
  const n = Number(texto.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
const leerPiezas = (texto: string): number => Math.round(leerNumero(texto));

/** El m³ para el input: tres decimales con punto (el input no lleva miles). */
export const m3ParaInput = (pt: number): string => (pt > 0 ? m3DesdePt(pt).toFixed(3) : "");

export function borradorNuevo(modo: ModoSalida, fecha = hoyISO()): BorradorSalida {
  return { fecha, modo, cliente: "", placa: "", vehiculo: "", chofer: "", gtf: "", destino: "", notas: "", filas: {} };
}

/** Se escribieron las piezas: si el m³ no es a mano, se sugiere el PT a su promedio por pieza. */
export function conPiezas(grupo: Pick<GrupoCubicado, "piezas" | "pt">, fila: FilaBorrador, texto: string): FilaBorrador {
  if (fila.aMano) return { ...fila, piezas: texto };
  const pt = ptProporcional(grupo, leerPiezas(texto));
  return { piezas: texto, pt, m3: m3ParaInput(pt), aMano: false };
}

/** Se escribió el m³ a mano: el PT es ese m³ × 424. Borrarlo vuelve a la sugerencia. */
export function conM3(grupo: Pick<GrupoCubicado, "piezas" | "pt">, fila: FilaBorrador, texto: string): FilaBorrador {
  if (!texto.trim()) return { ...fila, m3: "", pt: ptProporcional(grupo, leerPiezas(fila.piezas)), aMano: false };
  return { ...fila, m3: texto, pt: ptDesdeM3(leerNumero(texto)), aMano: true };
}

/** La línea de UNA fila de la tabla (sin cantidad → `null`). */
export function lineaDeFila(g: Pick<GrupoCubicado, "especie" | "tipo">, f: FilaBorrador | undefined): LineaSalida | null {
  if (!f) return null;
  const piezas = leerPiezas(f.piezas);
  const pt = r2(f.pt);
  return piezas > 0 || pt > 0 ? { especie: g.especie, tipo: g.tipo, piezas, pt } : null;
}

/** Las líneas con cantidad de la tabla, en el orden de los grupos. */
export function lineasDeLaTabla(grupos: readonly GrupoCubicado[], filas: Record<string, FilaBorrador>): LineaSalida[] {
  return grupos.map((g) => lineaDeFila(g, filas[g.clave])).filter((l): l is LineaSalida => l !== null);
}

/** Piezas, PT y m³ de unas líneas (el m³ del PT total, no la suma de m³). */
export function totalDeLineas(lineas: readonly LineaSalida[]): Cantidad {
  const pt = r2(lineas.reduce((a, l) => a + l.pt, 0));
  return { piezas: lineas.reduce((a, l) => a + l.piezas, 0), pt, m3: m3DesdePt(pt) };
}

/** Lo que se llevó de más en una fila respecto de lo que quedaba (piezas o más de 1 PT). */
export const seExcede = (g: Pick<SaldoGrupo, "queda">, l: Pick<LineaSalida, "piezas" | "pt">): boolean =>
  l.piezas > g.queda.piezas || l.pt > g.queda.pt + TOLERANCIA_PT;

/** Las líneas del viaje: «todo» = el saldo de cada grupo; «parte» = lo escrito en la tabla. */
export const lineasDelBorrador = (b: Pick<BorradorSalida, "modo" | "filas">, saldo: SaldoCubicacion): LineaSalida[] =>
  b.modo === "todo" ? lineasDeLoQueQueda(saldo) : lineasDeLaTabla(saldo.grupos, b.filas);

/** El saldo SIN el viaje que se corrige (para que sus propias piezas cuenten como disponibles). */
export function saldoParaEditar(
  piezas: readonly PiezaCubicada[], salidas: readonly SalidaCubicacion[] | undefined, editando: string | undefined, precioGeneral = 0,
): SaldoCubicacion {
  return saldoDeLaCubicacion(piezas, editando ? (salidas ?? []).filter((s) => s.id !== editando) : salidas, precioGeneral);
}

export type ResultadoEntrada = { ok: true; entrada: SalidaEntrada } | { ok: false; mensaje: string };

/**
 * Lo que se manda al PATCH. Vacíos: el comprador sale del respaldo (la ficha);
 * placa, chofer, GTF y destino, también, pero sólo en el primer viaje (el
 * segundo camión casi nunca es el de la ficha).
 */
export function entradaDelBorrador(
  b: BorradorSalida, saldo: SaldoCubicacion, respaldo: RespaldoViaje = {}, primerViaje = saldo.viajes === 0,
): ResultadoEntrada {
  if (!FECHA.test(b.fecha)) return { ok: false, mensaje: "Pon la fecha del viaje." };
  const lineas = lineasDelBorrador(b, saldo);
  if (lineas.length === 0) {
    return { ok: false, mensaje: b.modo === "todo" ? "Ya no queda madera de esta cubicación." : "Anota cuántas piezas o m³ se llevó de al menos una fila." };
  }
  const entrada: SalidaEntrada = { fecha: b.fecha, completo: b.modo === "todo", lineas };
  if (b.id) entrada.id = b.id;
  const cliente = b.cliente.trim() || respaldo.cliente?.trim() || "";
  if (cliente) entrada.cliente = cliente;
  const parteId = b.cliente.trim() ? b.clienteParteId : respaldo.clienteParteId;
  if (cliente && parteId) entrada.clienteParteId = parteId;
  for (const k of ["placa", "chofer", "gtf", "destino"] as const) {
    const v = b[k].trim() || (primerViaje ? respaldo[k]?.trim() ?? "" : "");
    if (v) entrada[k] = v;
  }
  for (const k of ["vehiculo", "notas"] as const) if (b[k].trim()) entrada[k] = b[k].trim();
  return { ok: true, entrada };
}

/** Lo que vale un campo vacío del viaje: el comprador, la placa, el chofer, la GTF y el destino de la ficha. */
export const respaldoDeGuardada = (c: { cliente?: string | null; ficha?: CubicacionRegistro["ficha"] | null; gtfNumber?: string | null }): RespaldoViaje => ({
  cliente: c.cliente ?? undefined, clienteParteId: c.ficha?.clienteParteId, placa: c.ficha?.placa,
  chofer: c.ficha?.chofer, gtf: c.gtfNumber ?? undefined, destino: c.ficha?.destino,
});

/** Un viaje anotado, de vuelta al borrador para corregirlo. */
export function borradorDeSalida(s: SalidaCubicacion, grupos: readonly GrupoCubicado[]): BorradorSalida {
  const filas: Record<string, FilaBorrador> = {};
  for (const l of s.lineas) {
    const clave = claveGrupo(l.especie, l.tipo);
    const g = grupos.find((x) => x.clave === clave);
    /* Si el PT no es el que sugieren sus piezas, se escribió a mano: que no se pise. */
    const aMano = !g || Math.abs(ptProporcional(g, l.piezas) - l.pt) > 0.01;
    filas[clave] = { piezas: l.piezas > 0 ? String(l.piezas) : "", pt: l.pt, m3: m3ParaInput(l.pt), aMano };
  }
  return {
    /* Siempre «parte» con SUS líneas: en «todo» se recalcularía con lo que queda hoy, y corregir
       sólo la placa de un viaje viejo le cambiaba las piezas si después se re-cubicó (revisión 28-10). */
    id: s.id, fecha: s.fecha, modo: "parte", clienteParteId: s.clienteParteId,
    cliente: s.cliente ?? "", placa: s.placa ?? "", vehiculo: s.vehiculo ?? "", chofer: s.chofer ?? "",
    gtf: s.gtf ?? "", destino: s.destino ?? "", notas: s.notas ?? "", filas,
  };
}

/** Cuánto lleva un viaje anotado (para la lista). */
export const totalDeSalida = (s: Pick<SalidaCubicacion, "lineas">): Cantidad => totalDeLineas(s.lineas);

/** El saldo de una guardada (Guardadas): sus piezas, sus viajes y su precio general. */
export const saldoDeGuardada = (c: Pick<CubicacionRegistro, "piezas" | "salidas" | "precioPt">): SaldoCubicacion =>
  saldoDeLaCubicacion(c.piezas, c.salidas, c.precioPt);

/**
 * Lo que sigue en el patio entre varias guardadas: las que todavía tienen
 * saldo y cuánto. `conViajes` = cuántas ya tienen algún viaje (sin ninguno, el
 * aviso no dice nada nuevo: todo está en el patio).
 */
export function resumenEnPatio(lista: readonly Pick<CubicacionRegistro, "id" | "piezas" | "salidas" | "precioPt">[]) {
  const ids = new Set<string>();
  let pt = 0;
  let conViajes = 0;
  for (const c of lista) {
    const s = saldoDeGuardada(c);
    if (s.viajes > 0) conViajes += 1;
    if (s.queda.piezas > 0 || s.queda.pt >= TOLERANCIA_PT) {
      ids.add(c.id);
      pt += s.queda.pt;
    }
  }
  return { ids, cantidad: ids.size, conViajes, pt: r2(pt), m3: m3DesdePt(r2(pt)) };
}
