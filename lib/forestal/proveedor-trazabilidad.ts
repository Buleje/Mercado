/**
 * proveedor-trazabilidad — todo lo que entró de un titular, de punta a punta.
 *
 * ```
 *   GTF del proveedor  →  consumo  →  corridas  →  despachos
 *      (ingresó)          (se usó)   (se produjo)   (salió)
 * ```
 *
 * La pregunta que responde es la del fiscalizador y la del dueño a la vez:
 * *"de todo lo que me trajo este titular, ¿qué entró, qué se usó, qué salió y
 * cuánto rindió?"*. Hasta acá había que abrir Ingresos, filtrar por nombre y
 * sumar a ojo — y el nombre estaba escrito de tres formas distintas (por eso
 * primero hizo falta el directorio, ADR-317).
 *
 * ## Lo que NO hace
 *
 * No prorratea. Si una corrida consumió madera de dos proveedores, lo producido
 * **no se reparte** entre ellos: se informa como corrida compartida. Misma razón
 * por la que las invariantes usan `≤` y no `==` — un número inventado que parece
 * exacto es peor que uno declarado incompleto.
 *
 * Puro: recibe filas ya leídas, sin Prisma ni red.
 */

export type FilaIngresoProveedor = {
  woodEntryId: string;
  gtfNumber: string;
  serforNumeroRegistro: string | null;
  entryDate: string;
  especie: string;
  cites: boolean;
  originCode: string | null;
  /** m³ que declara el ingreso. */
  volumeM3: number;
  status: string;
  /** S/ de la factura del proveedor. `null` = todavía no llegó (ADR-134). */
  costoTotal: number | null;
};

export type FilaConsumoProveedor = {
  woodEntryId: string;
  produccionEntryId: string;
  volumeM3: number;
};

export type FilaCorridaProveedor = {
  produccionEntryId: string;
  lineNo: number | null;
  fecha: string;
  productType: string | null;
  especie: string | null;
  lineaProduccion: string | null;
  quantity: number;
  unit: string | null;
  /** Cuántos ingresos distintos alimentaron la corrida (>1 = compartida). */
  ingresosDistintos: number;
};

export type FilaDespachoProveedor = {
  despachoEntryId: string;
  produccionEntryId: string;
  lineNo: number | null;
  fecha: string;
  gtfNumber: string | null;
  destino: string | null;
  quantity: number;
};

export interface GuiaDelProveedor {
  woodEntryId: string;
  gtfNumber: string;
  serforNumeroRegistro: string | null;
  entryDate: string;
  especie: string;
  cites: boolean;
  originCode: string | null;
  volumeM3: number;
  consumidoM3: number;
  /** Lo que sigue en el patio de esa guía. Nunca negativo. */
  saldoM3: number;
  status: string;
  costoTotal: number | null;
}

export interface EspecieDelProveedor {
  especie: string;
  cites: boolean;
  guias: number;
  ingresadoM3: number;
  consumidoM3: number;
}

export interface TrazabilidadProveedor {
  guias: GuiaDelProveedor[];
  porEspecie: EspecieDelProveedor[];
  corridas: Array<FilaCorridaProveedor & { compartida: boolean; despachado: number }>;
  salidas: Array<{
    despachoEntryId: string;
    lineNo: number | null;
    fecha: string;
    gtfNumber: string | null;
    destino: string | null;
    cantidad: number;
    compartida: boolean;
  }>;
  balance: {
    guias: number;
    ingresadoM3: number;
    consumidoM3: number;
    /** Lo que sigue en el patio: ingresado − consumido. Nunca negativo. */
    enPatioM3: number;
    producido: number;
    despachado: number;
    /** producido / consumido en PORCENTAJE. `null` si no se consumió nada. */
    rendimientoPct: number | null;
    /** S/ de las facturas cargadas. `null` si NINGUNA llegó — nunca 0. */
    costoTotal: number | null;
    /** Cuántas guías siguen sin factura: sin esto el costo total engaña. */
    guiasSinCosto: number;
    /** m³ de las guías QUE SÍ tienen factura — el divisor honesto del S//m³. */
    volumenConCostoM3: number;
  };
  /** Lo que impide leer la cadena como completa. Vacío = trazable de punta a punta. */
  huecos: string[];
}

const r4 = (n: number) => Number(n.toFixed(4));
const r2 = (n: number) => Number(n.toFixed(2));

