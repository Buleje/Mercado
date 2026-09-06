/**
 * La cadena de custodia de un lote, de punta a punta (ADR-315).
 *
 * ```
 *   GTF de ingreso  →  corridas del lote  →  despachos
 *     (consumido)         (producido)        (despachado)
 * ```
 *
 * Buleje ya tenía las tres piezas —`ForestCtpConsumo`, `ForestProdLoteMiembro`,
 * `ForestCtpDespachoOrigen`— pero no la vista que las recorre. La pregunta de un
 * fiscalizador de OSINFOR es exactamente ésa: *"este lote, ¿de qué árbol salió y
 * a dónde fue?"*, y hasta ahora había que armarla a mano abriendo tres pantallas.
 *
 * ## ⚠️ La atribución hacia adelante es PARCIAL cuando la corrida se comparte
 *
 * Un lote toma una parte de cada corrida (`miembro.quantity`) y un despacho toma
 * otra parte de la misma corrida (`origen.quantity`). Son **dos particiones
 * independientes del mismo producto**: si la corrida entró entera al lote, sus
 * despachos son del lote sin ambigüedad; si entró a medias, no hay dato que diga
 * qué mitad se despachó.
 *
 * Eso se informa (`compartida: true`) en vez de repartirlo a prorrata. Un número
 * inventado que parece exacto es peor que uno declarado incompleto — es
 * justamente lo que las invariantes I1-I5 evitan al usar `≤` y no `==`.
 *
 * Puro y sin red: recibe las filas ya leídas y no toca Prisma.
 */

import { PT_POR_M3 } from "./cubicacion";
import { RENDIMIENTO_REF_ASERRADA } from "./ctp-rendimiento";

export type FilaConsumo = {
  produccionEntryId: string;
  woodEntryId: string;
  volumeM3: number;
  gtfNumber: string;
  serforNumeroRegistro: string | null;
  especie: string;
  proveedor: string;
  originCode: string | null;
  entryDate: string;
};

export type FilaCorrida = {
  produccionEntryId: string;
  lineNo: number | null;
  fecha: string;
  productType: string | null;
  especie: string | null;
  lineaProduccion: string | null;
  /** Lo que produjo la corrida ENTERA. */
  quantity: number;
  /** Lo que de esa corrida pertenece a ESTE lote. */
  enElLote: number;
  unit: string | null;
};

export type FilaDespacho = {
  despachoEntryId: string;
  produccionEntryId: string;
  lineNo: number | null;
  fecha: string;
  gtfNumber: string | null;
  destino: string | null;
  /** Lo que ese despacho tomó de esa corrida. */
  quantity: number;
};

export type CadenaLote = {
  /** Hacia atrás: las guías que respaldan el lote, con lo consumido de cada una. */
  origen: Array<{
    woodEntryId: string;
    gtfNumber: string;
    serforNumeroRegistro: string | null;
    especie: string;
    proveedor: string;
    originCode: string | null;
    entryDate: string;
    consumidoM3: number;
    /** En cuántas corridas del lote entró esta guía. */
    corridas: number;
  }>;
  /** El lote en sí: sus corridas. */
  corridas: Array<FilaCorrida & { compartida: boolean }>;
  /** Hacia adelante: a dónde fue. */
  salidas: Array<{
    despachoEntryId: string;
    lineNo: number | null;
    fecha: string;
    gtfNumber: string | null;
    destino: string | null;
    cantidad: number;
    /** La corrida de origen no estaba entera en el lote: parte de esta salida
     *  puede no ser de este lote y no hay dato para separarla. */
    compartida: boolean;
  }>;
  balance: {
    consumidoM3: number;
    producido: number;
    /** Lo que el lote se lleva de sus corridas. */
    enElLote: number;
    despachado: number;
    /** Producido por el lote menos lo despachado. Nunca negativo. */
    enStock: number;
    /** producido / consumido, en PORCENTAJE. `null` si no hay consumo. */
    rendimientoPct: number | null;
  };
  /** Cuánto le falta al lote para llegar a la meta de rendimiento, por especie. */
  meta: MetaEspecie[];
  /** Lo que impide llamar completa a la cadena. Vacío = trazable de punta a punta. */
  huecos: string[];
};

