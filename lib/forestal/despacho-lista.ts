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
  /**
   * Corrida de producción de la que sale — es la atribución del despacho (I4).
   * Vacío en las filas que son una TROZA que sale sin aserrar (ADR-363): esas
   * no vienen de ninguna corrida, su origen es el ingreso.
   */
  corridaId: string;
  /** La pieza que sale entera, cuando la fila es una troza sin aserrar. */
  trozaId?: string | null;
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
  /**
   * En cuánto se vendió esta línea. `null` = todavía no se sabe (la venta se
   * cierra después del camión más seguido de lo que parece), y se carga luego
   * desde Rentabilidad. Nunca 0 por defecto: un 0 diría "regalado".
   */
  valorVenta?: number | null;
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
  /* Las trozas no entran: no vienen de una corrida y su techo es la pieza
     misma. Agruparlas por `corridaId: ""` compararía la suma de todas contra el
     volumen de la primera — un rojo falso en cuanto se eligen dos. */
  const deCorridas = filas.filter((f) => !f.trozaId && f.corridaId);
  const pedidos = volumenPorCorrida(deCorridas);
  const excesos: ExcesoCorrida[] = [];
  for (const [corridaId, pedido] of pedidos) {
    const fila = deCorridas.find((f) => f.corridaId === corridaId);
    if (!fila) continue;
    if (pedido - fila.disponibleCorrida > TOLERANCIA_M3) {
      excesos.push({ corridaId, lineNo: fila.lineNo, pedido, disponible: fila.disponibleCorrida });
    }
  }
  return excesos;
}

