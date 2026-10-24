/**
 * Lo que frena «Descontar la madera usada», en una línea por causa (Brandon,
 * 24-09: «mucho texto por todos lados»). Cada línea dice QUÉ pasó, a cuántas
 * corridas o trozas y DÓNDE se arregla; el detalle (qué N°, qué troza) va en el ⓘ.
 *
 * Nada de esto se firma: lo que no se puede vincular no tiene botón. Lo que se
 * arregla en Ingresos (la fecha de recepción de la guía, la fila de la que
 * cuelga una troza) se manda a Ingresos — este flujo no mueve datos de guía.
 *
 * PURO y client-safe.
 */

import { fmtM3 } from "./cubicacion-formato";
import type { GrupoAVincular, TrozaFuera } from "./vincular-desde-permiso";

export interface LineaDeFreno {
  clave: string;
  texto: string;
  /** Una línea por corrida o troza, para el ⓘ. */
  detalle: string[];
}

/** «23/09» de un AAAA-MM-DD. */
export const ddmm = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** «07-22/09», «28/08 al 05/09» o «07/09». */
export function rangoDeFechas(fechas: readonly string[]): string {
  const f = [...fechas].map((x) => x.slice(0, 10)).sort();
  if (f.length === 0) return "";
  const a = f[0]!;
  const b = f[f.length - 1]!;
  if (a === b) return ddmm(a);
  return a.slice(0, 7) === b.slice(0, 7) ? `${a.slice(8, 10)}-${ddmm(b)}` : `${ddmm(a)} al ${ddmm(b)}`;
}

const nTrozas = (n: number) => `${n} ${n === 1 ? "troza" : "trozas"}`;
const nCorridas = (n: number) => `${n} ${n === 1 ? "corrida" : "corridas"}`;
const nLinea = (n: number | null) => `N° ${n ?? "—"}`;
const detalleDeTroza = (t: TrozaFuera) => `${t.gtf ? `GTF ${t.gtf}` : "sin GTF"} · ${fmtM3(t.m3)} m³`;

export function lineasDeFreno(g: GrupoAVincular): LineaDeFreno[] {
  const lineas: LineaDeFreno[] = [];
  const porFecha = g.reparto.filter((r) => r.frena === "fecha");
  if (porFecha.length > 0) {
    const rango = rangoDeFechas(porFecha.map((r) => r.corrida.fecha));
    const todas = porFecha.length === g.corridas.length;
    const desde = g.trozasDesde ? ddmm(g.trozasDesde) : "—";
    lineas.push({
      clave: "fecha",
      texto: todas
        ? `Las trozas de ${g.especie} figuran recibidas el ${desde}, después de ${porFecha.length === 1 ? "esta corrida" : "estas corridas"} (${rango}). Corrige la fecha de recepción de la guía en Ingresos.`
        : `${nCorridas(porFecha.length)} (${rango}) no ${porFecha.length === 1 ? "puede" : "pueden"} salir de las trozas de ${g.especie}: figuran recibidas desde el ${desde}. Corrige la fecha de recepción de la guía en Ingresos.`,
      detalle: porFecha.map((r) => `${nLinea(r.corrida.lineNo)} · ${ddmm(r.corrida.fecha)} · ${fmtM3(r.corrida.producidoM3)} m³`),
    });
  }

  const seAcabo = g.reparto.filter((r) => r.frena === "se-acabo");
  if (g.reparto.some((r) => r.frena === "sin-trozas") && g.fuera.length === 0) {
    lineas.push({ clave: "sin-trozas", texto: `No hay trozas de ${g.especie} de este permiso en el patio.`, detalle: [] });
  }
  if (seAcabo.length > 0) {
    lineas.push({
      clave: "se-acabo",
      texto: `${nCorridas(seAcabo.length)} se ${seAcabo.length === 1 ? "queda" : "quedan"} sin madera: las trozas de ${g.especie} del permiso no alcanzan.`,
      detalle: seAcabo.map((r) => `${nLinea(r.corrida.lineNo)} · ${fmtM3(r.corrida.producidoM3)} m³`),
    });
  }

  for (const r of g.reparto.filter((x) => x.frena === "regla")) {
    lineas.push({ clave: `regla-${r.corrida.id}`, texto: `${nLinea(r.corrida.lineNo)}: ${r.mensaje ?? "no cuadra con estas trozas."}`, detalle: [] });
  }

  /* Trozas fuera, agrupadas por la fila de la que cuelgan. */
  const otraFila = new Map<string, TrozaFuera[]>();
  for (const t of g.fuera.filter((x) => x.motivo === "otra-fila")) {
    const k = t.especieFila ?? "otra especie";
    otraFila.set(k, [...(otraFila.get(k) ?? []), t]);
  }
  for (const [fila, ts] of otraFila) {
    lineas.push({
      clave: `otra-fila-${fila}`,
      texto: `${nTrozas(ts.length)} de ${g.especie} ${ts.length === 1 ? "está anotada" : "están anotadas"} en la fila de ${fila} de su guía: acomódalas con «Acomodar trozas» en Ingresos antes de descontarlas.`,
      detalle: ts.map(detalleDeTroza),
    });
  }
  const llenas = g.fuera.filter((x) => x.motivo === "fila-llena");
  if (llenas.length > 0) {
    const gtfs = [...new Set(llenas.map((t) => t.gtf).filter((x): x is string => !!x))];
    lineas.push({
      clave: "fila-llena",
      texto: `${nTrozas(llenas.length)} de ${g.especie} ${llenas.length === 1 ? "pasaría" : "pasarían"} lo que declara la fila de su guía${gtfs.length > 0 ? ` (GTF ${gtfs.join(", ")})` : ""}: cuádrala en Ingresos antes de descontarlas.`,
      detalle: llenas.map(detalleDeTroza),
    });
  }
  const otroPermiso = g.fuera.filter((x) => x.motivo === "otro-permiso");
  if (otroPermiso.length > 0) {
    lineas.push({
      clave: "otro-permiso",
      texto: `${nTrozas(otroPermiso.length)} de ${g.especie} ${otroPermiso.length === 1 ? "es" : "son"} de otro permiso: quedan fuera.`,
      detalle: otroPermiso.map(detalleDeTroza),
    });
  }
  return lineas;
}
