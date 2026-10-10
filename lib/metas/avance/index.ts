/**
 * lib/metas/avance/index.ts — el avance de las metas, derivado de los datos
 * reales de su ventana (ADR-488). Lo usa `GET /api/goals/avance`.
 *
 * Por meta: ventana del período (día de Lima, `ventanaDeMeta`) → calculadora de
 * su categoría (`comercial.ts` ∪ `forestal.ts`; `manual` = lo que anotó el
 * dueño) → ritmo, estado y %. Cada meta va por su lado (`Promise.allSettled`):
 * si una lectura falla, ESA meta dice «sin dato» y las demás se muestran igual.
 *
 * Caché: `getOrSet` por (negocio, categoría, unidad, ventana) — 60 s si la
 * ventana sigue abierta, 600 s si ya cerró. `fresco` la salta (botón
 * «Actualizar»). Dentro de un mismo pedido, `memo` junta las lecturas
 * repetidas (ventas, ticket y pedidos leen las mismas dos agregaciones).
 */
import "server-only";
import { getOrSet, invalidate } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { categoriaDe, normalizarUnidad, type AvanceMetaDTO } from "@/lib/admin/metas-catalogo";
import {
  estadoDeMeta,
  porcentajeDeMeta,
  ritmoEsperado,
  ventanaDeMeta,
  type EstadoMeta,
  type VentanaMeta,
} from "@/lib/admin/metas-periodo";
import type { CategoriaMeta, MetaDTO, PeriodoMeta } from "@/lib/admin/metas-tareas";
import { CALCULADORAS_COMERCIALES } from "./comercial";
import { CALCULADORAS_FORESTALES } from "./forestal";
import {
  TTL_AVANCE_ABIERTA,
  TTL_AVANCE_CERRADA,
  claveCacheAvance,
  crearMemoLectura,
  type Calculadora,
  type Medicion,
  type MemoLectura,
} from "./tipos";

const CALCULADORAS: Partial<Record<CategoriaMeta, Calculadora>> = {
  ...CALCULADORAS_COMERCIALES,
  ...CALCULADORAS_FORESTALES,
};

/**
 * Un promedio o un porcentaje no se junta día a día como una suma: el ticket
 * del día 3 puede ser ya el del mes. Sin marca de ritmo; sólo cumplida o no.
 */
const SIN_RITMO: ReadonlySet<CategoriaMeta> = new Set<CategoriaMeta>(["ticket_promedio", "retencion"]);

export interface OpcionesAvance {
  /** Salta la caché y vuelve a leer (botón «Actualizar»). */
  fresco?: boolean;
}

