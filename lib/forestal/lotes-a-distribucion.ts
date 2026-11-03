/**
 * lotes-a-distribucion — VARIOS lotes llevados a la Distribución de
 * una vez (Brandon 28-10: «poder escoger varios lotes y llevar en uno solo
 * todo a repartir … se pondrá cada lote en cada fila … y observación se
 * pondrá su guía»). Un bloque por lote, cada uno con su corrida, su permiso,
 * su especie y sus guías (`bloqueDeLoteConsumido`), sembrados juntos.
 *
 * Acá vive lo que decide la barra de los lotes elegidos: cuáles van, cuáles se
 * saltan y qué se le dice al operario cuando no entraron todos.
 *
 * PURO y client-safe: sin DB, sin React y sin `window`.
 */
import type { BloqueParaDistribucion, MotivoNoLlevable } from "./bloque-de-lote-consumido";
import type { LoteAserrio } from "./lotes-aserrio";
import { loteEnConsumo, margenLote, volumenLibre } from "./lotes-aserrio";
import { permisoDelLote, trozaIdsLibresDelLote } from "./panel-lotes-reparto";
import type { BloqueSembrable } from "./sembrar-reparto";

/** Cuántos lotes arma el servidor por pedido (una lectura de corrida por lote). */
export const TOPE_LOTES_A_DISTRIBUCION = 30;

/** Lo que el servidor contesta por cada lote pedido con `?loteIds=`. */
export type ResultadoLoteADistribucion =
  | ({ loteId: string; lote: string } & Extract<BloqueParaDistribucion, { ok: true }>)
  | { loteId: string; lote: string | null; ok: false; code: MotivoNoLlevable | "NO_ENCONTRADO"; message: string };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Lo que un lote que NO está en consumo aporta a la Distribución (Brandon
 * 03-11: «va todo, sea declarada o no declarada, a repartir distribución»).
 * La MISMA regla del panel «Lotes» del cubicador (`ResumenReparto`):
 *  · con trozas libres (abierto) → su rolliza sin aserrar, al % aprovechable
 *    de la hoja, con sus trozas para registrar las jornadas;
 *  · ya declarado → lo que le falta hasta el tope del 56 % (`margenLote`, la
 *    misma cifra de su etiqueta roja «Sobra»). Ese número ya está en unidades
 *    de ASERRADA: va como bloque de aserrada directa, sin descontarlo de nuevo.
 * `null` = no le queda nada que amparar.
 */
export interface AporteDeLote {
  m3: number;
  /** El % que muestra el panel «Lotes»: `null` = el de la hoja; 100 = ya es aserrada. */
  aprovechablePct: number | null;
  /** Lo que le falta hasta el tope (aserrada), no rolliza por aserrar. */
  esMargen: boolean;
  permiso: string | null;
}

export function aporteDeLote(lote: Pick<LoteAserrio, "trozas" | "produccion" | "permiso">): AporteDeLote | null {
  const permiso = permisoDelLote(lote);
  const libre = volumenLibre(lote);
  if (libre > 1e-4) return { m3: libre, aprovechablePct: null, esMargen: false, permiso };
  const margen = margenLote(lote);
  if (margen && margen.margenM3 > 1e-4) return { m3: margen.margenM3, aprovechablePct: 100, esMargen: true, permiso };
  return null;
}

/** El bloque de ese aporte, listo para sembrar en la hoja (el id lo pone la hoja). */
export function bloqueDeAporte(
  lote: Pick<LoteAserrio, "id" | "code" | "speciesCommon" | "trozas">,
  a: AporteDeLote,
): BloqueSembrable {
  return {
    etiqueta: `Lote ${lote.code}`,
    especie: lote.speciesCommon || "",
    m3: a.m3,
    permiso: a.permiso,
    origen: "lote",
    loteId: lote.id,
    costoM3: null,
    /* El bloque recuerda las trozas libres del lote para registrar sus
       jornadas en el Libro; el margen ya aserrado no tiene. */
    trozaIds: a.esMargen ? null : trozaIdsLibresDelLote(lote),
    tipo: a.esMargen ? "aserrada" : "rolliza",
    aprovechablePct: a.esMargen ? null : a.aprovechablePct,
  };
}

/** Por qué un lote elegido NO va a la Distribución: no le queda nada que amparar. */
export function porQueNoAporta(l: Pick<LoteAserrio, "status">): string {
  if (l.status === "abierto") return "no tiene trozas libres";
  return "no le sobra nada: llegó al tope del 56 %";
}

