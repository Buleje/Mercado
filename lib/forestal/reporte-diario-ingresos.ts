/**
 * Ingresos del reporte diario contados por GUÍA, no por asiento (ADR-439).
 *
 * Una GTF con tres especies son tres asientos —el formato oficial pide una
 * línea por especie (ADR-312)— pero es UN papel y UN camión. Contar asientos
 * decía «11 guías · 7 por recibir» en `main` (20/09–26/09) cuando la bandeja,
 * que agrupa por guía (`WoodEntriesDB.listPorGuia`), mostraba 8 · 5.
 *
 * La guía es la de la bandeja (`claveDeGuia`: serie + número). Un asiento sin
 * número es su propia guía: no hay con qué juntarlo. Una guía está POR RECIBIR
 * si alguno de sus asientos vigentes no está recepcionado: se recibe de una, y
 * un asiento pendiente es madera que nadie declaró ver bajar del camión.
 *
 * PURO: recibe los asientos vigentes (sin rechazados ni anulados) y los ids con
 * la recepción cerrada; no consulta nada.
 */
import { claveDeGuia } from "./ingresos-por-guia";

export interface AsientoDeIngreso {
  id: string;
  gtfSeries: string | null;
  gtfNumber: string | null;
  /** Madera de servicio (ajena, ADR-437): se cuenta, y se dice aparte. */
  maderaDeTercero: boolean;
  speciesCommonName: string | null;
  providerName: string | null;
  volumeM3: number | null;
}

export interface FilaPorGuia {
  nombre: string;
  /** Guías distintas (no asientos). */
  cantidad: number;
  m3: number;
}

export interface IngresosPorGuia {
  guias: number;
  m3: number;
  porRecibir: number;
  deServicio: number;
  porEspecie: FilaPorGuia[];
  porProveedor: FilaPorGuia[];
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

const guiaDe = (a: AsientoDeIngreso): string =>
  a.gtfNumber?.trim() ? claveDeGuia({ gtfNumber: a.gtfNumber, gtfSeries: a.gtfSeries }) : `sin-guia:${a.id}`;

function agrupar(filas: readonly AsientoDeIngreso[], nombreDe: (a: AsientoDeIngreso) => string, top: number): FilaPorGuia[] {
  const grupos = new Map<string, { nombre: string; guias: Set<string>; m3: number }>();
  for (const a of filas) {
    const nombre = nombreDe(a);
    const g = grupos.get(nombre.toLowerCase()) ?? { nombre, guias: new Set<string>(), m3: 0 };
    g.guias.add(guiaDe(a));
    g.m3 += Number(a.volumeM3 ?? 0);
    grupos.set(nombre.toLowerCase(), g);
  }
  return [...grupos.values()]
    .map((g) => ({ nombre: g.nombre, cantidad: g.guias.size, m3: r4(g.m3) }))
    .sort((a, b) => b.m3 - a.m3 || b.cantidad - a.cantidad)
    .slice(0, top);
}

export function resumirIngresosPorGuia(
  filas: readonly AsientoDeIngreso[],
  recibidos: ReadonlySet<string>,
  top = 5,
): IngresosPorGuia {
  const guias = new Map<string, { recibida: boolean; servicio: boolean }>();
  let m3 = 0;
  for (const a of filas) {
    const k = guiaDe(a);
    const g = guias.get(k) ?? { recibida: true, servicio: false };
    if (!recibidos.has(a.id)) g.recibida = false;
    if (a.maderaDeTercero) g.servicio = true;
    guias.set(k, g);
    m3 += Number(a.volumeM3 ?? 0);
  }
  const lista = [...guias.values()];
  return {
    guias: lista.length,
    m3: r4(m3),
    porRecibir: lista.filter((g) => !g.recibida).length,
    deServicio: lista.filter((g) => g.servicio).length,
    porEspecie: agrupar(filas, (a) => a.speciesCommonName?.trim() || "Sin especie", top),
    porProveedor: agrupar(filas, (a) => a.providerName?.trim() || "Sin proveedor", top),
  };
}
