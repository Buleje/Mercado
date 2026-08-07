/**
 * despacho-lista — la «Creación de Lista de Productos» de la GTF de salida.
 *
 * Una guía de transporte ampara UN viaje con VARIOS productos: tres especies,
 * cinco paquetes, un total movilizado. El Libro CTP, en cambio, registra una
 * línea por producto (cada una con su especie, su cantidad y su atribución a la
 * corrida de la que salió — I4/I5). Este módulo es el puente entre las dos
 * formas de mirar lo mismo:
 *
 *   lista de productos  →  N líneas de despacho que comparten la misma guía
 *
 * Es PURO —sin React, sin fetch, sin Prisma— porque las cuentas que hace (el
 * total movilizado, el resumen por especie y, sobre todo, si lo elegido cabe en
 * el saldo de cada corrida) son las que después va a exigir el backend: mejor
 * decirlas antes de guardar que descubrirlas con media guía registrada.
 */

/**
 * Tolerancia de volumen, en m³.
 *
 * 0.0001 m³ = 100 cm³ es la precisión con la que el libro guarda los volúmenes
 * (Decimal 12,4). Por debajo de eso no hay diferencia física que declarar: son
 * los redondeos de dividir un paquete, no madera de más.
 */
export const TOLERANCIA_M3 = 0.0001;

/** Redondeo a la precisión del libro (4 decimales). */
export const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Una fila de la lista: un producto concreto que va a viajar en esta guía. */
export interface FilaDespacho {
  /** Clave estable de la fila (corrida + paquete). No viaja al servidor. */
  uid: string;
  /** Corrida de producción de la que sale — es la atribución del despacho (I4). */
  corridaId: string;
  /** N° de línea de esa corrida en el libro, para poder nombrarla. */
  lineNo: number | null;
  /** Paquete concreto, si la corrida los tiene cargados (ADR-349). */
  paqueteId: string | null;
  especie: string | null;
  especieCientifica: string | null;
  /** Especie CITES: la guía la marca (es legal CON permiso, no una infracción). */
  cites: boolean;
  producto: string | null;
  /** Código del paquete: es por el que pregunta el comprador y el que viaja en la guía. */
  codigo: string | null;
  presentacion: string | null;
  /** Piezas que salen (el «Cantidad» del formato). */
  cantidad: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
  /** Volumen que sale — es lo que se despacha y lo que se atribuye a la corrida. */
  volumen: number;
  /** m3 | kg | pt | unidad. Lo fija la corrida: el libro no mezcla unidades. */
  unidad: string;
  /** Saldo de la corrida al momento de elegirla: el techo de lo que puede salir. */
  disponibleCorrida: number;
  // ── Contexto de origen (se muestra en la lista, no se guarda en la línea) ──
  gtfOrigen: string[];
  titularOrigen: string[];
  lote: string | null;
  linea: string | null;
  fechaProduccion: string | null;
}

/** Identificador estable de una fila: la misma corrida + el mismo paquete. */
export const uidDeFila = (corridaId: string, paqueteId: string | null) =>
  `${corridaId}:${paqueteId ?? "corrida"}`;

/** Volumen total movilizado por la guía. */
export const volumenTotal = (filas: readonly FilaDespacho[]) =>
  r4(filas.reduce((a, f) => a + (Number.isFinite(f.volumen) ? f.volumen : 0), 0));

/** Piezas totales — el otro número que el control cuenta en la tolva. */
export const piezasTotales = (filas: readonly FilaDespacho[]) =>
  filas.reduce((a, f) => a + (Number.isFinite(f.cantidad) ? f.cantidad : 0), 0);

/** Fila del cuadro resumen: una por especie + producto, como el formato. */
export interface ResumenLinea {
  especie: string;
  producto: string;
  cantidad: number;
  volumen: number;
}

/**
 * El resumen de abajo del formato: especie · producto · cantidad · volumen.
 * Agrupa por especie Y producto porque es lo que declara la guía — dos tablas
 * de la misma especie con distinto producto son dos renglones distintos.
 */
export function resumenPorProducto(filas: readonly FilaDespacho[]): ResumenLinea[] {
  const mapa = new Map<string, ResumenLinea>();
  for (const f of filas) {
    const especie = (f.especie ?? "").trim() || "Sin especie";
    const producto = (f.producto ?? "").trim() || "Sin producto";
    const clave = `${especie.toLowerCase()}|${producto.toLowerCase()}`;
    const previa = mapa.get(clave);
    if (previa) {
      previa.cantidad += f.cantidad;
      previa.volumen = r4(previa.volumen + f.volumen);
    } else {
      mapa.set(clave, { especie, producto, cantidad: f.cantidad, volumen: r4(f.volumen) });
    }
  }
  return [...mapa.values()].sort((a, b) => a.especie.localeCompare(b.especie, "es") || a.producto.localeCompare(b.producto, "es"));
}

/** Cuánto se le está pidiendo a cada corrida sumando TODAS sus filas. */
export function volumenPorCorrida(filas: readonly FilaDespacho[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const f of filas) mapa.set(f.corridaId, r4((mapa.get(f.corridaId) ?? 0) + f.volumen));
  return mapa;
}

