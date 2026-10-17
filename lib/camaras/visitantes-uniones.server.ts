import "server-only";
import { z } from "zod";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { DIAS_RETENCION_PERSONAS_MAX } from "./personas-retencion";
import type { UnionVisitantes } from "./visitantes";

/**
 * «Es el mismo que…» (ADR-479): las correcciones a mano del agrupado de
 * visitantes, por día. El agrupado se arma cada vez que se lee; lo único que
 * se guarda es «el grupo B es el mismo que el A» por la clave de cada grupo
 * (`<docId>#<caja>` de su primera aparición, estable dentro del día).
 *
 * Dónde: UNA clave de `PlatformSetting` por negocio (como la retención de
 * Personas en `CamarasDB`), sin cambiar el schema. En el servidor y no en el
 * navegador porque la corrección cambia el conteo del día, que se ve desde
 * cualquier equipo (el celular del dueño y la PC). Los días más viejos que la
 * retención máxima (60 d) se podan al escribir: sus fotos ya no existen.
 */

const CLAVE = (tenantId: string) => `camaras-visitantes-uniones:${tenantId}`;
/** Tope por día: una corrección a mano por visitante alcanza y sobra. */
export const MAX_UNIONES_POR_DIA = 200;

export const claveGrupoSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}#\d{1,2}$/);
export const diaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const unionSchema = z.object({ a: claveGrupoSchema, b: claveGrupoSchema });
const guardadoSchema = z.record(diaSchema, z.array(unionSchema).max(MAX_UNIONES_POR_DIA));
type Guardado = z.infer<typeof guardadoSchema>;

function leerGuardado(valor: unknown): Guardado {
  const r = guardadoSchema.safeParse(valor);
  return r.success ? r.data : {};
}

/** El día más viejo que se conserva (los anteriores se podan). */
function diaMasViejo(hoy: string): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - DIAS_RETENCION_PERSONAS_MAX);
  return d.toISOString().slice(0, 10);
}

/** Puro: agrega `a ← b` al día (sin repetir ni ida y vuelta) y poda lo vencido. */
export function sumarUnion(guardado: Guardado, dia: string, u: UnionVisitantes, hoy: string): Guardado | null {
  if (u.a === u.b) return null;
  const lista = guardado[dia] ?? [];
  if (lista.some((x) => (x.a === u.a && x.b === u.b) || (x.a === u.b && x.b === u.a))) return null;
  if (lista.length >= MAX_UNIONES_POR_DIA) return null;
  const limite = diaMasViejo(hoy);
  const podado = Object.fromEntries(Object.entries(guardado).filter(([d]) => d >= limite));
  return { ...podado, [dia]: [...lista, u] };
}

/** Puro: saca toda unión del día que nombre a `clave` (lo vuelve un visitante aparte). */
export function quitarUniones(guardado: Guardado, dia: string, clave: string): Guardado | null {
  const lista = guardado[dia] ?? [];
  const quedan = lista.filter((x) => x.a !== clave && x.b !== clave);
  if (quedan.length === lista.length) return null;
  const { [dia]: _fuera, ...resto } = guardado;
  return quedan.length > 0 ? { ...resto, [dia]: quedan } : resto;
}

export async function leerUniones(tenantId: string, dia: string): Promise<UnionVisitantes[]> {
  return leerGuardado(await PlatformSettingsDB.get<unknown>(CLAVE(tenantId)))[dia] ?? [];
}

/** `true` si quedó guardada (repetida o al tope = `false`, sin error: no cambia nada). */
export async function unirVisitantes(
  tenantId: string,
  dia: string,
  u: UnionVisitantes,
  hoy: string,
  usuario: string,
): Promise<boolean> {
  return PlatformSettingsDB.actualizar<unknown, boolean>(
    CLAVE(tenantId),
    (actual) => {
      const nuevo = sumarUnion(leerGuardado(actual), dia, u, hoy);
      return nuevo ? { valor: nuevo, resultado: true } : { resultado: false };
    },
    usuario,
  );
}

export async function separarVisitante(tenantId: string, dia: string, clave: string, usuario: string): Promise<boolean> {
  return PlatformSettingsDB.actualizar<unknown, boolean>(
    CLAVE(tenantId),
    (actual) => {
      const nuevo = quitarUniones(leerGuardado(actual), dia, clave);
      return nuevo ? { valor: nuevo, resultado: true } : { resultado: false };
    },
    usuario,
  );
}
