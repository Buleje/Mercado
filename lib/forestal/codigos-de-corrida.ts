/**
 * Los códigos de troza que se escribieron al cubicar UNA corrida (ADR-408).
 *
 * El código es una anotación interna del cubicado: vive con las piezas en el
 * `localStorage` de su espacio y **no se manda al servidor**
 * (`codigo-de-troza.ts`). Eso está bien mientras se está cubicando, pero cuando
 * la corrida ya se declaró ese espacio se vuelve a usar para la siguiente
 * jornada — y los códigos de la corrida de ayer se pierden con ella.
 *
 * Acá se guardan **atados a su corrida**, y por eso hay una clave por
 * `corridaId` y no una lista suelta: pegarle a la corrida A los códigos que se
 * escribieron cubicando la B sería fabricar un origen, que es exactamente lo
 * que esta mejora no hace.
 *
 * ## Sigue sin ser trazabilidad
 *
 * Es un apunte del navegador, no un dato del libro: no viaja al servidor, no
 * consume trozas y no se presenta ante nadie. Sirve para **pre-armar** la
 * propuesta de vinculación (`proponer-vinculacion`) y nada más; la vinculación
 * sigue siendo un acto explícito que alguien confirma.
 *
 * Como es del navegador, se declara en un equipo y se puede vincular en otro:
 * si no hay códigos anotados la pantalla lo dice, no inventa una propuesta.
 */

import { codigosDeLoCubicado } from "./propuesta-de-vinculacion";

/** Cuántas corridas se recuerdan: más que esto ya no se vincula, se archiva. */
const TOPE_CORRIDAS = 60;

/** Una libreta por tenant — dos negocios en el mismo navegador no se mezclan. */
const clave = (): string => {
  let slug = "main";
  try {
    slug = localStorage.getItem("active-tenant-slug") ?? "main";
  } catch {
    /* modo privado o storage deshabilitado: la libreta queda en la de `main` y
       lo peor que pasa es que no haya propuesta. */
  }
  return `buleje-codigos-corrida-${slug}`;
};

interface Anotacion {
  codigos: string[];
  /** Cuándo se anotó: para soltar las más viejas cuando se llena. */
  at: string;
}

type Libreta = Record<string, Anotacion>;

function leerLibreta(): Libreta {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(clave());
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Libreta;
  } catch {
    return {};
  }
}

function escribirLibreta(libreta: Libreta): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(clave(), JSON.stringify(libreta));
  } catch {
    /* quota: perder el apunte no puede romper la declaración de una corrida. */
  }
}

/**
 * Anota los códigos que se escribieron cubicando esta corrida.
 *
 * Se llama DESPUÉS de declarar, cuando la corrida ya tiene su id. Sin códigos
 * reales no escribe nada: una entrada vacía haría que la pantalla dijera «hay
 * propuesta» sobre una propuesta de cero trozas.
 */
export function recordarCodigosDeCorrida(
  corridaId: string,
  piezas: readonly { codigo?: string | null }[],
): void {
  const codigos = codigosDeLoCubicado(piezas);
  if (!corridaId || codigos.length === 0) return;
  const libreta = leerLibreta();
  libreta[corridaId] = { codigos, at: new Date().toISOString() };

  /* Se sueltan las más viejas por fecha: la libreta no puede crecer sin fin en
     un navegador que se usa todos los días. */
  const ids = Object.keys(libreta);
  if (ids.length > TOPE_CORRIDAS) {
    ids
      .sort((a, b) => (libreta[a]?.at ?? "").localeCompare(libreta[b]?.at ?? ""))
      .slice(0, ids.length - TOPE_CORRIDAS)
      .forEach((id) => delete libreta[id]);
  }
  escribirLibreta(libreta);
}

/** Los códigos anotados para esa corrida. Vacío = no hay nada que proponer. */
export function codigosRecordados(corridaId: string): string[] {
  if (!corridaId) return [];
  const anotacion = leerLibreta()[corridaId];
  return Array.isArray(anotacion?.codigos) ? anotacion.codigos.filter((c) => typeof c === "string") : [];
}

/** Se olvidan al vincular: ya cumplieron y la corrida tiene su origen escrito. */
export function olvidarCodigosDeCorrida(corridaId: string): void {
  if (!corridaId) return;
  const libreta = leerLibreta();
  if (!(corridaId in libreta)) return;
  delete libreta[corridaId];
  escribirLibreta(libreta);
}
