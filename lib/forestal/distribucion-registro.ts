/**
 * distribucion-registro — una distribución de rolliza GUARDADA: los bloques
 * (etiqueta, permiso, especie, m³, % aprovechable…) tal como quedaron
 * cargados, con nombre y fecha, para volver a abrirlos después SIN volver a
 * tipear nada (Brandon, 2026-09-01: "una función para guardar esa
 * distribución de bloques, para cuando quiera en otro lado después pueda
 * escoger eso guardado y se ponga todos los datos de los bloques").
 *
 * PURO y client-safe (lo usan el componente y la capa de datos) — mismo
 * patrón que `cubicacion-registro.ts`, no una fábrica nueva.
 *
 * Guarda `bloques` tal cual: no la distribución YA CALCULADA (`porDia`,
 * `asignado`…), porque esa se recalcula siempre contra la aserrada que haya
 * cargada en ese momento — lo único que tiene sentido persistir es el INSUMO
 * (los bloques de rolliza), no un resultado que depende de datos que cambian.
 */

import { esAserradaDirecta, type BloqueRolliza } from "./cubicacion-reparto";

export interface DistribucionTotales {
  bloques: number;
  /** m³ de ROLLIZA — sólo los bloques de troza, nunca los de aserrada directa. */
  rollizaM3: number;
  /**
   * m³ cargados como madera YA ASERRADA (bloques sin troza de origen).
   * Opcional porque los registros guardados antes de que existiera el campo
   * no lo traen: ausente ≠ 0 declarado, se lee como «no se sabía».
   */
  aserradaDirectaM3?: number;
  especies: number;
}

export interface DistribucionRegistro {
  id: string;
  /** Nombre con el que se va a buscar ("Guías Tornillo · semana 36"). */
  nombre: string;
  /** Fecha del trabajo (date-only AAAA-MM-DD); puede no ser la de guardado. */
  fecha: string;
  notas?: string;
  bloques: BloqueRolliza[];
  totales: DistribucionTotales;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Fecha de hoy en formato date-only, sin arrastrar la hora. */
export const hoyISO = (): string => new Date().toISOString().slice(0, 10);

/** Totales de un conjunto de bloques (los mismos que muestra la tabla). */
export function totalesDeDistribucion(bloques: BloqueRolliza[]): DistribucionTotales {
  return {
    bloques: bloques.length,
    /* Los dos volúmenes NO se suman: la troza que hay que aserrar y la tabla
       que ya vino aserrada no se miden igual (misma regla que
       `distribuirPorCapacidad`). */
    rollizaM3: r4(bloques.filter((b) => !esAserradaDirecta(b)).reduce((a, b) => a + (Number(b.m3) || 0), 0)),
    aserradaDirectaM3: r4(bloques.filter((b) => esAserradaDirecta(b)).reduce((a, b) => a + (Number(b.m3) || 0), 0)),
    especies: new Set(bloques.map((b) => (b.especie || "").trim()).filter(Boolean)).size,
  };
}

/**
 * Arma el registro completo a partir de los bloques en pantalla. Es la única
 * vía de creación: así los totales guardados SIEMPRE salen de los bloques,
 * nunca de un número que mande el cliente.
 */
export function construirRegistroDistribucion(input: {
  id?: string;
  nombre: string;
  fecha?: string;
  notas?: string;
  bloques: BloqueRolliza[];
  createdAt?: string;
  createdBy?: string;
}): DistribucionRegistro {
  const ahora = new Date().toISOString();
  return {
    id: input.id ?? `dst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nombre: (input.nombre || "Distribución sin nombre").trim().slice(0, 120),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(input.fecha ?? "") ? input.fecha! : hoyISO(),
    notas: input.notas?.trim().slice(0, 600) || undefined,
    bloques: input.bloques,
    totales: totalesDeDistribucion(input.bloques),
    createdAt: input.createdAt ?? ahora,
    updatedAt: ahora,
    createdBy: input.createdBy,
  };
}

/** Nombre sugerido cuando el usuario no escribe uno: fecha + especies + bloques. */
export function nombreSugeridoDistribucion(bloques: BloqueRolliza[]): string {
  const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
  const especies = [...new Set(bloques.map((b) => (b.especie || "").trim()).filter(Boolean))];
  const prefijo = especies.length === 1 ? `${especies[0]} · ` : especies.length > 1 ? `${especies.length} especies · ` : "";
  return `${prefijo}${bloques.length} bloque${bloques.length === 1 ? "" : "s"} · ${fecha}`;
}

/** Filtra el historial por nombre, notas o fecha. */
export function filtrarDistribuciones(lista: DistribucionRegistro[], termino: string): DistribucionRegistro[] {
  const t = termino.trim().toLowerCase();
  if (!t) return lista;
  return lista.filter((d) =>
    [d.nombre, d.fecha, d.notas, ...d.bloques.map((b) => b.etiqueta), ...d.bloques.map((b) => b.permiso ?? "")]
      .some((campo) => (campo ?? "").toLowerCase().includes(t)),
  );
}