export function construirTrazabilidadProveedor(
  ingresos: FilaIngresoProveedor[],
  consumos: FilaConsumoProveedor[],
  corridas: FilaCorridaProveedor[],
  despachos: FilaDespachoProveedor[],
): TrazabilidadProveedor {
  // ── Guías: cuánto se consumió de cada una ────────────────────────────────
  const consumidoPorGuia = new Map<string, number>();
  for (const c of consumos) {
    consumidoPorGuia.set(c.woodEntryId, (consumidoPorGuia.get(c.woodEntryId) ?? 0) + c.volumeM3);
  }

  const guias: GuiaDelProveedor[] = ingresos
    .map((i) => {
      const consumidoM3 = r4(consumidoPorGuia.get(i.woodEntryId) ?? 0);
      return {
        woodEntryId: i.woodEntryId,
        gtfNumber: i.gtfNumber,
        serforNumeroRegistro: i.serforNumeroRegistro,
        entryDate: i.entryDate,
        especie: i.especie,
        cites: i.cites,
        originCode: i.originCode,
        volumeM3: r4(i.volumeM3),
        consumidoM3,
        // Nunca negativo: si el consumo excede lo declarado, es un hueco que se
        // reporta aparte, no un saldo en rojo que se arrastra a los totales.
        saldoM3: r4(Math.max(0, i.volumeM3 - consumidoM3)),
        status: i.status,
        costoTotal: i.costoTotal,
      };
    })
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate));

  // ── Por especie ──────────────────────────────────────────────────────────
  const mapaEspecie = new Map<string, EspecieDelProveedor>();
  for (const g of guias) {
    const clave = g.especie || "—";
    const actual = mapaEspecie.get(clave) ?? {
      especie: clave,
      cites: g.cites,
      guias: 0,
      ingresadoM3: 0,
      consumidoM3: 0,
    };
    actual.guias += 1;
    actual.ingresadoM3 += g.volumeM3;
    actual.consumidoM3 += g.consumidoM3;
    actual.cites = actual.cites || g.cites;
    mapaEspecie.set(clave, actual);
  }
  const porEspecie = [...mapaEspecie.values()]
    .map((e) => ({ ...e, ingresadoM3: r4(e.ingresadoM3), consumidoM3: r4(e.consumidoM3) }))
    .sort((a, b) => b.ingresadoM3 - a.ingresadoM3);

  // ── Corridas alimentadas por este proveedor ──────────────────────────────
  const despachadoPorCorrida = new Map<string, number>();
  for (const d of despachos) {
    despachadoPorCorrida.set(d.produccionEntryId, (despachadoPorCorrida.get(d.produccionEntryId) ?? 0) + d.quantity);
  }

  const corridasVista = corridas
    .map((c) => ({
      ...c,
      quantity: r4(c.quantity),
      // Más de un ingreso alimentando la corrida = lo producido no es todo de
      // este proveedor y no hay dato para separarlo.
      compartida: c.ingresosDistintos > 1,
      despachado: r4(despachadoPorCorrida.get(c.produccionEntryId) ?? 0),
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const compartidas = new Set(corridasVista.filter((c) => c.compartida).map((c) => c.produccionEntryId));

  const salidas = despachos
    .map((d) => ({
      despachoEntryId: d.despachoEntryId,
      lineNo: d.lineNo,
      fecha: d.fecha,
      gtfNumber: d.gtfNumber,
      destino: d.destino,
      cantidad: r4(d.quantity),
      compartida: compartidas.has(d.produccionEntryId),
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  // ── Balance ──────────────────────────────────────────────────────────────
  const ingresadoM3 = r4(guias.reduce((a, g) => a + g.volumeM3, 0));
  const consumidoM3 = r4(guias.reduce((a, g) => a + g.consumidoM3, 0));
  const producido = r4(corridasVista.reduce((a, c) => a + c.quantity, 0));
  const despachado = r4(salidas.reduce((a, s) => a + s.cantidad, 0));

  const conCosto = guias.filter((g) => g.costoTotal != null);
  const costoTotal = conCosto.length ? r2(conCosto.reduce((a, g) => a + (g.costoTotal ?? 0), 0)) : null;
  const volumenConCostoM3 = r4(conCosto.reduce((a, g) => a + g.volumeM3, 0));

  const huecos: string[] = [];
  const sinGtf = guias.filter((g) => !g.gtfNumber).length;
  if (sinGtf > 0) huecos.push(`${sinGtf} ingreso(s) sin número de guía`);
  const excedidas = guias.filter((g) => g.consumidoM3 > g.volumeM3 + 1e-9).length;
  if (excedidas > 0) huecos.push(`${excedidas} guía(s) con más consumo que volumen declarado`);
  const compartidasN = corridasVista.filter((c) => c.compartida).length;
  if (compartidasN > 0) {
    huecos.push(`${compartidasN} corrida(s) mezclan madera de otros ingresos: lo producido no es todo de este titular`);
  }

  return {
    guias,
    porEspecie,
    corridas: corridasVista,
    salidas,
    balance: {
      guias: guias.length,
      ingresadoM3,
      consumidoM3,
      enPatioM3: r4(Math.max(0, ingresadoM3 - consumidoM3)),
      producido,
      despachado,
      // Sin consumo no hay rendimiento: `null`, no 0 — un 0 se lee como "rinde
      // pésimo" cuando en realidad todavía no se procesó nada.
      rendimientoPct: consumidoM3 > 0 ? Number(((producido / consumidoM3) * 100).toFixed(2)) : null,
      costoTotal,
      guiasSinCosto: guias.length - conCosto.length,
      volumenConCostoM3,
    },
    huecos,
  };
}

/**
 * S/ por m³ de lo que este titular facturó.
 *
 * Divide por el volumen de las guías **con factura**, no por todo lo ingresado:
 * si llegaron 100 m³ y sólo 30 tienen factura, dividir por 100 daría un precio
 * por m³ que nadie cobró — y se leería como "me vende barato".
 */
export function costoPorM3Proveedor(b: TrazabilidadProveedor["balance"]): number | null {
  if (b.costoTotal == null || b.volumenConCostoM3 <= 0) return null;
  return r2(b.costoTotal / b.volumenConCostoM3);
}
