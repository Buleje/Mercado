/**
 * parte-cambios — lo que cambió en la ficha del Directorio, con la forma del
 * `PATCH /api/admin/forestal/directorio/[id]` (ADR-524): sólo las claves que
 * se tocaron. El POST con `id` trata el cuerpo como la fila entera y borraba
 * lo que no viajaba; el PATCH no.
 *
 * - `id` nunca viaja (va en la ruta).
 * - Los adjuntos no se reemplazan: lo nuevo va en `adjuntosAgregar` y lo que
 *   se sacó en `adjuntosQuitar` (por `documentId`).
 * - Los 10 campos de la ficha de persona (DNI, RUC aparte, nacimiento…) vacíos
 *   viajan como `null` (= se borra): sus esquemas no aceptan "".
 */
import type { FichaPersonaCampos } from "@/lib/admin/fichas-tramites-alquileres";
import type { AdjuntoParte, PartePatch } from "@/lib/forestal/directorio";

export const CAMPOS_FICHA_PERSONA = [
  "dniEmitidoEl",
  "dniVenceEl",
  "ruc",
  "rucEstado",
  "rucEstadoDesde",
  "rucCondicion",
  "nacimientoEl",
  "nacimientoLugar",
  "estadoCivil",
  "parentesco",
] as const satisfies readonly (keyof FichaPersonaCampos)[];

const ES_DE_PERSONA = new Set<string>(CAMPOS_FICHA_PERSONA);
const FUERA_DEL_PATCH = new Set(["id", "adjuntos"]);

type BorradorPlano = Record<string, unknown> & { adjuntos?: AdjuntoParte[] };

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function normal(k: string, v: unknown): unknown {
  if (!ES_DE_PERSONA.has(k)) return v;
  if (typeof v === "string") return v.trim() ? v.trim() : null;
  return v ?? null;
}

/**
 * Las claves que cambiaron entre la ficha guardada (pasada por el mismo
 * `aBorrador` del formulario) y el borrador. `soloEstas` recorta la cuenta a
 * una lista (p. ej. los campos de persona tras un alta). Sin cambios → `{}`.
 */
export function cambiosDeLaParte(original: object, borrador: object, soloEstas?: readonly string[]): PartePatch {
  const o = original as BorradorPlano;
  const b = borrador as BorradorPlano;
  const out: Record<string, unknown> = {};
  const claves = soloEstas ?? [...new Set([...Object.keys(o), ...Object.keys(b)])];
  for (const k of claves) {
    if (FUERA_DEL_PATCH.has(k) || !(k in b)) continue;
    const antes = normal(k, o[k]);
    const ahora = normal(k, b[k]);
    if (!igual(antes, ahora)) out[k] = ahora === undefined ? null : ahora;
  }
  if (!soloEstas) {
    const antes = new Map((o.adjuntos ?? []).map((a) => [a.documentId, a]));
    const ahora = new Map((b.adjuntos ?? []).map((a) => [a.documentId, a]));
    const agregar = [...ahora.values()].filter((a) => !antes.has(a.documentId)).map((a) => ({ documentId: a.documentId, rotulo: a.rotulo }));
    const quitar = [...antes.keys()].filter((id) => !ahora.has(id));
    if (agregar.length) out.adjuntosAgregar = agregar;
    if (quitar.length) out.adjuntosQuitar = quitar;
  }
  return out as PartePatch;
}

/** Los campos de persona que el borrador trae con valor (para mandarlos tras un alta). */
export function camposDePersonaConValor(borrador: object): PartePatch {
  const b = borrador as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS_FICHA_PERSONA) {
    const v = normal(k, b[k]);
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out as PartePatch;
}
