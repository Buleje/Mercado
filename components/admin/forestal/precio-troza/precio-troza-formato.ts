/**
 * precio-troza-formato — lo puro de la vista «¿Cuánto pagar por la troza?»
 * (noche 04-11, carril B2): leer las casillas, armar la consulta y poner las
 * cifras en palabras. Sin React: lo prueba `__tests__/precio-troza-formato.test.ts`.
 *
 * Las cuentas las hace el servidor (`GET /api/admin/forestal/precio-troza`);
 * acá sólo se decide QUÉ se le pide y CÓMO se lee lo que devuelve.
 */
import { formatNumber } from "@/lib/format";
import type { AgruparOrigenPor, CostoNoIngresado, FilaRendimientoOrigen, PrecioTrozaDTO } from "@/lib/forestal/precio-troza-tipos";

/** Lo que el dueño escribe arriba, tal cual (texto: «vacío» ≠ 0). */
export interface CasillasPrecioTroza {
  aserrio: string;
  flete: string;
  margen: string;
  precio: string;
}
export type CampoPrecioTroza = keyof CasillasPrecioTroza;

export const CASILLAS_VACIAS: CasillasPrecioTroza = { aserrio: "", flete: "", margen: "", precio: "" };

/** Topes del endpoint (Zod del route): fuera de ellos el servidor responde 400. */
const TOPE: Record<CampoPrecioTroza, number> = { aserrio: 1_000_000, flete: 1_000_000, margen: 95, precio: 1_000 };
const TEXTO_TOPE: Record<CampoPrecioTroza, string> = {
  aserrio: "Hasta S/ 1.000.000",
  flete: "Hasta S/ 1.000.000",
  margen: "Hasta 95 %",
  precio: "Hasta S/ 1.000 por pie",
};

export interface LecturaCasilla {
  /** null = vacía o con error: no se manda (el servidor usa lo suyo o cuenta 0). */
  valor: number | null;
  error: string | null;
}

/** «12,5», «12.5» o « 80 » → número; vacío → null sin error; letras o negativos → error. */
export function leerCasilla(campo: CampoPrecioTroza, texto: string): LecturaCasilla {
  const limpio = texto.trim().replace(/\s/g, "");
  if (limpio === "") return { valor: null, error: null };
  /* Coma decimal peruana; si trae punto Y coma, el punto es de miles (1.250,50). */
  const normal = limpio.includes(",") ? limpio.replace(/\./g, "").replace(",", ".") : limpio;
  if (!/^\d+(\.\d+)?$/.test(normal)) return { valor: null, error: "Solo números" };
  const n = Number(normal);
  if (!Number.isFinite(n)) return { valor: null, error: "Solo números" };
  if (n > TOPE[campo]) return { valor: null, error: TEXTO_TOPE[campo] };
  return { valor: n, error: null };
}

/** La consulta del endpoint: sólo las casillas válidas y escritas, más el agrupado. */
export function consultaPrecioTroza(c: CasillasPrecioTroza, agrupar: AgruparOrigenPor): string {
  const q = new URLSearchParams();
  for (const campo of ["aserrio", "flete", "margen", "precio"] as const) {
    const { valor } = leerCasilla(campo, c[campo]);
    if (valor !== null) q.set(campo, String(valor));
  }
  q.set("agrupar", agrupar);
  return q.toString();
}

/** Un valor guardado en el navegador que no tiene la forma esperada vuelve a vacío. */
export function casillasGuardadas(v: unknown): CasillasPrecioTroza {
  if (!v || typeof v !== "object") return CASILLAS_VACIAS;
  const o = v as Record<string, unknown>;
  const txt = (x: unknown) => (typeof x === "string" ? x.slice(0, 20) : "");
  return { aserrio: txt(o.aserrio), flete: txt(o.flete), margen: txt(o.margen), precio: txt(o.precio) };
}

export const fmtSoles = (v: number | null | undefined, d = 2): string => (v == null ? "—" : `${v < 0 ? "−" : ""}S/ ${formatNumber(Math.abs(v), d)}`);

/** Diferencia con signo SIEMPRE visible: «+S/ 120,00», «−S/ 45,50»; cero sin signo. */
export function fmtDifSoles(v: number | null): string {
  if (v == null) return "—";
  const r = Math.round(v * 100) / 100;
  if (r === 0) return `S/ ${formatNumber(0, 2)}`;
  return `${r > 0 ? "+" : "−"}S/ ${formatNumber(Math.abs(r), 2)}`;
}

export function fmtDifPt(v: number): string {
  const r = Math.round(v);
  if (r === 0) return "0 PT";
  return `${r > 0 ? "+" : "−"}${formatNumber(Math.abs(r), 0)} PT`;
}

export type Tono = "bien" | "mal" | "neutro";

/** Verde si hay espacio (o rinde sobre el promedio), rojo si se pasa (o rinde menos). */
export function tonoDe(v: number | null, umbral = 0.5): Tono {
  if (v == null || Math.abs(v) < umbral) return "neutro";
  return v > 0 ? "bien" : "mal";
}

const NOMBRE_COSTO: Record<CostoNoIngresado, string> = { aserrio: "aserrío", flete: "flete", margen: "margen" };

/** «No pusiste: flete y margen» — el máximo se calculó con esos en 0. */
export function textoCostosNoIngresados(c: readonly CostoNoIngresado[]): string | null {
  if (c.length === 0) return null;
  const nombres = c.map((x) => NOMBRE_COSTO[x]);
  const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
  return `No pusiste: ${lista}`;
}

/** Corridas que no entran a la cuenta, en una frase; null si no quedó ninguna fuera. */
export function textoCorridasFuera(f: PrecioTrozaDTO["corridasFuera"]): string | null {
  const partes: string[] = [];
  if (f.enProceso > 0) partes.push(`${f.enProceso} en proceso`);
  if (f.enPt > 0) partes.push(`${f.enPt} declarada${f.enPt === 1 ? "" : "s"} en pies`);
  if (f.sinEntrada > 0) partes.push(`${f.sinEntrada} sin m³ de entrada`);
  if (partes.length === 0) return null;
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
  return `${lista} quedaron fuera`;
}

/** Sólo hay «Sin origen»: todavía no se sabe a quién le conviene comprarle. */
export function soloSinOrigen(filas: readonly FilaRendimientoOrigen[]): boolean {
  return filas.length > 0 && filas.every((f) => f.sinOrigen);
}

/** Las de origen conocido primero (mejor rendimiento arriba); «Sin origen» al final. */
export function ordenarOrigen(filas: readonly FilaRendimientoOrigen[]): FilaRendimientoOrigen[] {
  return [...filas].sort((a, b) => Number(a.sinOrigen) - Number(b.sinOrigen) || (b.rendimientoPct ?? -1) - (a.rendimientoPct ?? -1));
}
