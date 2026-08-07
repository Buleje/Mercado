/**
 * De la lista de productos al papel de la guía (ADR-362).
 *
 * El documento de salida (`ctp-gtf-print`) nació para UNA línea del libro: una
 * especie, una cantidad, un renglón en el casillero (37). Una guía real ampara
 * varias, y la hoja tiene que decirlas todas — es lo que un puesto de control
 * cuenta contra la carga.
 *
 * Acá se traduce la lista a las tres cosas que el documento necesita: el detalle
 * de productos, la cadena de custodia (de qué corridas y con qué GTF de ingreso
 * salió) y una cabecera que resuma la guía sin mentir cuando lleva varias
 * especies. PURO: sin React, sin fetch, sin Prisma.
 */

import type { LineaProducto } from "@/lib/forestal/ctp-gtf-formato";
import type { GtfCadena, GtfDespacho } from "@/lib/forestal/ctp-gtf-print";
import { piezasTotales, volumenTotal, type FilaDespacho } from "@/lib/forestal/despacho-lista";

const UNIDAD: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };

/** El detalle (37) del formato: un renglón por producto que viaja. */
export function lineasDeGuia(filas: readonly FilaDespacho[]): LineaProducto[] {
  return filas.map((f) => ({
    cientifico: f.especieCientifica ?? "",
    comun: f.especie ?? "",
    tipoProducto: f.producto ?? "",
    /* El formato pide la forma de presentación (PIEZAS, PAQUETES…). Si el
       paquete no la declara va la unidad, que es lo que el detalle mide. */
    presentacion: f.presentacion || (UNIDAD[f.unidad] ?? f.unidad),
    cantidad: f.cantidad,
    unidad: UNIDAD[f.unidad] ?? f.unidad,
    total: f.volumen,
  }));
}

/**
 * La cadena de custodia de la guía entera: cada corrida con lo que aporta y las
 * GTF con las que entró su materia prima. Dos renglones de la misma corrida se
 * suman — en el papel la corrida aparece una vez.
 */
export function cadenaDeGuia(filas: readonly FilaDespacho[]): GtfCadena {
  const porCorrida = new Map<string, { lineNo: number; quantity: number; guias: Set<string> }>();
  for (const f of filas) {
    const previa = porCorrida.get(f.corridaId);
    if (previa) {
      previa.quantity = Math.round((previa.quantity + f.volumen) * 10000) / 10000;
      for (const g of f.gtfOrigen) previa.guias.add(g);
    } else {
      porCorrida.set(f.corridaId, { lineNo: f.lineNo ?? 0, quantity: f.volumen, guias: new Set(f.gtfOrigen) });
    }
  }
  return {
    corridas: [...porCorrida.values()].map((c) => ({ lineNo: c.lineNo, quantity: c.quantity, guias: [...c.guias] })),
  };
}

/** Lo común de la guía que la cabecera del papel necesita. */
export interface CabeceraGuia {
  /** Id de una línea registrada — es el destino del QR de verificación. */
  id: string;
  lineNo: number;
  /** `YYYY-MM-DD` de emisión. */
  entryDate: string;
  gtfNumber: string;
  destino: string | null;
}

/**
 * El resumen de la guía para la cabecera del documento.
 *
 * Con una sola especie dice la especie; con varias dice **«Varias especies (N)»**
 * en vez de la primera — poner una sola cuando viajan tres es la clase de dato
 * que en un control se lee como declaración falsa.
 */
export function despachoDeGuia(filas: readonly FilaDespacho[], cab: CabeceraGuia): GtfDespacho {
  const especies = [...new Set(filas.map((f) => (f.especie ?? "").trim()).filter(Boolean))];
  const productos = [...new Set(filas.map((f) => (f.producto ?? "").trim()).filter(Boolean))];
  const unidad = filas[0]?.unidad ?? "m3";
  return {
    id: cab.id,
    lineNo: cab.lineNo,
    entryDate: cab.entryDate,
    speciesCommon: especies.length === 1 ? especies[0]! : especies.length > 1 ? `Varias especies (${especies.length})` : null,
    /* El nombre científico sólo tiene sentido con UNA especie: el detalle (37)
       lleva el de cada renglón. */
    speciesScientific: especies.length === 1 ? (filas[0]?.especieCientifica ?? null) : null,
    cites: filas.some((f) => f.cites),
    productType: productos.length === 1 ? productos[0]! : productos.length > 1 ? `Varios productos (${productos.length})` : null,
    quantity: String(volumenTotal(filas)),
    unitLabel: UNIDAD[unidad] ?? unidad,
    pieces: piezasTotales(filas) || null,
    gtfNumber: cab.gtfNumber,
    destino: cab.destino,
  };
}
