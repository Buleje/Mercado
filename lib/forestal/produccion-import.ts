/**
 * produccion-import — cargar corridas de producción desde una planilla (ADR-323).
 *
 * ## Por qué existe
 *
 * `ctp-import` (ADR-138) importa **ingresos**. La producción se sigue tipeando
 * línea por línea, y un aserradero que corta todo el día genera decenas de
 * paquetes por turno: el que los anota en un cuaderno o en su propio Excel
 * termina cargándolos tarde —fuera del plazo de 2 días hábiles— o no
 * cargándolos.
 *
 * ## ⚠️ Lo que este parser NO hace: atribuir origen
 *
 * Una corrida importada entra **sin consumos**. Podría parecer un hueco, y lo
 * es — pero es un hueco DECLARADO, que es la política del libro: se admite
 * guardar sin atribución completa y se bloquea sólo el certificado
 * (`trazabilidadCompleta()`). Adivinar de qué ingreso salió cada paquete sería
 * fabricar la trazabilidad que las invariantes I1-I2 existen para proteger.
 *
 * El resultado informa cuántas corridas quedan sin origen, para que el operador
 * sepa qué le falta antes del cierre.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { aNumero, esFilaDeEncabezados as esEncabezadoGenerico, filasDesdeTexto } from "./trozas-import";

export interface CorridaImportada {
  /** Fila de la planilla (1-indexed) — para señalar el error contra el archivo. */
  fila: number;
  /** `YYYY-MM-DD`. */
  fecha: string;
  productType: string | null;
  presentacion: string | null;
  especie: string | null;
  cantidad: number;
  unit: string;
  /** LP (principal) · LRE (recuperación). Se normaliza; por defecto LP. */
  lineaProduccion: string;
  codigoRaiz: string | null;
  observaciones: string | null;
}

export interface ResultadoImportProduccion {
  corridas: CorridaImportada[];
  errores: Array<{ fila: number; motivo: string }>;
  avisos: string[];
  cantidadTotal: number;
}

const COLUMNAS: Record<string, string[]> = {
  fecha: ["fecha", "fechaproduccion", "dia", "fechacorrida"],
  productType: ["producto", "tipoproducto", "tipodeproducto"],
  presentacion: ["presentacion", "formadepresentacion", "forma"],
  especie: ["especie", "nombrecomun", "especiecomun"],
  cantidad: ["cantidad", "cant", "volumen", "produccion", "producido"],
  unit: ["unidad", "unidadmedida", "um"],
  linea: ["linea", "lineaproduccion", "lineadeproduccion"],
  codigo: ["codigo", "paquete", "codigopaquete", "lote", "codigoraiz"],
  observaciones: ["observaciones", "obs", "nota", "notas"],
};

const UNIDADES: Record<string, string> = {
  m3: "m3",
  // `clave()` deja "m³" en "m": la variante con superíndice llega así.
  m: "m3",
  metroscubicos: "m3",
  metrocubico: "m3",
  pt: "pt",
  pietablar: "pt",
  piestablares: "pt",
  kg: "kg",
  kilos: "kg",
  unidad: "unidad",
  unidades: "unidad",
  und: "unidad",
};

