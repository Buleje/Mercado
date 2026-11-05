/**
 * lib/papeles/vista-panel.ts — cómo se lee en el panel la lista de papeles que
 * emitió el negocio (ADR-534, pestaña Documentos › Papeles emitidos). Puro y
 * client-safe: agrupa las versiones de cada número, cuenta por estado y filtra.
 *
 * Regla de versiones (la misma del servidor): de un número, la fila más nueva
 * (`createdAt`) es la vigente; las demás son versiones anteriores. Una vigente
 * anulada sigue siendo la vigente.
 */
import { ETIQUETA_TIPO_PAPEL, TIPOS_PAPEL, type EstadoPapel, type TipoPapel } from "./registro";
import type { PapelEmitidoPanel } from "@/lib/db/papeles-emitidos.db";

export type PapelDelPanel = PapelEmitidoPanel;

export interface GrupoDePapel {
  numero: string;
  /** La versión que vale hoy (la más nueva). */
  vigente: PapelDelPanel;
  /** Las anteriores, de la más nueva a la más vieja. */
  anteriores: PapelDelPanel[];
}

/** Lo que se puede elegir arriba de la tabla. `todos` no filtra. */
export type FiltroEstadoPapel = "todos" | "oficial" | "revision" | "borrador" | "anulado";
export const FILTROS_ESTADO_PAPEL: readonly FiltroEstadoPapel[] = ["todos", "oficial", "revision", "borrador", "anulado"];

export const ROTULO_ESTADO_PAPEL: Record<EstadoPapel, string> = {
  oficial: "Oficial",
  revision: "En revisión",
  borrador: "Borrador",
  reemplazado: "Reemplazado",
  anulado: "Anulado",
};

export const ROTULO_FILTRO_PAPEL: Record<FiltroEstadoPapel, string> = {
  todos: "Todos",
  oficial: "Oficiales",
  revision: "En revisión",
  borrador: "Borradores",
  anulado: "Anulados",
};

const esTipo = (t: string): t is TipoPapel => (TIPOS_PAPEL as readonly string[]).includes(t);

/** «Estado de cuenta»; un tipo que el panel no conoce sale con su título guardado. */
export function rotuloTipoPapel(p: Pick<PapelDelPanel, "tipo" | "titulo">): string {
  return esTipo(p.tipo) ? ETIQUETA_TIPO_PAPEL[p.tipo] : p.titulo || p.tipo;
}

const masNuevoPrimero = (a: PapelDelPanel, b: PapelDelPanel): number =>
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

/**
 * Un grupo por número, con su vigente y sus versiones anteriores. Los grupos
 * salen del que se movió último al más viejo (por la vigente).
 */
export function agruparPapeles(papeles: readonly PapelDelPanel[]): GrupoDePapel[] {
  const porNumero = new Map<string, PapelDelPanel[]>();
  for (const p of papeles) {
    const lista = porNumero.get(p.numero);
    if (lista) lista.push(p);
    else porNumero.set(p.numero, [p]);
  }
  const grupos: GrupoDePapel[] = [];
  for (const [numero, lista] of porNumero) {
    const [vigente, ...anteriores] = [...lista].sort(masNuevoPrimero);
    if (vigente) grupos.push({ numero, vigente, anteriores });
  }
  return grupos.sort((a, b) => masNuevoPrimero(a.vigente, b.vigente));
}

/** Cuántos papeles (por su versión vigente) hay en cada filtro. */
export function contarPorEstado(grupos: readonly GrupoDePapel[]): Record<FiltroEstadoPapel, number> {
  const c: Record<FiltroEstadoPapel, number> = { todos: grupos.length, oficial: 0, revision: 0, borrador: 0, anulado: 0 };
  for (const g of grupos) {
    const e = g.vigente.estado;
    if (e === "oficial" || e === "revision" || e === "borrador" || e === "anulado") c[e] += 1;
  }
  return c;
}

/** Por estado de la vigente y por texto (número, código o tipo, sin tildes ni mayúsculas). */
export function filtrarPapeles(grupos: readonly GrupoDePapel[], estado: FiltroEstadoPapel, texto: string): GrupoDePapel[] {
  const q = sinTildes(texto.trim());
  return grupos.filter((g) => {
    if (estado !== "todos" && g.vigente.estado !== estado) return false;
    if (!q) return true;
    const donde = [g.numero, g.vigente.codigo, rotuloTipoPapel(g.vigente), ...g.anteriores.map((a) => a.codigo)].join(" ");
    return sinTildes(donde).includes(q);
  });
}

function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * El total como se imprime: «S/ 3,568.00» o «US$ 120.00». `null` = el papel no
 * lleva total (carta, solicitud…).
 */
export function totalDelPapel(p: Pick<PapelDelPanel, "total" | "moneda">): string | null {
  if (p.total == null) return null;
  const n = Number(p.total);
  if (!Number.isFinite(n)) return null;
  const cifra = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${p.moneda === "USD" ? "US$" : "S/"} ${cifra}`;
}

/**
 * Página pública del QR, en su forma corta (`<base>/p/<código>`, ADR-486/534).
 * `base` = la de `useBaseVerificacion` (`https://<host>/v` o `…/v/<código del
 * negocio>`): así abre ESTE negocio aunque el panel esté en otra dirección.
 * Sin la clave del QR la página muestra tipo, número, fecha y estado, nunca el total.
 */
export function enlaceVerificacion(base: string, codigo: string): string {
  return `${base.replace(/\/+$/, "")}/p/${encodeURIComponent(codigo)}`;
}
