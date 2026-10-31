/**
 * lotes-a-distribucion — VARIOS lotes en consumo llevados a la Distribución de
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
import { loteEnConsumo } from "./lotes-aserrio";

/** Cuántos lotes arma el servidor por pedido (una lectura de corrida por lote). */
export const TOPE_LOTES_A_DISTRIBUCION = 30;

/** Lo que el servidor contesta por cada lote pedido con `?loteIds=`. */
export type ResultadoLoteADistribucion =
  | ({ loteId: string; lote: string } & Extract<BloqueParaDistribucion, { ok: true }>)
  | { loteId: string; lote: string | null; ok: false; code: MotivoNoLlevable | "NO_ENCONTRADO"; message: string };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

type LoteDeLaBarra = Pick<LoteAserrio, "id" | "code" | "status" | "produccion" | "corridas">;

/** Por qué un lote elegido NO va a la Distribución (no está «en consumo»). */
export function porQueNoEstaEnConsumo(l: Pick<LoteAserrio, "status">): string {
  if (l.status === "abierto") return "todavía no entra a la sierra";
  if (l.status === "cerrado") return "ya está cerrado";
  return "ya declaró su producción";
}

/** Los elegidos que van (en consumo) y los que se saltan, con su porqué. */
export function partirParaDistribucion<L extends LoteDeLaBarra>(
  lotes: readonly L[],
): { enConsumo: L[]; saltados: { code: string; porque: string }[] } {
  const enConsumo: L[] = [];
  const saltados: { code: string; porque: string }[] = [];
  for (const l of lotes) {
    if (loteEnConsumo(l)) enConsumo.push(l);
    else saltados.push({ code: l.code, porque: porQueNoEstaEnConsumo(l) });
  }
  return { enConsumo, saltados };
}

/** «13-2026 (todavía no entra a la sierra) · 15-2026 (…) y 2 más», con tope. */
function listar(items: readonly { code: string; porque: string }[], tope = 3): string {
  const partes = items.slice(0, tope).map((x) => `${x.code} (${x.porque})`);
  const resto = items.length - tope;
  return `${partes.join(" · ")}${resto > 0 ? ` y ${resto} más` : ""}`;
}

/** El texto de la barra antes de llevar: cuántos van y cuántos se saltan, y por qué. */
export function ayudaDeReparto(enConsumo: number, saltados: readonly { code: string; porque: string }[]): string {
  const van = `Lleva ${plural(enConsumo, "lote en consumo", "lotes en consumo")} a la Distribución: un bloque por lote, con su guía en la observación.`;
  return saltados.length > 0
    ? `${van} Se ${saltados.length === 1 ? "salta" : "saltan"} ${saltados.length}: ${listar(saltados)}.`
    : van;
}

/** Cómo quedó lo que se llevó: para decidir si se abre la Distribución de frente. */
export interface ResumenDeReparto {
  /** Lotes que entraron a la hoja (código). */
  entraron: string[];
  /** Lotes que ya estaban en la hoja: no se duplican. */
  repetidos: string[];
  /** Lotes que el servidor no pudo armar, con su motivo. */
  fallaron: { lote: string; message: string }[];
  /** Elegidos que no estaban en consumo (no se pidieron). */
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
  if (r.saltados.length > 0) partes.push(`No están en consumo: ${listar(r.saltados)}.`);
  return partes.join(" ");
}
