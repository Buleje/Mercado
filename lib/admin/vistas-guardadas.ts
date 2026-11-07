/**
 * Vistas guardadas de cualquier pantalla del panel (M07 de la noche 17-10):
 * lo que tienes puesto —búsqueda, filtros, orden de columnas— con un nombre,
 * para volver con un clic. Unas vienen del sistema (la primera es la
 * estándar); las tuyas son POR USUARIO y viven en este navegador: guardar o
 * borrar la tuya no cambia la de nadie del equipo, y «Estándar» siempre te
 * devuelve a la de fábrica.
 *
 * La Lista de Pedidos (P08, `OrdersTab/vistas-pedidos.ts`) ya las usa:
 * nombre de hasta 40 letras, no se llama como una del sistema, tope de 12,
 * el mismo nombre la reemplaza.
 *
 * Genérico y puro (sin React ni `window`): cada pantalla dice qué es su estado
 * y cómo se valida lo leído (`__tests__/vistas-guardadas.test.ts`).
 */

export interface VistaDelSistema<T> {
  id: string;
  nombre: string;
  /** Una línea para el menú. */
  ayuda?: string;
  estado: T;
}

export interface VistaGuardada<T> {
  id: string;
  nombre: string;
  estado: T;
  /** Cuándo se guardó (ms). */
  en: number;
}

/** Cuántas puede guardar cada usuario por pantalla: el menú tiene que entrar. */
export const TOPE_VISTAS = 12;
export const LARGO_NOMBRE = 40;

const comparable = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** El nombre como se guarda: sin espacios de más y de hasta 40 letras. */
export function nombreLimpio(nombre: string): string {
  return nombre.replace(/\s+/g, " ").trim().slice(0, LARGO_NOMBRE);
}

/**
 * Guarda lo que se ve con un nombre. Devuelve la lista nueva o el motivo por
 * el que no se pudo (en palabras de la persona). El mismo nombre (sin mirar
 * tildes ni mayúsculas) reemplaza a la vista que ya tenía ese nombre.
 */
export function guardarVista<T>(
  lista: readonly VistaGuardada<T>[],
  nombre: string,
  estado: T,
  sistema: readonly { nombre: string }[],
  ahora = Date.now(),
): { lista: VistaGuardada<T>[]; error: null; reemplazo: boolean } | { lista: null; error: string } {
  const limpio = nombreLimpio(nombre);
  if (!limpio) return { lista: null, error: "Ponle un nombre a la vista" };
  const clave = comparable(limpio);
  const delSistema = sistema.find((v) => comparable(v.nombre) === clave);
  if (delSistema) return { lista: null, error: `«${delSistema.nombre}» ya es una vista del sistema: usa otro nombre` };
  const previa = lista.find((v) => comparable(v.nombre) === clave);
  if (previa) {
    return {
      lista: lista.map((v) => (v.id === previa.id ? { ...v, nombre: limpio, estado, en: ahora } : v)),
      error: null,
      reemplazo: true,
    };
  }
  if (lista.length >= TOPE_VISTAS) {
    return { lista: null, error: `Ya tienes ${TOPE_VISTAS} vistas: borra una para guardar otra` };
  }
  return { lista: [...lista, { id: `v-${ahora.toString(36)}`, nombre: limpio, estado, en: ahora }], error: null, reemplazo: false };
}

export function borrarVista<T>(lista: readonly VistaGuardada<T>[], id: string): VistaGuardada<T>[] {
  return lista.filter((v) => v.id !== id);
}

/** Lo guardado, validado: un JSON viejo, roto o de otra versión no rompe la pantalla. */
export function leerVistas<T>(raw: string | null, valida: (estado: unknown) => estado is T): VistaGuardada<T>[] {
  if (!raw) return [];
  try {
    const datos: unknown = JSON.parse(raw);
    if (!Array.isArray(datos)) return [];
    return datos
      .filter((v): v is VistaGuardada<T> => {
        if (typeof v !== "object" || v === null) return false;
        const c = v as Record<string, unknown>;
        return typeof c.id === "string" && typeof c.nombre === "string" && c.nombre.trim() !== "" &&
          typeof c.en === "number" && valida(c.estado);
      })
      .slice(0, TOPE_VISTAS);
  } catch {
    return [];
  }
}

/** JSON con las claves en orden: dos estados iguales dan el mismo texto. */
export function firmaEstable(valor: unknown): string {
  return JSON.stringify(valor, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/**
 * La vista que coincide con lo que se ve (para marcarla con un tilde), o
 * `null` si lo puesto es «a mano». Primero las del sistema.
 */
export function vistaActual<T>(
  sistema: readonly VistaDelSistema<T>[],
  guardadas: readonly VistaGuardada<T>[],
  estado: T,
  firma: (estado: T) => string = firmaEstable,
): { id: string; nombre: string } | null {
  const f = firma(estado);
  const v = sistema.find((s) => firma(s.estado) === f) ?? guardadas.find((g) => firma(g.estado) === f);
  return v ? { id: v.id, nombre: v.nombre } : null;
}
