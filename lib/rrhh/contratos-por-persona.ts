/**
 * El contrato que se muestra por persona en Equipo › Personal (19-10, «juntar
 * pestañas gemelas»). La pestaña Equipo › Contratos se fue: listaba los mismos
 * contratos de Documentos › Contratos con una columna Persona. Ahora cada
 * persona lleva el suyo en su fila, y su ficha sigue mostrando todos.
 *
 * Puro (sin React ni fetch) para probarlo solo.
 */
import { estadoVisible, type DbContract, type EstadoVisible } from "@/lib/types/contracts";

export type ContratoResumen = Pick<DbContract, "id" | "numero" | "tipo" | "estado" | "fechaVencimiento" | "colaboradorId">;

export interface ContratoDePersona {
  /** El que se ve en la fila: el que pide atención antes. */
  principal: ContratoResumen;
  estado: EstadoVisible;
  /** Cuántos más tiene (se ven todos en su ficha). */
  otros: number;
}

/** Lo que pide mirar primero: por vencer, vigente, por firmar, borrador, vencido; el resto al final. */
const RANGO: Partial<Record<EstadoVisible, number>> = { POR_VENCER: 0, VIGENTE: 1, PENDIENTE_FIRMA: 2, BORRADOR: 3, VENCIDO: 4 };
const rango = (e: EstadoVisible) => RANGO[e] ?? 5;
/** Sin fecha de vencimiento = indeterminado: cuenta como el más lejano. */
const vence = (c: ContratoResumen) => c.fechaVencimiento ?? "9999-12-31";

/** Lo mismo que listaba la pestaña vieja: trabajo, locación o cualquiera ligado a una persona. */
export function esDelPersonal(c: Pick<ContratoResumen, "tipo" | "colaboradorId">): boolean {
  return c.tipo === "TRABAJO" || c.tipo === "LOCACION" || Boolean(c.colaboradorId);
}

export function contratosPorPersona(contratos: readonly ContratoResumen[]): {
  porPersona: Map<string, ContratoDePersona>;
  /** Contratos de trabajo o locación que no están ligados a nadie. */
  sinPersona: number;
} {
  const grupos = new Map<string, ContratoResumen[]>();
  let sinPersona = 0;
  for (const c of contratos) {
    if (!esDelPersonal(c)) continue;
    if (!c.colaboradorId) {
      sinPersona += 1;
      continue;
    }
    const lista = grupos.get(c.colaboradorId) ?? [];
    lista.push(c);
    grupos.set(c.colaboradorId, lista);
  }
  const porPersona = new Map<string, ContratoDePersona>();
  for (const [id, lista] of grupos) {
    const ordenados = lista
      .map((c) => ({ c, e: estadoVisible(c) }))
      .sort((a, b) => rango(a.e) - rango(b.e) || vence(b.c).localeCompare(vence(a.c)));
    const primero = ordenados[0];
    if (primero) porPersona.set(id, { principal: primero.c, estado: primero.e, otros: lista.length - 1 });
  }
  return { porPersona, sinPersona };
}

/** Dónde se hace el contrato de una persona: el creador de Documentos con sus datos precargados. */
export function hrefHacerContrato(colaboradorId: string): string {
  return `/admin?tab=documentos&vista=contratos&sub=plantillas&colaborador=${encodeURIComponent(colaboradorId)}`;
}
