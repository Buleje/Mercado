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
}

export interface ResumenGuias {
  total: number;
  completas: number;
  incompletas: number;
  anuladas: number;
  /** Emitidas sin verificar contra SERFOR: lo primero que revisa un control. */
  sinVerificar: number;
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
      };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.lineNo ?? 0) - (a.lineNo ?? 0));
}

export function resumirGuias(guias: GuiaEmitida[]): ResumenGuias {
  let completas = 0;
  let incompletas = 0;
  let anuladas = 0;
  let sinVerificar = 0;
  for (const g of guias) {
    if (g.estado === "anulada") anuladas += 1;
    else if (g.estado === "completa") completas += 1;
    else incompletas += 1;
    if (g.estado !== "anulada" && !g.verificada) sinVerificar += 1;
  }
  return { total: guias.length, completas, incompletas, anuladas, sinVerificar };
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