/** Una troza a la que se le declara más volumen del que mide. */
export function trozasSobreDeclaradas(filas: readonly FilaDespacho[]): FilaDespacho[] {
  return filas.filter((f) => f.trozaId && f.volumen - f.disponibleCorrida > TOLERANCIA_M3);
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

  for (const t of trozasSobreDeclaradas(filas)) {
    problemas.push(
      `La troza ${rotuloDeFila(t)} mide ${t.disponibleCorrida.toFixed(4)} m³ y la lista declara ${t.volumen.toFixed(4)}.`,
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
    ...(fila.valorVenta != null ? { valorVenta: fila.valorVenta } : {}),
    ...(gtfDatos ? { gtfDatos } : {}),
  };
}

/** Etiqueta corta de una fila para los avisos («SAP-TAB-1 · Sapotillo»). */
export const rotuloDeFila = (f: FilaDespacho) =>
  [f.codigo, f.especie].filter(Boolean).join(" · ") || `Corrida #${f.lineNo ?? "?"}`;

/**
 * Las trozas de UNA especie, en una sola línea del libro (ADR-363).
 *
 * En la lista de la guía cada troza es un renglón —es lo que el operador eligió
 * y lo que la lista de trozas declara pieza por pieza—, pero el libro registra
 * la SALIDA: veinte líneas de una troza cada una para un solo camión sería un
 * libro ilegible. Las piezas quedan igual de identificadas: viajan en `trozas[]`
 * y cada una queda marcada con el despacho que se la llevó.
 */
function payloadDeTrozas(filas: readonly FilaDespacho[], comun: ComunDeGuia, gtfDatos?: unknown) {
  const primera = filas[0]!;
  return {
    section: "despacho" as const,
    entryDate: comun.entryDate,
    speciesCommon: (primera.especie ?? "").trim() || null,
    speciesScientific: (primera.especieCientifica ?? "").trim() || null,
    productType: (primera.producto ?? "").trim() || null,
    presentacion: (primera.presentacion ?? "").trim() || null,
    /* El código de UNA pieza no representa a veinte: con más de una, el
       casillero (9) queda vacío y las piezas se identifican en la lista. */
    codigoProducto: filas.length === 1 ? (primera.codigo ?? "").trim() || null : null,
    quantity: r4(filas.reduce((a, f) => a + f.volumen, 0)),
    unit: primera.unidad,
    pieces: filas.length,
    docType: comun.docType || null,
    gtfNumber: comun.gtfNumber.trim() || null,
    destino: comun.destino?.trim() || null,
    observations: comun.observations?.trim() || null,
    ...(comun.serforNumeroRegistro ? { serforNumeroRegistro: comun.serforNumeroRegistro } : {}),
    ...(comun.serforVerificadoEn ? { serforVerificadoEn: comun.serforVerificadoEn } : {}),
    // La cadena: las PIEZAS que se van enteras. El servidor valida T2 con lock.
    trozas: filas.map((f) => f.trozaId!).filter(Boolean),
    /* Varias trozas caen en UNA línea del libro, así que su venta es la suma.
       Pero sólo si TODAS tienen precio: sumar las que sí y omitir las que no
       daría un total que parece completo y no lo es —el mismo vicio que el
       COGS evita con `falta_costo`—. Con una sola sin precio, la línea nace
       sin valor y se completa después. */
    ...(filas.every((f) => f.valorVenta != null)
      ? { valorVenta: r4(filas.reduce((a, f) => a + (f.valorVenta ?? 0), 0)) }
      : {}),
    ...(gtfDatos ? { gtfDatos } : {}),
  };
}

/** Un envío: el cuerpo que va al servidor + qué filas de la lista representa. */
export interface EnvioDeLinea {
  payload: ReturnType<typeof payloadDeFila> | ReturnType<typeof payloadDeTrozas>;
  /** uids de las filas que entran en esta línea — para saber cuáles quedaron. */
  uids: string[];
  /** Cómo nombrarla en un aviso si falla. */
  rotulo: string;
}

/**
 * La lista, convertida en las líneas que van al libro.
 *
 * Producto transformado: una línea por renglón (cada uno tiene su corrida y su
 * atribución). Trozas sin aserrar: una línea por ESPECIE, con sus piezas.
 */
export function enviosDeLista(
  filas: readonly FilaDespacho[],
  comun: ComunDeGuia,
  gtfDatos?: unknown,
): EnvioDeLinea[] {
  const envios: EnvioDeLinea[] = filas
    .filter((f) => !f.trozaId)
    .map((f) => ({ payload: payloadDeFila(f, comun, gtfDatos), uids: [f.uid], rotulo: rotuloDeFila(f) }));

  const porEspecie = new Map<string, FilaDespacho[]>();
  for (const f of filas.filter((x) => x.trozaId)) {
    const clave = (f.especie ?? "").trim().toLowerCase() || "sin-especie";
    porEspecie.set(clave, [...(porEspecie.get(clave) ?? []), f]);
  }
  for (const grupo of porEspecie.values()) {
    envios.push({
      payload: payloadDeTrozas(grupo, comun, gtfDatos),
      uids: grupo.map((f) => f.uid),
      rotulo: `${grupo.length} troza${grupo.length === 1 ? "" : "s"} de ${grupo[0]!.especie ?? "sin especie"}`,
    });
  }
  return envios;
}

/** Un paquete tal como lo devuelve `?disponibles=1`. */
export interface PaqueteDisponible {
  id: string;
  codigo: string;
  producto: string | null;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
}

/** Una corrida con saldo, tal como la devuelve `?disponibles=1`. */
export interface CorridaDisponible {
  id: string;
  lineNo: number | null;
  fecha: string;
  especie: string | null;
  especieCientifica: string | null;
  cites?: boolean;
  producto: string | null;
  presentacion: string | null;
  unidad: string | null;
  lote: string | null;
  lineaProduccion: string | null;
  gtfOrigen?: string[];
  titularOrigen?: string[];
  disponible: number;
  paquetes: PaqueteDisponible[];
}

/**
 * De lo que devuelve `?disponibles=1` a las filas de una guía: una por paquete,
 * con su corrida al lado.
 *
 * Vive acá y no en el modal de stock porque tiene DOS consumidores: ese modal y
 * el despacho directo desde una cancha de reserva del mapa de planta. Es lo
 * único que sabe de paquetes, medidas y del techo de saldo — armar una fila a
 * mano deja una guía con las medidas en blanco y sin tope.
 */
export function filasDeCorridas(corridas: readonly CorridaDisponible[]): FilaDespacho[] {
  return corridas.flatMap((c): FilaDespacho[] => {
    const base = {
      corridaId: c.id,
      lineNo: c.lineNo,
      especie: c.especie,
      especieCientifica: c.especieCientifica,
      cites: c.cites ?? false,
      unidad: c.unidad ?? "m3",
      disponibleCorrida: c.disponible,
      gtfOrigen: c.gtfOrigen ?? [],
      titularOrigen: c.titularOrigen ?? [],
      lote: c.lote,
      linea: c.lineaProduccion,
      fechaProduccion: c.fecha,
    };
    /* Las corridas viejas no tienen paquetes cargados: entran como una fila con
       su saldo. Ocultarlas escondería producto que existe en la pila. */
    if (c.paquetes.length === 0) {
      return [{
        ...base,
        uid: uidDeFila(c.id, null),
        paqueteId: null,
        producto: c.producto,
        codigo: null,
        presentacion: c.presentacion,
        cantidad: 0,
        espesorCm: null, anchoCm: null, largoM: null,
        volumen: r4(c.disponible),
      }];
    }
    return c.paquetes.map((p) => ({
      ...base,
      uid: uidDeFila(c.id, p.id),
      paqueteId: p.id,
      producto: p.producto ?? c.producto,
      codigo: p.codigo,
      presentacion: p.presentacion ?? c.presentacion,
      cantidad: p.cantidad,
      espesorCm: p.espesorCm, anchoCm: p.anchoCm, largoM: p.largoM,
      /* Un paquete no puede sacar más de lo que le queda a su corrida: si ya
         salió parte, el tope es el saldo, no lo que el paquete pesó al nacer. */
      volumen: r4(Math.min(p.volumenM3, c.disponible)),
    }));
  });
}
