/**
 * De dónde sale la ficha de cada guía a importar (ADR-461) — SERVIDOR.
 *
 *  - `serfor`: el SNIFFS, por el N° de registro (el único lugar del sistema que
 *    sale a esa red es `consultarGtfEnSerfor`; guarda 10 min lo encontrado y
 *    60 s un «no encontrada»). Cada una se cobra al límite de la consulta
 *    suelta (`cobrarConsultasSerfor`).
 *  - `ctp`: la ficha que guardó un ingreso del Libro CTP de ESTE negocio.
 *  - `ficha`: la que leyó el lector IA de una foto o PDF. No está verificada:
 *    la guía queda anotada así (ADR-312: la ficha del navegador no lleva el
 *    sello de «verificada en SERFOR»).
 */
import "server-only";
import { applyRateLimit } from "@/lib/rate-limit";
import { consultarGtfEnSerfor } from "./serfor-gtf-fetch";
import { esNumeroRegistroValido, normalizarNumeroRegistro, type GtfSerfor } from "./serfor-gtf";
import { repararFichaSerfor } from "./serfor-texto-danado";
import { claveDeFuente, type GuiaParaRevisar } from "./loth-importar-guia";
import type { FuenteImportarGuia } from "./loth-importar-guia-tipos";
import { ForestLothImportarDB } from "@/lib/db/forest-loth-importar.db";

/** Consultas a SERFOR a la vez: el servicio es de un tercero y lento. */
const EN_PARALELO = 3;

export async function resolverFuente(
  tenantId: string,
  fuente: FuenteImportarGuia,
  indice: number,
  planElegido: string | null = null,
): Promise<GuiaParaRevisar> {
  const base = { clave: claveDeFuente(fuente, indice), fuente, planElegido };
  if (fuente.tipo === "ficha") {
    return { ...base, ficha: repararFichaSerfor(fuente.ficha), verificada: false, falla: null };
  }
  if (fuente.tipo === "ctp") {
    const ficha = await ForestLothImportarDB.fichaDeIngreso(tenantId, fuente.woodEntryId);
    return ficha
      ? { ...base, ficha, verificada: true, falla: null }
      : {
          ...base,
          ficha: null,
          verificada: false,
          falla: { estado: "no_encontrada", mensaje: "Ese ingreso no existe en este negocio o no guardó la ficha de SERFOR." },
        };
  }
  const numero = normalizarNumeroRegistro(fuente.numeroRegistro);
  if (!esNumeroRegistroValido(numero)) {
    return {
      ...base,
      ficha: null,
      verificada: false,
      falla: { estado: "no_encontrada", mensaje: `«${fuente.numeroRegistro}» no es un N° de registro: va con sus guiones, como lo imprime la guía (1-10-0474633).` },
    };
  }
  const consulta = await consultarGtfEnSerfor(numero);
  if (!consulta.ok) return { ...base, ficha: null, verificada: false, falla: { estado: "sin_respuesta", mensaje: consulta.mensaje } };
  const r = consulta.resultado;
  if (r.estado !== "encontrada" || !r.gtf) {
    return {
      ...base,
      ficha: null,
      verificada: false,
      falla: {
        estado: r.estado === "sin_respuesta" ? "sin_respuesta" : "no_encontrada",
        mensaje: r.mensaje ?? `SERFOR no encontró la guía ${numero}.`,
      },
    };
  }
  const ficha: GtfSerfor = { ...r.gtf, numeroRegistro: r.gtf.numeroRegistro || numero };
  return { ...base, ficha, verificada: true, falla: null };
}

/** Todas las fuentes, de a `EN_PARALELO`, en el orden pedido. */
export async function resolverFuentes(
  tenantId: string,
  fuentes: readonly FuenteImportarGuia[],
  planes: readonly (string | null)[] = [],
): Promise<GuiaParaRevisar[]> {
  const out: GuiaParaRevisar[] = new Array(fuentes.length);
  let siguiente = 0;
  const trabajar = async () => {
    while (siguiente < fuentes.length) {
      const i = siguiente++;
      out[i] = await resolverFuente(tenantId, fuentes[i], i, planes[i] ?? null);
    }
  };
  await Promise.all(Array.from({ length: Math.min(EN_PARALELO, fuentes.length) }, trabajar));
  return out;
}

/**
 * Cobra `n` consultas a SERFOR al MISMO límite que la consulta suelta
 * (`GET /api/admin/forestal/gtf/serfor`, bucket `forestal:gtf-serfor`): pegar
 * 30 N° de registro en la vista previa no puede ser una vía para golpear el
 * SNIFFS más que la otra. Devuelve el 429 a responder, o `null`.
 */
export function cobrarConsultasSerfor(req: { headers: { get(name: string): string | null } }, n: number): Response | null {
  for (let i = 0; i < n; i++) {
    const rl = applyRateLimit(req, "DRIVE_IA", "forestal:gtf-serfor");
    if (rl) return rl;
  }
  return null;
}
