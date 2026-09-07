/**
 * Operaciones hermanas del CTP (ADR-395): lo que se puede decidir sin base.
 *
 * Dos operaciones de la misma planta son DOS LIBROS completos y aislados —dos
 * tenants— unidos por un `grupoId` que viaja en la Ficha del CTP. Acá viven las
 * reglas puras: cómo se nombra el slug de una hermana, cuál es el grupo y qué
 * hermanas puede ver un usuario. La DB class (`forest-ctp-operaciones.db.ts`)
 * aplica estas reglas sobre datos reales.
 */

export interface OperacionHermana {
  tenantId: string;
  slug: string;
  nombre: string;
  /** `true` si el usuario que mira tiene cuenta activa ahí (puede cambiar). */
  accesible: boolean;
  /** `true` si es el libro desde el que se está mirando. */
  actual: boolean;
}

export interface GrupoOperaciones {
  grupoId: string;
  /** Todas las hermanas del grupo, incluida la actual. */
  operaciones: OperacionHermana[];
}

/** Índice del grupo en el KV: `ctp-operaciones:{grupoId}`. */
export const OPERACIONES_KEY_PREFIX = "ctp-operaciones:";

export const NOMBRE_OPERACION_MAX = 60;

/**
 * El slug de la hermana sale del slug del libro que la crea más el nombre de
 * la operación, en minúsculas y sin tildes: «blas» + «Secado» → `blas-secado`.
 * Determinista: dos personas creando «Secado» chocan en el mismo slug y la
 * segunda recibe el error de unicidad, no un libro duplicado.
 */
export function slugDeOperacion(slugBase: string, nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const base = slugBase.replace(/-op-.*$/, "").slice(0, 40);
  return `${base}-op-${limpio || "2"}`;
}

/** Un nombre válido: corto, con letras, sin espacios sobrantes. */
export function nombreDeOperacionValido(nombre: string): string | null {
  const n = nombre.trim();
  if (n.length < 2) return "Poné un nombre de al menos 2 letras";
  if (n.length > NOMBRE_OPERACION_MAX) return `Máximo ${NOMBRE_OPERACION_MAX} caracteres`;
  if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(n)) return "El nombre necesita alguna letra";
  return null;
}

/** ¿Puede este usuario cambiar a esa operación? Sólo si está en el grupo y tiene cuenta ahí. */
export function puedeCambiarA(
  grupo: GrupoOperaciones | null,
  slugDestino: string,
): OperacionHermana | null {
  const op = grupo?.operaciones.find((o) => o.slug === slugDestino) ?? null;
  return op && op.accesible && !op.actual ? op : null;
}