/**
 * La cuenta que hace el jefe de planta con una calculadora: *"metí 40 m³ de
 * tornillo, al 56% tendrían que salir 22.4 — llevo 18, me faltan 4.4"*.
 *
 * Va en pie tablar además de m³ porque en la Selva Central la madera aserrada se
 * vende y se conversa en PT: un saldo en m³ hay que traducirlo antes de poder
 * decidir si alcanza para el pedido.
 */
export interface MetaEspecie {
  especie: string;
  /** m³ de trozas consumidos de esa especie. */
  trozasM3: number;
  /** Lo que debería salir al rendimiento de referencia. */
  metaM3: number;
  metaPt: number;
  /** Lo que efectivamente produjeron las corridas de esa especie, en m³. */
  producidoM3: number;
  producidoPt: number;
  /** meta − producido. Positivo = falta producir; negativo = superó la meta. */
  saldoM3: number;
  saldoPt: number;
  /** producido / trozas, en PORCENTAJE. `null` si no hay consumo. */
  rendimientoPct: number | null;
  /** Hay corridas en una unidad que no convierte a m³ (`unidad`, `kg`): lo
   *  producido de esa especie está incompleto y el saldo no se puede afirmar. */
  unidadesMezcladas: boolean;
}

const r4 = (n: number) => Number(n.toFixed(4));
const r2 = (n: number) => Number(n.toFixed(2));

/**
 * Lo producido por una corrida, llevado a m³.
 *
 * `null` = la unidad no convierte (unidades, kilos): no se inventa un factor.
 * El pie tablar sí convierte, con el mismo `PT_POR_M3` que usa el cubicador —
 * si acá hubiera otro factor, el saldo de la pantalla y el del cubicador
 * dirían cosas distintas de la misma madera.
 */
function aM3(cantidad: number, unidad: string | null): number | null {
  const u = (unidad ?? "m3").toLowerCase();
  if (u === "m3" || u === "m³") return cantidad;
  if (u === "pt" || u === "pie tablar") return cantidad / PT_POR_M3;
  return null;
}

/**
 * La meta por especie: lo que debería salir de las trozas que entraron.
 *
 * Se compara el consumo y la producción de las corridas ENTERAS —no la parte que
 * el lote se lleva— por la misma razón que `rendimientoPct` del balance: el
 * consumo se atribuye a la corrida completa, y cruzarlo contra una fracción de
 * lo producido daría un rendimiento inventado.
 *
 * Se exporta con los tipos MÍNIMOS que necesita —no `FilaConsumo` entera— para
 * que el export a Excel la pueda llamar armando lo suyo desde el grafo, sin
 * fabricar guías y proveedores que no va a usar.
 */
export function calcularMetaEspecies(
  consumos: ReadonlyArray<{ produccionEntryId: string; especie: string; volumeM3: number }>,
  corridas: ReadonlyArray<{ produccionEntryId: string; especie: string | null; quantity: number; unit: string | null }>,
): MetaEspecie[] {
  const porEspecie = new Map<string, MetaEspecie>();
  const filaDe = (especie: string): MetaEspecie => {
    const previa = porEspecie.get(especie);
    if (previa) return previa;
    const nueva: MetaEspecie = {
      especie,
      trozasM3: 0, metaM3: 0, metaPt: 0,
      producidoM3: 0, producidoPt: 0,
      saldoM3: 0, saldoPt: 0,
      rendimientoPct: null,
      unidadesMezcladas: false,
    };
    porEspecie.set(especie, nueva);
    return nueva;
  };

  const idsCorridas = new Set(corridas.map((c) => c.produccionEntryId));
  for (const c of consumos) {
    if (!idsCorridas.has(c.produccionEntryId)) continue;
    const f = filaDe(c.especie || "—");
    f.trozasM3 = r4(f.trozasM3 + c.volumeM3);
  }
  for (const c of corridas) {
    const f = filaDe(c.especie || "—");
    const m3 = aM3(c.quantity, c.unit);
    if (m3 == null) f.unidadesMezcladas = true;
    else f.producidoM3 = r4(f.producidoM3 + m3);
  }

  for (const f of porEspecie.values()) {
    f.metaM3 = r4((f.trozasM3 * RENDIMIENTO_REF_ASERRADA) / 100);
    f.metaPt = r2(f.metaM3 * PT_POR_M3);
    f.producidoPt = r2(f.producidoM3 * PT_POR_M3);
    f.saldoM3 = r4(f.metaM3 - f.producidoM3);
    f.saldoPt = r2(f.saldoM3 * PT_POR_M3);
    f.rendimientoPct = f.trozasM3 > 0 ? r2((f.producidoM3 / f.trozasM3) * 100) : null;
  }

  return [...porEspecie.values()].sort((a, b) => b.trozasM3 - a.trozasM3);
}