/**
 * Los elegidos y cómo va cada uno a la Distribución: los en consumo los arma
 * el servidor (adoptan su corrida, ADR-521); los demás van de una con lo que
 * aportan (`aporteDeLote`); se saltan sólo los que no tienen nada que amparar.
 */
export function partirParaDistribucion<L extends LoteAserrio>(
  lotes: readonly L[],
): { enConsumo: L[]; directos: { lote: L; bloque: BloqueSembrable }[]; saltados: { code: string; porque: string }[] } {
  const enConsumo: L[] = [];
  const directos: { lote: L; bloque: BloqueSembrable }[] = [];
  const saltados: { code: string; porque: string }[] = [];
  for (const l of lotes) {
    if (loteEnConsumo(l)) {
      enConsumo.push(l);
      continue;
    }
    const a = aporteDeLote(l);
    if (a) directos.push({ lote: l, bloque: bloqueDeAporte(l, a) });
    else saltados.push({ code: l.code, porque: porQueNoAporta(l) });
  }
  return { enConsumo, directos, saltados };
}

/** «13-2026 (todavía no entra a la sierra) · 15-2026 (…) y 2 más», con tope. */
function listar(items: readonly { code: string; porque: string }[], tope = 3): string {
  const partes = items.slice(0, tope).map((x) => `${x.code} (${x.porque})`);
  const resto = items.length - tope;
  return `${partes.join(" · ")}${resto > 0 ? ` y ${resto} más` : ""}`;
}

/** El texto de la barra antes de llevar: cuántos van y cuántos se saltan, y por qué. */
export function ayudaDeReparto(van: number, saltados: readonly { code: string; porque: string }[]): string {
  const texto = `Lleva ${plural(van, "lote", "lotes")} a la Distribución, un bloque por lote: en consumo con su corrida, declarados con lo que les sobra y abiertos con su rolliza libre.`;
  return saltados.length > 0
    ? `${texto} Se ${saltados.length === 1 ? "salta" : "saltan"} ${saltados.length}: ${listar(saltados)}.`
    : texto;
}

/** Cómo quedó lo que se llevó: para decidir si se abre la Distribución de frente. */
export interface ResumenDeReparto {
  /** Lotes que entraron a la hoja (código). */
  entraron: string[];
  /** Lotes que ya estaban en la hoja: no se duplican. */
  repetidos: string[];
  /** Lotes que el servidor no pudo armar, con su motivo. */
  fallaron: { lote: string; message: string }[];
  /** Elegidos sin nada que amparar (no se llevaron). */
  saltados: { code: string; porque: string }[];
}

/**
 * Se abre la Distribución de frente sólo si entró todo lo elegido: si algo
 * quedó afuera, el operario lo lee primero (al navegar, el aviso se pierde).
 */
export function abrirDeFrente(r: ResumenDeReparto): boolean {
  return r.entraron.length > 0 && r.repetidos.length === 0 && r.fallaron.length === 0 && r.saltados.length === 0;
}

/** El aviso cuando NO entró todo: qué entró, qué no y por qué. `null` si entró todo. */
export function avisoDeReparto(r: ResumenDeReparto): string | null {
  if (abrirDeFrente(r)) return null;
  const partes: string[] = [];
  partes.push(
    r.entraron.length > 0
      ? `${r.entraron.length === 1 ? "Entró" : "Entraron"} a la Distribución: ${r.entraron.join(", ")}.`
      : "No entró ningún lote a la Distribución.",
  );
  if (r.repetidos.length > 0) {
    partes.push(
      `Ya ${r.repetidos.length === 1 ? "estaba" : "estaban"} en la hoja: ${r.repetidos.join(", ")} (si lo pusiste antes de consumirlo, quítalo de la hoja y vuelve a llevarlo para que tome su corrida).`,
    );
  }
  for (const f of r.fallaron.slice(0, 3)) partes.push(`${f.lote}: ${f.message}`);
  if (r.fallaron.length > 3) partes.push(`Y ${plural(r.fallaron.length - 3, "lote más", "lotes más")} que no se pudo armar.`);
  if (r.saltados.length > 0) partes.push(`No se llevaron: ${listar(r.saltados)}.`);
  return partes.join(" ");
}
