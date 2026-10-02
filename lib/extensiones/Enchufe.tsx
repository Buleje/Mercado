import "server-only";
import type { ReactNode } from "react";
import type { ContextoPieza, EnchufeId } from "@/extensiones/_contrato";
import { BordeDePieza } from "./BordeDePieza";
import { resolverPiezas, type PiezaResuelta } from "./resolver";
import { conTope, reportarFalloPieza } from "./tope";
import { logger } from "@/lib/logger";

/**
 * <Enchufe> — el lugar con nombre donde entra una pieza en una pantalla de
 * SERVIDOR (ADR-457). Hoy: `tienda.portada`.
 *
 * Uso en la portada (lo cablea la tanda de la tienda):
 *   // reemplaza el cuerpo entero si el negocio tiene una pieza «reemplaza»:
 *   <Enchufe nombre="tienda.portada" modo="reemplaza" tenantId={t.id} slug={t.slug}
 *            fallback={<CuerpoNormal />} />
 *   // un bloque más dentro del orden de la portada (bodyOrder):
 *   <Enchufe nombre="tienda.portada" modo="agrega" tenantId={t.id} slug={t.slug} />
 *
 * Sin `modo` hace las dos cosas: el reemplazo (o el `fallback`) y después los
 * bloques que agregan.
 *
 * Garantías: `cargar()` corre con tope de 2 s dentro de try/catch; la vista va
 * dentro de `<BordeDePieza>`. Si la pieza falla, tarda o sus opciones no
 * pasan su Zod, se ve el `fallback` y se avisa a Sentry. El `tenantId` lo pone
 * quien monta el enchufe (de la sesión o del host), nunca la pieza.
 */
export type EnchufeDeServidor = Extract<EnchufeId, "tienda.portada">;

export interface EnchufeProps {
  nombre: EnchufeDeServidor;
  tenantId: string;
  slug: string;
  /** La versión normal: se ve si no hay pieza que reemplace o si la pieza falla. */
  fallback?: ReactNode;
  /** `reemplaza` = sólo el reemplazo (o el fallback); `agrega` = sólo los bloques extra. */
  modo?: "agrega" | "reemplaza";
  /**
   * El `fallback` YA trae los bloques que agregan, en su lugar (la portada de
   * `/t/[slug]` los ordena con `bodyOrder`). Si ninguna pieza reemplaza, se ve
   * el fallback tal cual y no se repiten al final; si una reemplaza, van
   * después del reemplazo. Sin esto, un reemplazo que fallaba mandaba los
   * bloques al fondo de la página (revisión 2026-10-01).
   */
  agregaEnElFallback?: boolean;
}

type Cargada = { ok: true; datos: unknown } | { ok: false };

/** La pieza marca así lo que no es un fallo: `class X extends Error { esperado = true }`. */
function esErrorEsperado(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { esperado?: unknown }).esperado === true;
}

async function cargar(p: PiezaResuelta, ctx: ContextoPieza): Promise<Cargada> {
  const portada = p.entrada.portada;
  if (!portada?.cargar) return { ok: true, datos: undefined };
  try {
    const datos = await conTope(portada.cargar(ctx, p.opciones), undefined, `cargar() de ${p.piezaId}`);
    return { ok: true, datos };
  } catch (err) {
    /* Un error marcado `esperado` es la pieza diciendo «no tengo qué mostrar»
       (p. ej. el dueño despublicó la página): va el fallback sin avisar a
       Sentry. Avisar en cada visita llenaba Sentry de ruido y tapaba los
       fallos de verdad. */
    if (esErrorEsperado(err)) {
      logger.info("[piezas] sin contenido, se ve la versión normal", {
        piezaId: p.piezaId,
        enchufe: ctx.enchufe,
        tenantId: ctx.tenantId,
        motivo: err instanceof Error ? err.message : String(err),
      });
      return { ok: false };
    }
    reportarFalloPieza(err, { piezaId: p.piezaId, enchufe: ctx.enchufe, tenantId: ctx.tenantId, etapa: "cargar" });
    return { ok: false };
  }
}

function vista(p: PiezaResuelta, ctx: ContextoPieza, datos: unknown, fallback: ReactNode): ReactNode {
  const Vista = p.entrada.portada?.Vista;
  if (!Vista) return fallback;
  return (
    <BordeDePieza key={p.piezaId} piezaId={p.piezaId} fallback={fallback}>
      <Vista ctx={ctx} opciones={p.opciones} datos={datos} />
    </BordeDePieza>
  );
}

export async function Enchufe({ nombre, tenantId, slug, fallback = null, modo, agregaEnElFallback = false }: EnchufeProps) {
  const ctx: ContextoPieza = { tenantId, slug, enchufe: nombre };
  const piezas = (await resolverPiezas(tenantId, nombre)).filter((p) => p.entrada.portada);

  let cuerpo: ReactNode = modo === "agrega" ? null : fallback;
  let reemplazado = false;
  if (modo !== "agrega") {
    // La primera pieza «reemplaza» (por `orden`) que carga bien se queda con el cuerpo.
    for (const p of piezas.filter((x) => x.entrada.portada?.modo === "reemplaza")) {
      const r = await cargar(p, ctx);
      if (r.ok) {
        cuerpo = vista(p, ctx, r.datos, fallback);
        reemplazado = true;
        break;
      }
    }
  }

  const sinExtras = modo === "reemplaza" || (agregaEnElFallback && !reemplazado);
  const agregan = sinExtras ? [] : piezas.filter((x) => x.entrada.portada?.modo === "agrega");
  const extras = await Promise.all(
    agregan.map(async (p) => {
      const r = await cargar(p, ctx);
      return r.ok ? vista(p, ctx, r.datos, null) : null;
    }),
  );

  return (
    <>
      {cuerpo}
      {extras}
    </>
  );
}