export function construirCadenaLote(
  consumos: FilaConsumo[],
  corridas: FilaCorrida[],
  despachos: FilaDespacho[],
): CadenaLote {
  const idsCorridas = new Set(corridas.map((c) => c.produccionEntryId));

  // ── Hacia atrás: agrupar por guía de ingreso ────────────────────────────
  const porGuia = new Map<string, CadenaLote["origen"][number]>();
  for (const c of consumos) {
    if (!idsCorridas.has(c.produccionEntryId)) continue;
    const prev = porGuia.get(c.woodEntryId);
    if (prev) {
      prev.consumidoM3 = r4(prev.consumidoM3 + c.volumeM3);
      prev.corridas += 1;
    } else {
      porGuia.set(c.woodEntryId, {
        woodEntryId: c.woodEntryId,
        gtfNumber: c.gtfNumber,
        serforNumeroRegistro: c.serforNumeroRegistro,
        especie: c.especie,
        proveedor: c.proveedor,
        originCode: c.originCode,
        entryDate: c.entryDate,
        consumidoM3: r4(c.volumeM3),
        corridas: 1,
      });
    }
  }
  const origen = [...porGuia.values()].sort((a, b) => b.consumidoM3 - a.consumidoM3);

  // ── El lote: una corrida está "compartida" si el lote no se la lleva entera.
  const conFlag = corridas.map((c) => ({
    ...c,
    compartida: c.quantity - c.enElLote > 0.0001,
  }));
  const compartidas = new Set(conFlag.filter((c) => c.compartida).map((c) => c.produccionEntryId));

  // ── Hacia adelante: agrupar por despacho ────────────────────────────────
  const porDespacho = new Map<string, CadenaLote["salidas"][number]>();
  for (const d of despachos) {
    if (!idsCorridas.has(d.produccionEntryId)) continue;
    const prev = porDespacho.get(d.despachoEntryId);
    if (prev) {
      prev.cantidad = r4(prev.cantidad + d.quantity);
      prev.compartida = prev.compartida || compartidas.has(d.produccionEntryId);
    } else {
      porDespacho.set(d.despachoEntryId, {
        despachoEntryId: d.despachoEntryId,
        lineNo: d.lineNo,
        fecha: d.fecha,
        gtfNumber: d.gtfNumber,
        destino: d.destino,
        cantidad: r4(d.quantity),
        compartida: compartidas.has(d.produccionEntryId),
      });
    }
  }
  const salidas = [...porDespacho.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));

  // ── Balance ─────────────────────────────────────────────────────────────
  const consumidoM3 = r4(origen.reduce((a, o) => a + o.consumidoM3, 0));
  const producido = r4(conFlag.reduce((a, c) => a + c.quantity, 0));
  const enElLote = r4(conFlag.reduce((a, c) => a + c.enElLote, 0));
  const despachado = r4(salidas.reduce((a, s) => a + s.cantidad, 0));

  const huecos: string[] = [];
  if (conFlag.length === 0) {
    huecos.push("El lote no tiene ninguna corrida asignada.");
  }
  const sinOrigen = conFlag.filter((c) => !consumos.some((x) => x.produccionEntryId === c.produccionEntryId));
  if (sinOrigen.length > 0) {
    huecos.push(
      `${sinOrigen.length} corrida(s) no declaran de qué ingreso salieron: ${sinOrigen
        .map((c) => `#${c.lineNo ?? "?"}`)
        .join(", ")}.`,
    );
  }
  if (compartidas.size > 0) {
    huecos.push(
      `${compartidas.size} corrida(s) están repartidas entre este lote y otros: lo despachado no se puede separar por lote.`,
    );
  }

  return {
    origen,
    corridas: conFlag,
    salidas,
    balance: {
      consumidoM3,
      producido,
      enElLote,
      despachado,
      // Nunca negativo: si se despachó más de lo que el lote se lleva es porque
      // la corrida estaba compartida, y eso ya se reporta como hueco.
      enStock: r4(Math.max(0, enElLote - despachado)),
      rendimientoPct: consumidoM3 > 0 ? Number(((producido / consumidoM3) * 100).toFixed(2)) : null,
    },
    meta: calcularMetaEspecies(consumos, conFlag),
    huecos,
  };
}