/** Una corrida a la que se le pide más de lo que le queda (rompería I5). */
export interface ExcesoCorrida {
  corridaId: string;
  lineNo: number | null;
  pedido: number;
  disponible: number;
}

/**
 * Las corridas sobre-atribuidas.
 *
 * Dos paquetes de la misma corrida se registran como dos líneas, pero el saldo
 * es UNO: el backend suma las atribuciones vivas y rechaza el conjunto. Sin este
 * chequeo, la primera línea entra y la segunda falla — media guía registrada.
 */
export function excesosDeCorrida(filas: readonly FilaDespacho[]): ExcesoCorrida[] {
  const pedidos = volumenPorCorrida(filas);
  const excesos: ExcesoCorrida[] = [];
  for (const [corridaId, pedido] of pedidos) {
    const fila = filas.find((f) => f.corridaId === corridaId);
    if (!fila) continue;
    if (pedido - fila.disponibleCorrida > TOLERANCIA_M3) {
      excesos.push({ corridaId, lineNo: fila.lineNo, pedido, disponible: fila.disponibleCorrida });
    }
  }
  return excesos;
}

/**
 * Qué le impide a la lista convertirse en despacho, con nombre y apellido.
 * Devuelve frases listas para mostrar: «faltan datos» obliga a buscar a ojo.
 */
export function problemasDeLista(filas: readonly FilaDespacho[]): string[] {
  const problemas: string[] = [];
  if (filas.length === 0) return ["Agregá al menos un producto a la lista."];

  const sinVolumen = filas.filter((f) => !(f.volumen > 0));
  if (sinVolumen.length > 0) {
    problemas.push(
      `${sinVolumen.length === 1 ? "Un producto no tiene volumen" : `${sinVolumen.length} productos no tienen volumen`}: sin volumen no hay nada que movilizar.`,
    );
  }

  for (const e of excesosDeCorrida(filas)) {
    problemas.push(
      `La corrida ${e.lineNo != null ? `#${e.lineNo}` : ""} tiene ${e.disponible.toFixed(4)} disponibles y la lista le pide ${e.pedido.toFixed(4)}.`.replace("  ", " "),
    );
  }

  /* El libro guarda una unidad por línea; mezclarlas en una guía se puede
     (cada línea la suya), pero el TOTAL movilizado dejaría de ser sumable. */
  const unidades = new Set(filas.map((f) => f.unidad));
  if (unidades.size > 1) {
    problemas.push(`La lista mezcla unidades (${[...unidades].join(", ")}): el volumen total no se puede sumar.`);
  }
  return problemas;
}

/** Lo que comparten todas las líneas de una misma guía. */
export interface ComunDeGuia {
  entryDate: string;
  docType: string;
  gtfNumber: string;
  destino: string | null;
  observations: string | null;
  serforNumeroRegistro?: string | null;
  serforVerificadoEn?: string | null;
}

/**
 * La fila, traducida a lo que espera `POST /api/admin/forestal/ctp`.
 *
 * `quantity` es el VOLUMEN y `pieces` la cantidad de piezas: en el libro la
 * cantidad de una línea de despacho se mide en su unidad (m³), y las piezas son
 * el conteo físico. Invertirlos declararía 123 m³ donde hay 123 tablas.
 */
export function payloadDeFila(fila: FilaDespacho, comun: ComunDeGuia, gtfDatos?: unknown) {
  return {
    section: "despacho" as const,
    entryDate: comun.entryDate,
    speciesCommon: (fila.especie ?? "").trim() || null,
    speciesScientific: (fila.especieCientifica ?? "").trim() || null,
    productType: (fila.producto ?? "").trim() || null,
    presentacion: (fila.presentacion ?? "").trim() || null,
    codigoProducto: (fila.codigo ?? "").trim() || null,
    quantity: r4(fila.volumen),
    unit: fila.unidad,
    pieces: fila.cantidad > 0 ? Math.round(fila.cantidad) : null,
    docType: comun.docType || null,
    gtfNumber: comun.gtfNumber.trim() || null,
    destino: comun.destino?.trim() || null,
    observations: comun.observations?.trim() || null,
    ...(comun.serforNumeroRegistro ? { serforNumeroRegistro: comun.serforNumeroRegistro } : {}),
    ...(comun.serforVerificadoEn ? { serforVerificadoEn: comun.serforVerificadoEn } : {}),
    // La cadena de custodia: de qué corrida sale ESTE producto (ADR-135, I4/I5).
    origenes: [{ produccionEntryId: fila.corridaId, quantity: r4(fila.volumen) }],
    ...(gtfDatos ? { gtfDatos } : {}),
  };
}

/** Etiqueta corta de una fila para los avisos («SAP-TAB-1 · Sapotillo»). */
export const rotuloDeFila = (f: FilaDespacho) =>
  [f.codigo, f.especie].filter(Boolean).join(" · ") || `Corrida #${f.lineNo ?? "?"}`;