function clave(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Línea de producción normalizada. El formato oficial usa **LP** (principal) y
 * **LRE** (recuperación); las planillas del aserradero escriben "principal",
 * "recuperación", "LR"… Todo lo que no se reconoce cae en LP y se avisa: una
 * línea mal clasificada descuadra el Cuadro Resumen 3 del LO-CTP.
 */
export function normalizarLinea(v: string | null | undefined): { linea: string; reconocida: boolean } {
  const k = clave(v ?? "");
  if (!k) return { linea: "LP", reconocida: true };
  if (["lp", "principal", "lineaprincipal"].includes(k)) return { linea: "LP", reconocida: true };
  if (["lre", "lr", "recuperacion", "lineaderecuperacion", "linearecuperacion"].includes(k)) {
    return { linea: "LRE", reconocida: true };
  }
  return { linea: "LP", reconocida: false };
}

/** `DD/MM/AAAA`, `AAAA-MM-DD` o un serial de Excel → `YYYY-MM-DD`. `null` si no se puede. */
export function normalizarFecha(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const anio = y!.length === 2 ? `20${y}` : y!;
    return `${anio}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  // Serial de Excel (días desde 1899-12-30). Sólo en rango razonable: un
  // "45000" suelto en otra columna no debe convertirse en fecha.
  const n = Number(t);
  if (Number.isFinite(n) && n > 20000 && n < 60000) {
    const ms = Math.round((n - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

const ORDEN_POSICIONAL = ["fecha", "productType", "especie", "cantidad", "unit", "codigo"] as const;

function mapear(encabezados: string[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  encabezados.forEach((celda, i) => {
    const k = clave(celda);
    for (const [campo, alias] of Object.entries(COLUMNAS)) {
      if (mapa[campo] === undefined && alias.includes(k)) mapa[campo] = i;
    }
  });
  return mapa;
}

/** ¿La primera fila son encabezados de producción? */
export function esEncabezadoProduccion(fila: string[]): boolean {
  const todos = Object.values(COLUMNAS).flat();
  return fila.filter((c) => todos.includes(clave(c))).length >= 2 || esEncabezadoGenerico(fila);
}

const r4 = (n: number) => Number(n.toFixed(4));

/**
 * Interpreta la planilla como corridas de producción.
 *
 * `fechaPorDefecto` se usa cuando la planilla no trae columna de fecha: es el
 * caso del parte de turno, que se escribe para un día y no lo repite en cada
 * fila. Sin ella y sin columna, la fila se rechaza: una corrida sin fecha no
 * tiene período y rompería el cierre.
 */
export function interpretarProduccion(
  filas: string[][],
  opts: { fechaPorDefecto?: string | null; especiePorDefecto?: string | null; unidadPorDefecto?: string } = {},
): ResultadoImportProduccion {
  const errores: ResultadoImportProduccion["errores"] = [];
  const avisos: string[] = [];
  const corridas: CorridaImportada[] = [];

  if (filas.length === 0) {
    return { corridas, errores, avisos: ["No se encontró ninguna fila."], cantidadTotal: 0 };
  }

  const conEncabezado = esEncabezadoProduccion(filas[0]!);
  const mapa = conEncabezado ? mapear(filas[0]!) : {};
  const cuerpo = conEncabezado ? filas.slice(1) : filas;
  if (!conEncabezado) {
    avisos.push("La planilla no trae encabezados: se leyó por posición (fecha · producto · especie · cantidad · unidad · código).");
  }

  const celda = (fila: string[], campo: string): string => {
    if (conEncabezado) {
      const i = mapa[campo];
      return i === undefined ? "" : (fila[i] ?? "");
    }
    const i = (ORDEN_POSICIONAL as readonly string[]).indexOf(campo);
    return i < 0 ? "" : (fila[i] ?? "");
  };

  let lineasNoReconocidas = 0;

  cuerpo.forEach((fila, idx) => {
    const nroFila = idx + (conEncabezado ? 2 : 1);
    if (fila.filter(Boolean).length < 2) {
      errores.push({ fila: nroFila, motivo: "La fila no tiene datos suficientes" });
      return;
    }

    const fecha = normalizarFecha(celda(fila, "fecha")) ?? opts.fechaPorDefecto ?? null;
    if (!fecha) {
      errores.push({ fila: nroFila, motivo: "Sin fecha: una corrida sin fecha no tiene período y rompería el cierre" });
      return;
    }

    const cantidad = aNumero(celda(fila, "cantidad"));
    if (cantidad == null || cantidad <= 0) {
      errores.push({ fila: nroFila, motivo: "Sin cantidad producida (o en cero)" });
      return;
    }

    const { linea, reconocida } = normalizarLinea(celda(fila, "linea"));
    if (!reconocida) lineasNoReconocidas += 1;

    const unidadCruda = clave(celda(fila, "unit"));
    const unit = UNIDADES[unidadCruda] ?? opts.unidadPorDefecto ?? "m3";

    corridas.push({
      fila: nroFila,
      fecha,
      productType: celda(fila, "productType").trim() || null,
      presentacion: celda(fila, "presentacion").trim().toUpperCase() || null,
      especie: celda(fila, "especie").trim() || opts.especiePorDefecto || null,
      cantidad: r4(cantidad),
      unit,
      lineaProduccion: linea,
      codigoRaiz: celda(fila, "codigo").trim() || null,
      observaciones: celda(fila, "observaciones").trim() || null,
    });
  });

  if (lineasNoReconocidas > 0) {
    avisos.push(
      `${lineasNoReconocidas} fila(s) con una línea de producción que no se reconoció: quedaron como LP (principal). Revisalo — el Cuadro Resumen 3 del LO-CTP se presenta por línea.`,
    );
  }
  if (corridas.length > 0) {
    // El hueco se DECLARA, no se adivina (ver el encabezado del módulo).
    avisos.push(
      `Las ${corridas.length} corrida(s) entran sin origen atribuido: hay que decir de qué ingresos salieron antes de certificar.`,
    );
  }

  return {
    corridas,
    errores,
    avisos,
    cantidadTotal: r4(corridas.reduce((a, c) => a + c.cantidad, 0)),
  };
}

/** Re-export para que el consumidor no tenga que importar de dos módulos. */
export { filasDesdeTexto };
