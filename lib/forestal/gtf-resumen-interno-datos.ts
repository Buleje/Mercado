/**
 * gtf-resumen-interno-datos — de lo que guarda el libro a la entrada del
 * «Resumen interno» de una GTF (`gtf-resumen-interno`). PURO: lo usan el
 * servidor (`GtfResumenInternoDB.leer`, que hace las lecturas) y sus pruebas
 * (`forestal-gtf-resumen-interno.test.ts`).
 *
 *   · `lineasPropiasDeLaGuia` → las líneas de Despacho de ESTA guía, con la
 *     MISMA regla que anular la guía (`lineasDeLaGuia`): una guía dada de baja
 *     no tiene líneas vivas (las del mismo N° son de la reemitida).
 *   · `lineaDelResumen` → cada línea con los m³ de su Trozado.
 *   · `declaradoDeLaGuia`, `pasosCtp`, `permisoDeLaGuia`.
 */

import { leerGtfDatos } from "./ctp-gtf-datos";
import { mismoNumeroGtf } from "./gtf-talonario";
import { lineasDeLaGuia, piezasDeItems } from "./loth-guia-despacho";
import { fichaDeGuiaImportada } from "./loth-importar-guia-ficha";
import type { TrozadoDelDespacho } from "./loth-constants";
import type { PiezaCtp } from "./loth-trace-aserradero";
import type { EntradaResumenInterno, LineaDelResumen, PasoCtp, PiezaDelResumen, ResumenInterno } from "./gtf-resumen-interno";

