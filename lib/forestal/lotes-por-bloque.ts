/**
 * «Crear lotes sugeridos» desde la Distribución de rolliza (ADR-464, fase 2).
 *
 * Un bloque traído del Libro (guía + especie + permiso) sabe sus trozas
 * (`BloqueRolliza.trozaIds`); acá se arma UN lote por bloque, acotado
 * EXACTAMENTE a esas trozas. Decisiones de Brandon (2026-10-03):
 *
 *  · **Un lote por bloque.** No por especie + permiso: dos guías de Tornillo
 *    del mismo permiso son dos bloques y dos lotes, porque cada bloque es lo
 *    que se aserró junto (y en la fase 3, cada jornada suya una producción).
 *  · **Un bloque cargado a mano NO crea lote.** No sabe de qué piezas sale, y
 *    elegírselas sería inventar el origen (T1). Se apaga con «Tráelo del Libro».
 *  · **Todo o nada.** Si UNA de sus trozas ya no puede ir a un lote, el bloque
 *    no se arma y se dice por qué: un lote con menos piezas que el bloque
 *    haría que la Distribución declare madera que el lote no tiene (I1/I2:
 *    nunca atribuir de más).
 *
 * El agrupado lo sigue haciendo `proponerLotes` (la misma regla de especie y
 * permiso que «Lotes que puedes armar»): esta función sólo decide, bloque por
 * bloque, si sus trozas forman exactamente UNA propuesta.
 *
 * PURO y client-safe: sin DB, sin React y sin `window`.
 */

import { fmtM3 } from "./cubicacion-formato";
import type { BloqueRolliza } from "./cubicacion-reparto";
import { claveEspecie } from "./loth-constants";
import { proponerLotes, type PropuestaDeLote, type TrozaParaPropuesta } from "./propuesta-de-lotes";

export { MAX_TROZAS_POR_BLOQUE } from "./cubicacion-reparto";

/** Una troza del bloque tal como la ve el servidor. */
export interface TrozaDelBloque extends TrozaParaPropuesta {
  /** Si ya está en un lote: su código (o «otro lote» si no se pudo leer). */
  enLote: string | null;
  /** Por qué no puede ir a un lote, con la regla del escritor; `null` = puede. */
  motivo: string | null;
}

/** Lo que la pantalla pide por cada bloque. */
export interface PedidoPorBloque {
  bloqueId: string;
  /** Sólo para la auditoría y las notas del lote: el nombre con que se reconoce. */
  etiqueta?: string | null;
  trozaIds: string[];
}

export type LoteDelBloque =
  | ({ bloqueId: string; listo: true } & Omit<PropuestaDeLote, "clave">)
  | { bloqueId: string; listo: false; motivo: string };

export interface LoteCreadoDeBloque {
  bloqueId: string;
  loteId: string;
  code: string;
  especie: string;
  permiso: string | null;
  trozas: number;
  m3: number;
}

export interface ResultadoLotesPorBloque {
  creados: LoteCreadoDeBloque[];
  noCreados: { bloqueId: string; motivo: string }[];
}