/** Lo que identifica qué medir; la meta guardada y la vista previa del modal lo comparten. */
interface QueMedir {
  category: CategoriaMeta;
  period: PeriodoMeta;
  unit?: string | null;
  dueDate?: string;
  /** Sólo `manual`: lo que anotó el dueño. */
  current?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

async function medir(tenantId: string, q: QueMedir, v: VentanaMeta, memo: MemoLectura, fresco: boolean): Promise<Medicion> {
  if (q.category === "manual") {
    return Number.isFinite(q.current)
      ? { valor: q.current ?? 0, detalle: "El avance lo anotas tú." }
      : { valor: null, detalle: "En una meta a mano el avance lo escribes tú." };
  }
  const calcular = CALCULADORAS[q.category];
  if (!calcular) return { valor: null, detalle: "Esta meta todavía no se mide sola." };
  const unidad = normalizarUnidad(q.category, q.unit);
  const clave = claveCacheAvance(tenantId, q.category, unidad, v);
  if (fresco) invalidate(clave);
  return getOrSet(clave, v.cerrada ? TTL_AVANCE_CERRADA : TTL_AVANCE_ABIERTA, () => calcular(tenantId, v, unidad, memo));
}

/** Ritmo, estado y % de una medición contra el objetivo. Sin objetivo (vista previa sin número) no hay estado que dar. */
function armar(id: string, q: QueMedir, target: number | null, v: VentanaMeta, m: Medicion): AvanceMetaDTO {
  const sentido = categoriaDe(q.category)?.sentido ?? "sube";
  const conObjetivo = target !== null && target > 0;
  const esperadoCrudo = conObjetivo && !SIN_RITMO.has(q.category) ? ritmoEsperado(target, v, sentido) : null;
  const esperado = esperadoCrudo === null ? null : r2(esperadoCrudo);
  const estado: EstadoMeta = conObjetivo
    ? estadoDeMeta({ avance: m.valor, target, esperado, sentido, cerrada: v.cerrada })
    : m.valor === null ? "sin_dato" : "en_camino";
  return {
    id,
    desde: v.desde,
    hasta: v.hasta,
    etiqueta: v.etiqueta,
    avance: m.valor,
    esperado,
    pct: conObjetivo ? porcentajeDeMeta(m.valor, target) : null,
    estado,
    ...(m.parcial ? { parcial: m.parcial } : {}),
    ...(m.detalle ? { detalle: m.detalle } : {}),
  };
}

/** La ventana de la meta; con un vencimiento roto, la del período que contiene hoy. */
function ventanaSegura(q: QueMedir, hoy: string): VentanaMeta {
  try {
    return ventanaDeMeta(q.period, hoy, q.dueDate);
  } catch {
    return ventanaDeMeta(q.period, hoy);
  }
}

function sinDato(id: string, v: VentanaMeta): AvanceMetaDTO {
  return {
    id,
    desde: v.desde,
    hasta: v.hasta,
    etiqueta: v.etiqueta,
    avance: null,
    esperado: null,
    pct: null,
    estado: "sin_dato",
    detalle: "No se pudo leer el dato. Toca «Actualizar» para reintentar.",
  };
}

/** El avance de cada meta, en el mismo orden. Nunca rechaza por una meta: esa sale «sin dato». */
export async function avanceDeMetas(
  tenantId: string,
  metas: MetaDTO[],
  hoy: string,
  opciones: OpcionesAvance = {},
): Promise<AvanceMetaDTO[]> {
  if (!tenantId) throw new Error("tenantId is required");
  const memo = crearMemoLectura();
  const ventanas = metas.map((m) => ventanaSegura(m, hoy));
  const resultados = await Promise.allSettled(
    metas.map(async (meta, i) => armar(meta.id, meta, meta.target, ventanas[i]!, await medir(tenantId, meta, ventanas[i]!, memo, !!opciones.fresco))),
  );
  return resultados.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const meta = metas[i]!;
    logger.error("[metas-avance] no se pudo medir una meta", {
      tenantId,
      metaId: meta.id,
      category: meta.category,
      period: meta.period,
      err: r.reason instanceof Error ? r.reason.message : String(r.reason),
    });
    return sinDato(meta.id, ventanas[i]!);
  });
}

export const ID_VISTA_PREVIA = "vista-previa";

/**
 * La vista previa del modal («en este período llevas S/ 1 240»): lo mismo que
 * una meta guardada, sin guardarla. Con `target` también da ritmo, estado y %.
 */
export async function avanceDePrueba(
  tenantId: string,
  q: { category: CategoriaMeta; period: PeriodoMeta; unit?: string | null; target?: number | null },
  hoy: string,
  opciones: OpcionesAvance = {},
): Promise<AvanceMetaDTO> {
  if (!tenantId) throw new Error("tenantId is required");
  const consulta: QueMedir = { category: q.category, period: q.period, unit: q.unit };
  const v = ventanaSegura(consulta, hoy);
  if (q.category === "manual") {
    return armar(ID_VISTA_PREVIA, consulta, q.target ?? null, v, { valor: null, detalle: "En una meta a mano el avance lo escribes tú." });
  }
  try {
    const m = await medir(tenantId, consulta, v, crearMemoLectura(), !!opciones.fresco);
    return armar(ID_VISTA_PREVIA, consulta, q.target ?? null, v, m);
  } catch (e) {
    logger.error("[metas-avance] vista previa falló", {
      tenantId,
      category: q.category,
      period: q.period,
      err: e instanceof Error ? e.message : String(e),
    });
    return sinDato(ID_VISTA_PREVIA, v);
  }
}
