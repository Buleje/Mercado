"use client";

/**
 * Enchufe `forestal.guia-impresa` (ADR-457): suma a la GTF de salida lo que
 * agreguen las piezas que el negocio tiene prendidas.
 *
 * La guía es lo que se declara ante SERFOR, así que el contrato es angosto:
 * · las tres copias oficiales (`cuerpos[0..2]`) salen IDÉNTICAS, con o sin
 *   piezas — las hojas nuevas van DESPUÉS;
 * · cada hoja va en un contenedor que la recorta a su caja, su HTML pasa por
 *   DOMPurify y su CSS por postcss: lo que intente moverse fuera de la hoja,
 *   cargar algo de afuera o ejecutar código RECHAZA la pieza entera
 *   (`barrera-guia.ts`, endurecida tras la auditoría de seguridad del 01-10);
 * · el pie extra es texto plano (el armazón del documento lo escapa);
 * · todo con tope de 2 s: si una pieza tarda o tira, la guía sale como siempre
 *   y se avisa a Sentry. Esta función NUNCA tira.
 */
import { piezasDelNegocio } from "@/hooks/use-enabled-specs";
import { PIEZAS_CLIENTE } from "@/extensiones/registro.cliente";
import { TOPE_PIEZA_MS, type AgregadoGuia, type ContextoPieza, type DocGuiaImpresa } from "@/extensiones/_contrato";
import { cssEncerrado, hojaEnvuelta, hojaSana, PiezaRechazada } from "./barrera-guia";
import { conTope, reportarFalloPieza } from "./tope";

export { cssEncerrado, hojaSana, ESTILO_CONTENEDOR } from "./barrera-guia";

const ENCHUFE = "forestal.guia-impresa" as const;

/** Lo mínimo de `DocumentoGtfSalida` que este enchufe toca (evita importar el módulo de la guía). */
export interface DocumentoConHojas {
  cuerpos: string[];
  css: string;
  titulo: string;
  pieCorrido: string;
}

const MAX_HOJAS_POR_PIEZA = 4;
const MAX_PIE = 200;
const ID_PIEZA = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Las hojas de una pieza, sanitizadas, o `PiezaRechazada`. */
async function hojasSanas(hojas: unknown): Promise<string[]> {
  if (hojas === undefined) return [];
  if (!Array.isArray(hojas) || hojas.length > MAX_HOJAS_POR_PIEZA) {
    throw new PiezaRechazada(`hojasExtra debe ser una lista de hasta ${MAX_HOJAS_POR_PIEZA} hojas`);
  }
  const sanas: string[] = [];
  for (const h of hojas) sanas.push(await hojaSana(h));
  return sanas;
}

function pieSano(pie: unknown): string {
  if (pie === undefined || pie === "") return "";
  if (typeof pie !== "string") throw new PiezaRechazada("pieExtra debe ser texto");
  return pie.replace(/\s+/g, " ").trim().slice(0, MAX_PIE);
}

/** Copia congelada: la pieza no puede tocar lo que ya se usó para las copias oficiales. */
function congelar<T>(v: T): T {
  const copia: T = typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));
  const helar = (o: unknown): void => {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const k of Object.keys(o)) helar((o as Record<string, unknown>)[k]);
    }
  };
  helar(copia);
  return copia;
}

async function aplicar(doc: DocumentoConHojas, entrada: DocGuiaImpresa): Promise<DocumentoConHojas> {
  const { negocio, piezas } = await piezasDelNegocio(ENCHUFE);
  if (piezas.length === 0 || !negocio) return doc;

  const ctx: ContextoPieza = Object.freeze({ tenantId: negocio.tenantId, slug: negocio.slug, enchufe: ENCHUFE });
  const hojas: string[] = [];
  let css = "";
  const pies: string[] = [];

  for (const asignada of piezas) {
    const donde = { piezaId: asignada.piezaId, enchufe: ENCHUFE, tenantId: negocio.tenantId };
    try {
      // El id va en una clase y en el `@scope`: sólo ids kebab-case del registro.
      const reg = ID_PIEZA.test(asignada.piezaId) ? PIEZAS_CLIENTE[asignada.piezaId] : undefined;
      if (!reg?.guia || !reg.manifiesto.enchufes.includes(ENCHUFE)) {
        throw new Error(`La pieza ${asignada.piezaId} no tiene hoja en este navegador`);
      }
      // El servidor ya las validó; se vuelve a pasar el Zod porque la pieza
      // corre con lo que diga SU manifiesto, no con lo que llegó por la red.
      const op = reg.manifiesto.opciones.safeParse(asignada.opciones);
      if (!op.success) throw new Error(`Opciones inválidas: ${op.error.issues.map((i) => i.message).join("; ")}`);

      const pieza = await reg.guia();
      const agregado: AgregadoGuia = pieza.agregar(ctx, op.data, congelar(entrada));
      // Se valida TODO antes de sumar nada: una pieza a medias no se imprime.
      const suyas = await hojasSanas(agregado?.hojasExtra);
      const suCss = await cssEncerrado(agregado?.cssExtra, asignada.piezaId);
      const suPie = pieSano(agregado?.pieExtra);

      hojas.push(...suyas.map((h) => hojaEnvuelta(asignada.piezaId, h)));
      css += suCss;
      if (suPie) pies.push(suPie);
    } catch (err) {
      reportarFalloPieza(err, { ...donde, etapa: "agregar" });
    }
  }

  if (hojas.length === 0 && !css && pies.length === 0) return doc;
  return {
    ...doc,
    cuerpos: [...doc.cuerpos, ...hojas],
    css: doc.css + css,
    pieCorrido: pies.length ? `${doc.pieCorrido} · ${pies.join(" · ")}` : doc.pieCorrido,
  };
}

/**
 * La guía con lo que agreguen las piezas prendidas del negocio. Si no hay
 * piezas, o algo falla o tarda más de 2 s, devuelve la guía tal cual.
 */
export async function aplicarPiezasGuia<D extends DocumentoConHojas>(doc: D, entrada: DocGuiaImpresa): Promise<D> {
  try {
    const r = await conTope(aplicar(doc, entrada), TOPE_PIEZA_MS, "las piezas de la guía");
    return { ...doc, cuerpos: r.cuerpos, css: r.css, pieCorrido: r.pieCorrido };
  } catch (err) {
    reportarFalloPieza(err, { enchufe: ENCHUFE, etapa: "agregar" });
    return doc;
  }
}
