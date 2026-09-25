/**
 * Declarar una libreta que trae piezas de VARIOS dueños (Brandon, 2026-09-23:
 * «que proponga 2 registros solos»).
 *
 * En «Producir sin lote» cada pieza ya dice de quién es (`dueno` y, si se
 * eligió del Directorio, `duenoParteId` — ADR-430). Pero «Declarar» pedía UN
 * servicio para toda la libreta y al registrar la vaciaba entera: una jornada
 * con madera de WASACO y madera del centro se declaraba mezclada bajo un solo
 * dueño —y se le cobraba el aserrío de todo a uno— o había que borrar piezas a
 * mano antes de declarar.
 *
 * Acá se parte la libreta en un grupo por dueño. Se declara UN grupo a la vez:
 * su resumen, sus paquetes y su cobro salen sólo de sus piezas, y al
 * registrarlo salen de la libreta sólo ésas. El siguiente queda listo.
 *
 * PURO y client-safe: lo usan el modal «Declarar producción» y la libreta.
 */
import type { PiezaCubicada } from "./cubicacion";
import { claveDueno } from "./duenos-cubicador";

/** La clave del grupo de lo que no tiene dueño escrito. */
export const CLAVE_SIN_DUENO = "sin-dueno";

export interface GrupoDeDueno {
  /** `parte:<id>` (con ficha del Directorio) · `nombre:<clave>` (escrito a mano) · `sin-dueno`. */
  clave: string;
  /** Como se escribió la primera vez; `null` = sin dueño. */
  nombre: string | null;
  /** La ficha del Directorio; `null` = sin ficha (nombre a mano o sin dueño). */
  parteId: string | null;
  piezas: PiezaCubicada[];
  /** Piezas (Σ cantidad), PT y m³ — lo que dice el botón para elegirlo. */
  cantidad: number;
  pt: number;
  m3: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Lo mismo que descarta `paquetesDeLoCubicado`: sin cantidad o sin volumen no se declara. */
const esDeclarable = (p: PiezaCubicada) => p.cantidad > 0 && (p.m3 ?? 0) > 0;

/**
 * Parte lo cubicado en un grupo por dueño, en el orden en que apareció cada
 * uno; «sin dueño» va al final.
 *
 *  - Con ficha (`duenoParteId`) manda la ficha: dos grafías de la misma ficha
 *    son un dueño.
 *  - Sin ficha, el nombre normalizado (`claveDueno`): «Wasacó» y «WASACO» son
 *    uno. Si ese nombre es el de UNA sola ficha de la libreta, la pieza va con
 *    ella: es la pieza cubicada antes de atarle la ficha, no otro dueño. Con dos
 *    fichas del mismo nombre no se adivina: queda aparte.
 *  - Lo que no se puede declarar (cantidad o volumen 0) no arma grupo: un botón
 *    «0 pzas» no se puede registrar.
 */
export function gruposPorDueno(piezas: readonly PiezaCubicada[]): GrupoDeDueno[] {
  const declarables = piezas.filter(esDeclarable);
  const fichasPorNombre = new Map<string, Set<string>>();
  for (const p of declarables) {
    const id = p.duenoParteId?.trim();
    const k = claveDueno(p.dueno);
    if (!id || !k) continue;
    const s = fichasPorNombre.get(k) ?? new Set<string>();
    s.add(id);
    fichasPorNombre.set(k, s);
  }

  const grupos = new Map<string, GrupoDeDueno>();
  for (const p of declarables) {
    const id = p.duenoParteId?.trim() || null;
    const k = claveDueno(p.dueno);
    const fichas = k ? fichasPorNombre.get(k) : undefined;
    const parteId = id ?? (fichas?.size === 1 ? [...fichas][0] : null);
    const clave = parteId ? `parte:${parteId}` : k ? `nombre:${k}` : CLAVE_SIN_DUENO;
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, nombre: null, parteId, piezas: [], cantidad: 0, pt: 0, m3: 0 };
      grupos.set(clave, g);
    }
    /* El nombre: el de la primera pieza que lo trae escrito. */
    if (!g.nombre && k) g.nombre = (p.dueno ?? "").trim();
    g.piezas.push(p);
    g.cantidad += p.cantidad;
    g.pt += p.pieTablar ?? 0;
    g.m3 += p.m3 ?? 0;
  }

  const lista = [...grupos.values()].map((g) => ({ ...g, pt: r2(g.pt), m3: r4(g.m3) }));
  return [
    ...lista.filter((g) => g.clave !== CLAVE_SIN_DUENO),
    ...lista.filter((g) => g.clave === CLAVE_SIN_DUENO),
  ];
}

/**
 * El servicio que se PROPONE para un grupo (nunca se impone: se puede cambiar).
 * Con ficha del Directorio, las piezas son de ese cliente: aserrío a su cuenta.
 * Sin ficha —nombre a mano o sin dueño— no se propone nada: suponer «propia»
 * es la respuesta que nadie revisa, y un nombre sin cuenta no tiene a quién
 * cargarle el cobro.
 */
export function servicioPropuesto(
  grupo: Pick<GrupoDeDueno, "parteId"> | null,
): { servicio: "tercero"; parteId: string } | null {
  return grupo?.parteId ? { servicio: "tercero", parteId: grupo.parteId } : null;
}

/** «WASACO» o «Sin dueño»: cómo se nombra un grupo en la pantalla y en el mensaje. */
export const etiquetaDeGrupo = (g: Pick<GrupoDeDueno, "nombre" | "parteId">): string =>
  g.nombre ?? (g.parteId ? "Cuenta del Directorio" : "Sin dueño");

/**
 * Las filas guardadas de la libreta sin las que se acaban de declarar.
 *
 * Recibe lo que haya en el `localStorage` (JSON de cualquier época) y sólo
 * quita las filas cuyo `id` se declaró; el resto viaja tal cual, con los campos
 * que tenga. `null` = lo guardado no es una lista: no hay nada que tocar.
 */
export function filasSinLasDeclaradas(guardado: unknown, ids: readonly string[]): unknown[] | null {
  if (!Array.isArray(guardado)) return null;
  const fuera = new Set(ids);
  return guardado.filter((f) => {
    const id = f && typeof f === "object" ? (f as { id?: unknown }).id : undefined;
    return !(typeof id === "string" && fuera.has(id));
  });
}