/** Lo que el resumen lee de la guía (`ForestGtf`). */
export interface GuiaParaResumen {
  gtfNumber: string;
  planId: string | null;
  titularName: string | null;
  items: unknown;
  /** `anulada` o borrada (`deletedAt`) = dada de baja: no ampara líneas vivas. */
  status: string;
  deletedAt: Date | string | null;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Las trozas de la lista de la guía, con sus dos códigos. */
export function piezasDelResumen(items: unknown): PiezaDelResumen[] {
  return piezasDeItems(items).map((p) => ({
    codigo: p.codigo,
    codigoGuia: p.codigoGuia ?? null,
    arbol: p.arbol,
    especie: p.comun,
    d1M: p.diamMayorM,
    d2M: p.diamMenorM,
    largoM: p.lengthM,
    m3: p.volumeM3,
  }));
}

/** Una línea de Despacho como la lee el servidor (Prisma) o la publica la API. */
export interface LineaDeDespachoLeida {
  gtfNumber: string | null;
  entryDate: string | Date | null;
  trozaCode: string | null;
  /** Decimal de Prisma, string de la API o número. */
  volumeM3: unknown;
  quantity: unknown;
  unit: string | null;
  section: string;
  treeCode: string | null;
  trozado?: TrozadoDelDespacho | null;
}

/** Una línea de Despacho: los m³ de la troza son los de su Trozado. */
export function lineaDelResumen(e: LineaDeDespachoLeida): LineaDelResumen {
  const esProducto = e.section === "despacho_producto";
  const m3 = esProducto ? (e.unit === "m3" ? num(e.quantity) : null) : num(e.trozado?.volumeM3) ?? num(e.volumeM3);
  const dia = e.entryDate instanceof Date ? e.entryDate.toISOString() : e.entryDate ?? "";
  return {
    gtfNumber: e.gtfNumber,
    dia: dia.slice(0, 10),
    trozaCode: e.trozaCode,
    m3,
    arbol: e.trozado?.treeCode ?? e.treeCode ?? null,
    trozadoId: e.trozado?.lineaId ?? null,
    esProducto,
  };
}

/**
 * Las líneas de Despacho vivas que son de ESTA guía, entre las del mismo N°
 * (`candidatas`: vivas, de Despacho de trozas o de productos).
 *
 *   · Guía dada de baja (anulada o borrada) → ninguna: en Blas el
 *     `019-001-0000001` está dos veces y la anulada se quedaba con las 22
 *     líneas de la reemitida (R2 «libro 22 trozas», R3 «sin despacho»).
 *   · Trozas → `lineasDeLaGuia`, la regla de anular la guía (sus códigos; si
 *     el N° es de varias guías, su plan o su titular).
 *   · Productos → la misma regla sin el paso de los códigos (no llevan troza).
 */
export function lineasPropiasDeLaGuia<L extends { section: string; gtfNumber: string | null; trozaCode: string | null; planId: string | null }>(
  guia: GuiaParaResumen,
  candidatas: readonly L[],
  x: { otrasConElNumero: number; titularDePlan?: (planId: string) => string | null | undefined },
): L[] {
  if (guia.status === "anulada" || guia.deletedAt) return [];
  const delNumero = candidatas.filter((l) => mismoNumeroGtf(l.gtfNumber, guia.gtfNumber));
  return [
    ...lineasDeLaGuia(guia, delNumero.filter((l) => l.section === "despacho_troza"), x),
    ...lineasDeLaGuia({ ...guia, items: null }, delNumero.filter((l) => l.section === "despacho_producto"), x),
  ];
}

export type Declarado = Pick<EntradaResumenInterno["guia"], "declaradoM3" | "declaradoTrozas" | "fuenteDeclarado">;

/** Lo que DECLARA la guía: la ficha de SERFOR si se importó; si no, su registro. */
export function declaradoDeLaGuia(g: { gtfDatos?: unknown; volumenTotalM3: unknown; piezasTotal: number | null }): Declarado {
  const leida = fichaDeGuiaImportada(g.gtfDatos);
  if (leida) {
    const f = leida.ficha;
    const prods = f.productos ?? [];
    const sumaVol = prods.reduce((a, p) => a + (p.volumen ?? 0), 0);
    const sumaCant = prods.reduce((a, p) => a + (p.cantidad ?? 0), 0);
    return {
      declaradoM3: f.volumenTotal ?? (prods.length ? sumaVol : num(g.volumenTotalM3)),
      declaradoTrozas: prods.length && prods.every((p) => p.cantidad != null) ? sumaCant : g.piezasTotal,
      fuenteDeclarado: "serfor",
    };
  }
  return { declaradoM3: num(g.volumenTotalM3), declaradoTrozas: g.piezasTotal, fuenteDeclarado: "registro" };
}

/** Las piezas del CTP por id de Trozado, en la forma del resumen. */
export function pasosCtp(piezas: readonly PiezaCtp[]): Map<string, PasoCtp[]> {
  const out = new Map<string, PasoCtp[]>();
  for (const p of piezas) {
    const xs = out.get(p.trozadoId) ?? [];
    xs.push({ recibida: p.llegada?.dia ?? null, aserrada: p.corrida?.dia ?? null, salioEntera: p.despacho?.dia ?? null });
    out.set(p.trozadoId, xs);
  }
  return out;
}

/** El permiso de la guía: el suyo; si no tiene, el ÚNICO de sus líneas del libro. */
export function permisoDeLaGuia(planId: string | null | undefined, lineas: readonly { planId: string | null }[]): string | null {
  if (planId) return planId;
  const planes = new Set(lineas.map((l) => l.planId ?? null).filter((p): p is string => Boolean(p)));
  return planes.size === 1 ? [...planes][0] : null;
}

/** Lo que arma el servidor antes de calcular R1-R4. */
export interface DatosResumenInterno {
  entrada: EntradaResumenInterno;
  /** Id de una línea de Despacho de trozas de ESTA guía: con él abre `/verificar/guia/<id>` (el QR de la hoja). */
  lineaDespachoId: string | null;
  planId: string | null;
  avisos: string[];
}

/** La respuesta de `GET /api/admin/forestal/gtf/resumen-interno?id=`: R1-R4 ya calculados. */
export interface RespuestaResumenInterno {
  resumen: ResumenInterno;
  lineaDespachoId: string | null;
  planId: string | null;
  avisos: string[];
}

/** El N° de la Lista de trozas que guardó la guía (35), o `null`. */
export function listaTrozasDeLaGuia(gtfDatos: unknown): string | null {
  if (gtfDatos == null) return null;
  return leerGtfDatos(gtfDatos).guia.listaTrozasNro.trim() || null;
}