const texto = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t || null;
};
const mayuscula = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
/** «3 de 12 trozas» o «Sus trozas» cuando son todas. */
const cuantas = (n: number, total: number) => (n === total ? "Sus trozas" : `${n} de ${total} trozas`);
const unicos = (xs: readonly (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];

/**
 * Por qué un bloque no puede armar su lote, o `null` si sus trozas forman
 * exactamente una propuesta. El orden importa: primero lo que dice DÓNDE está
 * la madera (no existe, ya en un lote, consumida), después lo que se corrige
 * en Ingresos (guía sin recibir, sin especie, sin permiso), y al final lo que
 * es del bloque (mezcla especies o permisos).
 */
function motivoDelBloque(ids: readonly string[], trozas: readonly (TrozaDelBloque | undefined)[]): string | null {
  const total = ids.length;
  const faltan = trozas.filter((t) => !t).length;
  if (faltan > 0) {
    return `${cuantas(faltan, total)} ya no existen en este negocio: vuelve a traer el bloque del Libro.`;
  }
  const vivas = trozas as readonly TrozaDelBloque[];

  const enLote = vivas.filter((t) => t.enLote);
  if (enLote.length > 0) {
    const codigos = unicos(enLote.map((t) => t.enLote));
    return enLote.length === total && codigos.length === 1
      ? `Sus trozas ya están en el lote ${codigos[0]}: no se arma otro.`
      : `${cuantas(enLote.length, total)} ya están en ${codigos.length === 1 ? `el lote ${codigos[0]}` : `los lotes ${codigos.join(", ")}`}: un lote por bloque, sin repetir piezas.`;
  }

  const fuera = vivas.filter((t) => t.motivo);
  if (fuera.length > 0) {
    return `${cuantas(fuera.length, total)} no pueden ir a un lote: ${fuera[0]!.motivo}.`;
  }

  const sinEspecie = vivas.filter((t) => !claveEspecie(t.especieComun));
  if (sinEspecie.length > 0) {
    return `${cuantas(sinEspecie.length, total)} no tienen especie: corrígelas en Ingresos.`;
  }

  const sinPermiso = vivas.filter((t) => !texto(t.permiso));
  if (sinPermiso.length > 0) {
    const guias = unicos(sinPermiso.map((t) => texto(t.gtfNumber)));
    return `El ingreso no tiene permiso: corrígelo en Ingresos${guias.length > 0 ? ` (guía ${guias.join(", ")})` : ""}.`;
  }

  const especies = unicos(vivas.map((t) => claveEspecie(t.especieComun) || null));
  if (especies.length > 1) {
    const nombres = unicos(vivas.map((t) => texto(t.especieComun)));
    return `Mezcla ${plural(especies.length, "especie", "especies")} (${nombres.join(", ")}): un lote es de una sola especie.`;
  }

  const permisos = unicos(vivas.map((t) => texto(t.permiso)));
  if (permisos.length > 1) {
    return `Sus trozas son de ${permisos.length} permisos (${permisos.join(", ")}): un lote lleva un solo permiso.`;
  }
  return null;
}

/**
 * Un lote por bloque, en el orden en que llegan. Una troza que ya tomó un
 * bloque anterior no puede ir en otro: el segundo se apaga con su motivo (la
 * misma pieza en dos lotes sería la misma madera aserrada dos veces).
 */
export function lotesPorBloque(
  pedidos: readonly PedidoPorBloque[],
  trozas: readonly TrozaDelBloque[],
): LoteDelBloque[] {
  const porId = new Map(trozas.map((t) => [t.id, t]));
  /** Troza → etiqueta del bloque que ya la tomó. */
  const tomadas = new Map<string, string>();
  const out: LoteDelBloque[] = [];

  for (const p of pedidos) {
    const ids = [...new Set(p.trozaIds)];
    if (ids.length === 0) {
      out.push({ bloqueId: p.bloqueId, listo: false, motivo: "No sabe de qué trozas sale: tráelo del Libro." });
      continue;
    }
    const repetidas = ids.filter((id) => tomadas.has(id));
    if (repetidas.length > 0) {
      const otro = tomadas.get(repetidas[0]!) ?? "otro bloque";
      out.push({
        bloqueId: p.bloqueId,
        listo: false,
        motivo: `Comparte ${plural(repetidas.length, "troza", "trozas")} con el bloque «${otro}»: un lote por bloque, sin repetir piezas.`,
      });
      continue;
    }

    const delBloque = ids.map((id) => porId.get(id));
    const motivo = motivoDelBloque(ids, delBloque);
    if (motivo) {
      out.push({ bloqueId: p.bloqueId, listo: false, motivo: mayuscula(motivo) });
      continue;
    }

    /* La MISMA regla de agrupado que «Lotes que puedes armar»: si no da una
       sola propuesta con todas las piezas, algo se escapó a los chequeos de
       arriba y no se arma (todo o nada). */
    const { propuestas } = proponerLotes(
      (delBloque as TrozaDelBloque[]).map((t) => ({ ...t, estado: "elegible" as const })),
    );
    const unica = propuestas.length === 1 && propuestas[0]!.trozas === ids.length ? propuestas[0]! : null;
    if (!unica) {
      out.push({ bloqueId: p.bloqueId, listo: false, motivo: "Sus trozas no forman un solo lote: revísalas en Consumos." });
      continue;
    }
    for (const id of ids) tomadas.set(id, texto(p.etiqueta) ?? "sin nombre");
    out.push({
      bloqueId: p.bloqueId,
      listo: true,
      especie: unica.especie,
      especieCientifica: unica.especieCientifica,
      permiso: unica.permiso,
      titular: unica.titular,
      trozas: unica.trozas,
      m3: unica.m3,
      ptAserrable: unica.ptAserrable,
      trozaIds: unica.trozaIds,
    });
  }
  return out;
}

/* ── Lado de la pantalla: qué bloques se pueden pedir ─────────────────────── */

/**
 * Qué se puede hacer con un bloque antes de preguntarle al servidor:
 *  · `ya-tiene-lote` — ya salió de un lote o ya se le armó uno (doble consumo);
 *  · `aserrada`      — madera ya aserrada: no entra a la sierra, no lleva lote;
 *  · `manual`        — no sabe sus trozas: «Tráelo del Libro»;
 *  · `pedible`       — traído del Libro, sin lote: se le puede armar uno.
 */
export type EstadoLocalDelBloque = "ya-tiene-lote" | "aserrada" | "manual" | "pedible";

export function estadoLocalDelBloque(
  b: Pick<BloqueRolliza, "loteId" | "tipo" | "trozaIds">,
): EstadoLocalDelBloque {
  if (texto(b.loteId)) return "ya-tiene-lote";
  if (b.tipo === "aserrada") return "aserrada";
  if (!b.trozaIds || b.trozaIds.length === 0) return "manual";
  return "pedible";
}

/** El texto de un bloque que no se pide al servidor. */
export const TEXTO_ESTADO_LOCAL: Record<Exclude<EstadoLocalDelBloque, "pedible">, string> = {
  "ya-tiene-lote": "Ya tiene lote",
  aserrada: "Madera ya aserrada: no lleva lote de aserrío",
  manual: "Tráelo del Libro: un bloque cargado a mano no sabe de qué trozas sale",
};

/**
 * Lo que el bloque dice y el lote no (avisos, no bloquean): el lote nace con
 * la especie, el permiso y el m³ de SUS TROZAS, que es lo que manda en el
 * Libro. Si alguien editó el bloque en la tabla, que lo vea antes de crear.
 */
export function avisosDelBloque(
  b: Pick<BloqueRolliza, "especie" | "permiso" | "m3">,
  lote: Pick<PropuestaDeLote, "especie" | "permiso" | "m3">,
): string[] {
  const avisos: string[] = [];
  if (texto(b.especie) && claveEspecie(b.especie) !== claveEspecie(lote.especie)) {
    avisos.push(`El bloque dice ${b.especie}; sus trozas son ${lote.especie}: el lote nace de ${lote.especie}.`);
  }
  if (texto(b.permiso) && texto(b.permiso) !== texto(lote.permiso)) {
    avisos.push(`El bloque dice permiso ${b.permiso}; sus trozas son del ${lote.permiso ?? "—"}.`);
  }
  /* Tolerancia en la unidad del negocio: la GTF declara m³ a 3 decimales. */
  if (Math.abs((Number(b.m3) || 0) - lote.m3) > 0.0005) {
    avisos.push(`El bloque dice ${fmtM3(Number(b.m3) || 0)} m³; sus trozas suman ${fmtM3(lote.m3)} m³.`);
  }
  return avisos;
}
