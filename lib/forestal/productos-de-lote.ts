/**
 * Qué madera salió de un lote y qué queda de ella.
 *
 * El libro ya sabía las dos mitades por separado: los **lotes** (qué entró a la
 * sierra) viven en una pestaña y los **productos disponibles** (qué quedó sin
 * despachar) en otra. Para contestar «de este lote, ¿qué me queda?» había que
 * mirar las dos y cruzarlas de memoria por el código del lote.
 *
 * Este módulo hace ese cruce una sola vez: `corrida.lote` ya trae el código
 * —verificado contra el tenant real, «13-2026» y compañía—, así que alcanza con
 * agrupar. NO recalcula saldos: el `disponible` lo sigue dando el endpoint, que
 * a su vez lo toma de `saldosDeCorridas` (ADR-316). Una segunda cuenta sería una
 * segunda verdad.
 *
 * Pedido de Brandon (2026-09-12): «en cada lote un botón donde se vea los
 * productos disponibles según lo usado en el lote y los ya usados o
 * despachados o consumo local».
 */

import { uidDeFila } from "./despacho-lista";

/** Un paquete tal como lo devuelve el libro. */
export interface PaqueteDeLote {
  id: string;
  codigo: string;
  producto: string | null;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
  observations: string | null;
}

/**
 * Una corrida con saldo, como la publica `/api/admin/forestal/ctp?disponibles=1`.
 *
 * El shape es el del endpoint: se declara acá para que la pantalla de productos
 * disponibles y la de lotes lean el MISMO tipo y no se desincronicen.
 */
export interface CorridaConSaldo {
  id: string;
  lineNo: number | null;
  fecha: string;
  especie: string | null;
  especieCientifica: string | null;
  producto: string | null;
  presentacion: string | null;
  unidad: string | null;
  /** El código del lote que alimentó la corrida («13-2026»). */
  lote: string | null;
  cantidad: number | null;
  volumenConsumidoM3: number | null;
  producido: number;
  despachado: number;
  reprocesado: number;
  disponible: number;
  paquetes: PaqueteDeLote[];
  observations: string | null;
  /** De quién es la madera (ADR-412): "propia" | "tercero" | null. */
  duenoMadera?: string | null;
  /** Quién, cuando es de tercero. */
  titularNombre?: string | null;
  titularOrigen: string[];
  gtfOrigen: string[];
  /** Marcado a mano como «ya usado» (consumo local, merma, uso propio). */
  usadoAt: string | null;
  usadoMotivo: string | null;
}

/**
 * En qué terminó lo que produjo una corrida.
 *
 * Son excluyentes y ordenados por lo que le importa al patio: primero si queda
 * algo para vender, después por qué no queda.
 */
export type DestinoProducto = "disponible" | "despachado" | "usado" | "reprocesado" | "agotado";

export interface ProductoDeLote {
  corrida: CorridaConSaldo;
  destino: DestinoProducto;
  /** `corridaId:paqueteId` — lo que `CtpDespachoGuiaModal` espera en `presetUids`. */
  uid: string;
}

export interface ResumenDeLote {
  lote: string;
  productos: ProductoDeLote[];
  producido: number;
  despachado: number;
  reprocesado: number;
  /** Lo que todavía se puede despachar. */
  disponible: number;
  /** Lo marcado a mano como usado (consumo local, merma): no se puede despachar. */
  usado: number;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Dónde terminó una corrida.
 *
 * El orden importa: una corrida marcada como usada NO está disponible aunque su
 * saldo diga que sí — la marca es justamente lo que dice «esto ya no se vende».
 * Por eso se mira antes que el saldo.
 */
export function destinoDe(c: CorridaConSaldo): DestinoProducto {
  if (c.usadoAt) return "usado";
  if (num(c.disponible) > 1e-4) return "disponible";
  if (num(c.despachado) > 1e-4) return "despachado";
  if (num(c.reprocesado) > 1e-4) return "reprocesado";
  return "agotado";
}

/** Cómo se lee cada destino en la pantalla. */
export const ETIQUETA_DESTINO: Record<DestinoProducto, string> = {
  disponible: "En patio",
  despachado: "Despachado",
  usado: "Uso propio",
  reprocesado: "Reprocesado",
  agotado: "Sin saldo",
};

export const AYUDA_DESTINO: Record<DestinoProducto, string> = {
  disponible: "Sigue en la planta: se puede poner en una guía.",
  despachado: "Salió con una guía de transporte.",
  usado: "Marcado a mano como consumido acá (uso propio, merma, venta local).",
  reprocesado: "Volvió a la sierra: su volumen vive ahora en otra corrida.",
  agotado: "No queda saldo de esta corrida.",
};

/**
 * Agrupar por lote lo que el endpoint devuelve plano.
 *
 * Las corridas sin lote quedan afuera: pertenecen a una producción declarada
 * sin lote (hay una pantalla propia para eso) y meterlas en un balde «sin lote»
 * las haría parecer parte de algo que no existe.
 */
export function agruparPorLote(corridas: readonly CorridaConSaldo[]): Map<string, ResumenDeLote> {
  const mapa = new Map<string, ResumenDeLote>();
  for (const c of corridas) {
    const lote = c.lote?.trim();
    if (!lote) continue;
    let r = mapa.get(lote);
    if (!r) {
      r = { lote, productos: [], producido: 0, despachado: 0, reprocesado: 0, disponible: 0, usado: 0 };
      mapa.set(lote, r);
    }
    const destino = destinoDe(c);
    r.productos.push({ corrida: c, destino, uid: uidDeFila(c.id, null) });
    r.producido = r3(r.producido + num(c.producido));
    r.despachado = r3(r.despachado + num(c.despachado));
    r.reprocesado = r3(r.reprocesado + num(c.reprocesado));
    /* Lo marcado como usado NO suma a lo disponible aunque tenga saldo: es la
       diferencia entre «me queda para vender» y «ya lo gasté acá». */
    if (destino === "usado") r.usado = r3(r.usado + num(c.disponible));
    else r.disponible = r3(r.disponible + num(c.disponible));
  }
  return mapa;
}

/**
 * Las filas que entran a una guía de transporte.
 *
 * Sólo lo DISPONIBLE: poner en una guía algo ya despachado lo declararía dos
 * veces, y algo marcado como usado declararía madera que no va a salir.
 * Se devuelve el `uid` de cada paquete —o el de la corrida si no tiene— que es
 * exactamente lo que `presetUids` espera.
 */
export function uidsDespachables(resumenes: readonly ResumenDeLote[]): string[] {
  const uids: string[] = [];
  for (const r of resumenes) {
    for (const p of r.productos) {
      if (p.destino !== "disponible") continue;
      if (p.corrida.paquetes.length > 0) {
        for (const paq of p.corrida.paquetes) uids.push(uidDeFila(p.corrida.id, paq.id));
      } else {
        uids.push(uidDeFila(p.corrida.id, null));
      }
    }
  }
  return uids;
}

/** Lo despachable de varios lotes, en una sola cuenta para la barra de selección. */
export function totalDespachable(resumenes: readonly ResumenDeLote[]): {
  corridas: number;
  paquetes: number;
  m3: number;
} {
  let corridas = 0;
  let paquetes = 0;
  let m3 = 0;
  for (const r of resumenes) {
    for (const p of r.productos) {
      if (p.destino !== "disponible") continue;
      corridas += 1;
      paquetes += p.corrida.paquetes.length;
      m3 += num(p.corrida.disponible);
    }
  }
  return { corridas, paquetes, m3: r3(m3) };
}
