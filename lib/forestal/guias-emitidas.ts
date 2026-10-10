/**
 * guias-emitidas — las GTF de salida que emitió el CTP, todas juntas (ADR-321).
 *
 * ## Por qué existe
 *
 * La guía de salida vive dentro de su despacho: para reimprimir una hay que
 * acordarse de qué línea era, abrirla y desplegar la sección. Eso alcanza
 * cuando se acaba de emitir; no alcanza cuando el fiscalizador pide *"las guías
 * de julio"*, cuando el chofer perdió el original, o cuando hay que saber
 * cuántas quedaron a medio llenar.
 *
 * `CtpGuiasBandeja` es la bandeja del otro lado (guías del monte que todavía no
 * ingresaron al CTP). Ésta es la de salida. **No se reemplazan.**
 *
 * ## Se deriva, no se guarda
 *
 * No hay tabla nueva: una guía emitida ES un despacho con `gtfNumber`. Guardar
 * una copia crearía dos verdades sobre el mismo documento, que es exactamente lo
 * que el libro evita en todos lados.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { faltantesGtf, leerGtfDatos } from "./ctp-gtf-datos";
import { claveNumeroGtf } from "./gtf-talonario";

/** Un despacho, como llega del libro. */
export type FilaDespachoGuia = {
  id: string;
  lineNo: number | null;
  entryDate: string;
  gtfNumber: string | null;
  docType: string | null;
  destino: string | null;
  productType: string | null;
  speciesCommon: string | null;
  quantity: number | null;
  unit: string | null;
  status: string;
  /** JSON crudo de `gtfDatos`: se lee con desconfianza. */
  gtfDatos: unknown;
  serforNumeroRegistro: string | null;
  serforVerificadoEn: string | null;
  /** Cuánto del despacho tiene corrida de origen declarada (lo agrega `list`). */
  atribuidoQty?: number;
};

export type EstadoGuia = "completa" | "incompleta" | "anulada";

export interface GuiaEmitida {
  despachoId: string;
  lineNo: number | null;
  fecha: string;
  gtfNumber: string;
  docType: string;
  destino: string | null;
  producto: string | null;
  especie: string | null;
  cantidad: number | null;
  unidad: string | null;
  estado: EstadoGuia;
  /** Cuántos datos le faltan para poder imprimirse. 0 = lista. */
  faltan: number;
  /** Quién la recibe, según los datos cargados. */
  destinatario: string | null;
  placa: string | null;
  /** Se verificó contra el SNIFFS de SERFOR (ADR-312). */
  verificada: boolean;
  /**
   * Cuánto de lo que ampara esta guía NO tiene corrida de origen declarada.
   *
   * Es distinto de `faltan`, que cuenta CAMPOS del documento: una guía puede
   * estar perfectamente llena y amparar madera cuyo origen todavía no se
   * declaró. Un documento ya entregado en esa situación es el que más caro
   * sale, y hasta ahora esta bandeja no podía verlo — el tipo de fila era una
   * whitelist y el dato se perdía en el camino.
   */
  sinOrigen: number;
}

export interface ResumenGuias {
  total: number;
  completas: number;
  incompletas: number;
  anuladas: number;
  /** Emitidas sin verificar contra SERFOR: lo primero que revisa un control. */
  sinVerificar: number;
  /** Guías vigentes que amparan madera sin corrida de origen declarada. */
  sinOrigen: number;
}

/**
 * Convierte los despachos en guías. **Sólo los que tienen número**: un despacho
 * sin GTF todavía no emitió nada y aparecer acá lo haría parecer un documento.
 */
export function guiasDeDespachos(filas: FilaDespachoGuia[]): GuiaEmitida[] {
  return filas
    .filter((f) => (f.gtfNumber ?? "").trim().length > 0)
    .map((f) => {
      const datos = leerGtfDatos(f.gtfDatos);
      const faltan = faltantesGtf(datos).length;
      const anulada = f.status !== "registrado";
      return {
        despachoId: f.id,
        lineNo: f.lineNo,
        fecha: f.entryDate,
        gtfNumber: (f.gtfNumber ?? "").trim(),
        docType: f.docType?.trim() || "GTF",
        destino: f.destino,
        producto: f.productType,
        especie: f.speciesCommon,
        cantidad: f.quantity,
        unidad: f.unit,
        // Una guía anulada no es "incompleta": es un documento que ya no vale, y
        // mezclarla con las que falta llenar haría perseguir un fantasma.
        estado: (anulada ? "anulada" : faltan === 0 ? "completa" : "incompleta") as EstadoGuia,
        faltan: anulada ? 0 : faltan,
        destinatario: datos.destinatario.nombre.trim() || null,
        placa: datos.vehiculo.placa.trim() || null,
        verificada: Boolean(f.serforNumeroRegistro && f.serforVerificadoEn),
        // Una guía anulada no ampara nada: perseguir su origen sería perseguir
        // un fantasma, igual que con `faltan`.
        sinOrigen: anulada ? 0 : Math.max(0, Number(((f.quantity ?? 0) - (f.atribuidoQty ?? 0)).toFixed(4))),
      };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.lineNo ?? 0) - (a.lineNo ?? 0));
}

