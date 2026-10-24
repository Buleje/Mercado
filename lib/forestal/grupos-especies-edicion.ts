/**
 * Editar los grupos de especies de la planta (ADR-430) — las reglas del editor.
 *
 * Los grupos los arma el dueño («Duras: Anacaspi, Shihuahuaco») y los reusan la
 * tarifa de la planta y el precio de cada cliente. La regla que importa es la
 * decisión 2 de Brandon: **cada especie está en UN solo grupo**. Si estuviera
 * en dos, un cliente con precio para los dos grupos tendría dos precios para la
 * misma madera y nadie sabría cuál se cobró.
 *
 * Por eso el editor no «agrega» una especie a un grupo: la MUDA. Si ya estaba en
 * otro, sale de ahí, y quien llama recibe de dónde salió para decirlo en
 * pantalla. Un aviso que no se da es un precio que cambia en silencio.
 *
 * PURO: sin React ni fetch. Lo prueban los tests sin montar nada.
 */
import { claveEspecie } from "./loth-constants";
import type { GrupoEspecies, GruposEspeciesInput } from "./precio-cliente";

/** Tope del esquema (`gruposEspeciesSchema`): 50 grupos, nombres de hasta 60. */
export const MAX_GRUPOS = 50;
const MAX_NOMBRE = 60;

export interface ResultadoEdicion {
  grupos: GrupoEspecies[];
  /** Motivo por el que no se hizo el cambio, en palabras del patio. */
  error: string | null;
}

/** El grupo al que pertenece una especie (por su clave), o `null`. */
export function grupoConClave(
  grupos: readonly GrupoEspecies[],
  clave: string,
): GrupoEspecies | null {
  return grupos.find((g) => g.claves.includes(clave)) ?? null;
}

/**
 * Un id corto y nuevo: la tarifa del cliente guarda el precio contra ESTE id,
 * así que renombrar el grupo no le borra el precio a nadie.
 */
export function nuevoIdGrupo(
  grupos: readonly GrupoEspecies[],
  semilla: () => string = aleatorio,
): string {
  for (let i = 0; i < 20; i += 1) {
    const id = `g-${semilla()}`.slice(0, 40);
    if (!grupos.some((g) => g.id === id)) return id;
  }
  return `g-${Date.now().toString(36)}-${grupos.length}`;
}

function aleatorio(): string {
  return Math.random().toString(36).slice(2, 10);
}

function motivoNombre(
  grupos: readonly GrupoEspecies[],
  nombre: string,
  excepto?: string,
): string | null {
  const limpio = nombre.trim();
  if (!limpio) return "Ponle un nombre al grupo: «Duras», «Blandas»…";
  if (limpio.length > MAX_NOMBRE) return `El nombre del grupo va hasta ${MAX_NOMBRE} letras.`;
  const clave = claveEspecie(limpio);
  const otro = grupos.find((g) => g.id !== excepto && claveEspecie(g.nombre) === clave);
  return otro ? `Ya hay un grupo «${otro.nombre}».` : null;
}

export function crearGrupo(
  grupos: readonly GrupoEspecies[],
  nombre: string,
  semilla?: () => string,
): ResultadoEdicion & { id: string | null } {
  if (grupos.length >= MAX_GRUPOS) {
    return { grupos: [...grupos], error: `Hasta ${MAX_GRUPOS} grupos por planta.`, id: null };
  }
  const error = motivoNombre(grupos, nombre);
  if (error) return { grupos: [...grupos], error, id: null };
  const id = nuevoIdGrupo(grupos, semilla);
  return { grupos: [...grupos, { id, nombre: nombre.trim(), claves: [] }], error: null, id };
}

/** El nombre se escribe tal cual (con sus espacios mientras se tipea); se valida al guardar. */
export function renombrarGrupo(
  grupos: readonly GrupoEspecies[],
  id: string,
  nombre: string,
): GrupoEspecies[] {
  return grupos.map((g) => (g.id === id ? { ...g, nombre } : g));
}

export function borrarGrupo(grupos: readonly GrupoEspecies[], id: string): GrupoEspecies[] {
  return grupos.filter((g) => g.id !== id);
}

/**
 * Pone la especie en el grupo `grupoId` y la saca de cualquier otro.
 *
 * `desde` es el grupo del que salió (o `null` si no estaba en ninguno o ya
 * estaba en éste): la pantalla lo usa para avisar la mudanza.
 */
export function moverEspecie(
  grupos: readonly GrupoEspecies[],
  grupoId: string,
  especie: string,
): { grupos: GrupoEspecies[]; desde: GrupoEspecies | null } {
  const clave = claveEspecie(especie);
  if (!clave || !grupos.some((g) => g.id === grupoId)) return { grupos: [...grupos], desde: null };
  const desde = grupos.find((g) => g.id !== grupoId && g.claves.includes(clave)) ?? null;
  return {
    grupos: grupos.map((g) =>
      g.id === grupoId
        ? { ...g, claves: g.claves.includes(clave) ? g.claves : [...g.claves, clave] }
        : { ...g, claves: g.claves.filter((k) => k !== clave) },
    ),
    desde,
  };
}

export function quitarEspecie(
  grupos: readonly GrupoEspecies[],
  grupoId: string,
  clave: string,
): GrupoEspecies[] {
  return grupos.map((g) =>
    g.id === grupoId ? { ...g, claves: g.claves.filter((k) => k !== clave) } : g,
  );
}

/**
 * A la forma que valida `gruposEspeciesSchema` y guarda el servidor: con el
 * NOMBRE de cada especie (el servidor lo normaliza a su clave). Se manda el
 * nombre y no la clave para que un error del servidor diga «Anacaspi» y no
 * «anacaspi».
 */
export function gruposAInput(
  grupos: readonly GrupoEspecies[],
  nombreDe: (clave: string) => string | undefined,
): GruposEspeciesInput {
  return grupos.map((g) => ({
    id: g.id,
    nombre: g.nombre.trim(),
    especies: g.claves.map((k) => nombreDe(k) ?? k),
  }));
}

/** ¿Hay algo distinto de lo guardado? El orden de las especies no cuenta. */
export function gruposCambiaron(a: readonly GrupoEspecies[], b: readonly GrupoEspecies[]): boolean {
  const firma = (gs: readonly GrupoEspecies[]) =>
    JSON.stringify(gs.map((g) => [g.id, g.nombre.trim(), [...g.claves].sort()]));
  return firma(a) !== firma(b);
}

/**
 * El primer problema de la lista entera antes de guardar, o `null`. Mismo
 * criterio que el esquema del servidor, dicho en castellano (el mensaje por
 * defecto de Zod para un nombre vacío sale en inglés).
 */
export function motivoDeGrupos(grupos: readonly GrupoEspecies[]): string | null {
  for (const g of grupos) {
    const m = motivoNombre(grupos, g.nombre, g.id);
    if (m) return g.nombre.trim() ? m : "Hay un grupo sin nombre: ponle uno o bórralo.";
  }
  return null;
}