export function resumirGuias(guias: GuiaEmitida[]): ResumenGuias {
  let completas = 0;
  let incompletas = 0;
  let anuladas = 0;
  let sinVerificar = 0;
  let sinOrigen = 0;
  for (const g of guias) {
    if (g.estado === "anulada") anuladas += 1;
    else if (g.estado === "completa") completas += 1;
    else incompletas += 1;
    if (g.estado !== "anulada" && !g.verificada) sinVerificar += 1;
    // La misma tolerancia que el resto del libro: el redondeo de SERFOR.
    if (g.sinOrigen > 0.001) sinOrigen += 1;
  }
  return { total: guias.length, completas, incompletas, anuladas, sinVerificar, sinOrigen };
}

/** Filtra por número, destino, destinatario o placa — sin tildes ni mayúsculas. */
export function filtrarGuias(guias: GuiaEmitida[], q: string): GuiaEmitida[] {
  const k = q
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!k) return guias;
  const tiene = (v: string | null) =>
    (v ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .includes(k);
  return guias.filter((g) => tiene(g.gtfNumber) || tiene(g.destino) || tiene(g.destinatario) || tiene(g.placa));
}

/**
 * Duplicados: el mismo número de guía en dos despachos vigentes.
 *
 * Puede ser legítimo —una guía que ampara varias líneas— pero también es como se
 * ve un error de tipeo que rompe la cadena. Se informa; no se bloquea.
 */
export function numerosRepetidos(guias: GuiaEmitida[]): string[] {
  const cuenta = new Map<string, number>();
  for (const g of guias) {
    if (g.estado === "anulada") continue;
    cuenta.set(g.gtfNumber, (cuenta.get(g.gtfNumber) ?? 0) + 1);
  }
  return [...cuenta.entries()].filter(([, n]) => n > 1).map(([n]) => n);
}

/** Lo que amparan las guías elegidas, por unidad. */
export interface CantidadPorUnidad {
  unidad: string;
  total: number;
}

/** Orden de las unidades del negocio: PT → m³ → unidades → kg; otra, al final. */
const ORDEN_UNIDAD = ["pt", "m3", "unidad", "kg"];

/**
 * Cuánto amparan las guías VIGENTES, sumado por unidad (vista previa de la
 * barra de selección: lo que se declara lo arma el trámite). Una anulada no
 * ampara nada. Pie tablar y m³ no se mezclan: convertir sería un derivado.
 */
export function cantidadesPorUnidad(guias: readonly GuiaEmitida[]): CantidadPorUnidad[] {
  const m = new Map<string, number>();
  for (const g of guias) {
    if (g.estado === "anulada" || g.cantidad == null || !Number.isFinite(g.cantidad)) continue;
    const u = (g.unidad ?? "").trim().toLowerCase().replace("³", "3") || "sin unidad";
    m.set(u, (m.get(u) ?? 0) + g.cantidad);
  }
  const rango = (u: string) => (ORDEN_UNIDAD.includes(u) ? ORDEN_UNIDAD.indexOf(u) : ORDEN_UNIDAD.length);
  return [...m.entries()]
    .map(([unidad, total]) => ({ unidad, total: Number(total.toFixed(4)) }))
    .sort((a, b) => rango(a.unidad) - rango(b.unidad) || a.unidad.localeCompare(b.unidad));
}

/**
 * La llave de UNA guía en «Guías emitidas»: su N° (`claveNumeroGtf`) y si
 * está anulada. La lista muestra una fila por LÍNEA de despacho, pero se elige
 * la guía entera (08-10): con una línea de una guía de dos, el trámite
 * declaraba la mitad de la carga. Una línea anulada del mismo N° (se anuló
 * para corregirla y se volvió a registrar) es otro registro y va aparte.
 */
export function claveDeGuia(g: Pick<GuiaEmitida, "gtfNumber" | "estado">): string {
  return `${claveNumeroGtf(g.gtfNumber) ?? g.gtfNumber.trim()}|${g.estado === "anulada" ? "a" : "v"}`;
}

/** Los ids de TODAS las líneas de cada guía (`claveDeGuia` → `despachoId`s). */
export function lineasPorGuia(guias: readonly GuiaEmitida[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const g of guias) {
    const k = claveDeGuia(g);
    m.set(k, [...(m.get(k) ?? []), g.despachoId]);
  }
  return m;
}

/** Las líneas elegidas, agrupadas por guía (en el orden en que aparece cada una). */
export function agruparPorGuia(lineas: readonly GuiaEmitida[]): { gtfNumber: string; anulada: boolean; lineas: GuiaEmitida[] }[] {
  const m = new Map<string, { gtfNumber: string; anulada: boolean; lineas: GuiaEmitida[] }>();
  for (const g of lineas) {
    const k = claveDeGuia(g);
    const ya = m.get(k);
    if (ya) ya.lineas.push(g);
    else m.set(k, { gtfNumber: g.gtfNumber, anulada: g.estado === "anulada", lineas: [g] });
  }
  return [...m.values()];
}
