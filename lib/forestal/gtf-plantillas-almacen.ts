/**
 * El almacén de las plantillas de guía de un negocio (`gtf-plantillas.ts`):
 * una lista con tope, nombres sin repetir y la cuenta de usos. Se guarda en un
 * `PlatformSetting` por tenant (`ForestGtfPlantillasDB`), sin migración.
 *
 * Cada acción es una función pura sobre la lista que lee la DB class DENTRO de
 * su lock (`PlatformSettingsDB.actualizar`): dos PCs que guardan a la vez no
 * se pisan. Las plantillas van en un ARRAY y se buscan por `id`; ningún dato
 * del cliente se usa como clave de un objeto («__proto__», «constructor»).
 *
 * PURO: sin Prisma.
 */

import { z } from "zod";
import { contenidoPlantillaSchema, plantillaSchema, type PlantillaGuia } from "./gtf-plantillas";

/** Plantillas por negocio: alcanzan para cada permiso × destino de verdad. */
export const TOPE_PLANTILLAS = 40;
/** Lo que pesa el almacén entero, en caracteres de JSON. */
export const TOPE_BYTES = 200_000;

const nombreSchema = z.string().trim().min(1, "Ponle un nombre.").max(80, "El nombre va hasta 80 letras.");
const idSchema = z.string().trim().min(1).max(64);

/** Lo que manda la pantalla en el PUT. */
export const accionPlantillaSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("crear"), nombre: nombreSchema, contenido: contenidoPlantillaSchema }),
  /** «Actualizar con lo de ahora»: mismos bloques, datos nuevos. */
  z.object({ accion: z.literal("actualizar"), id: idSchema, contenido: contenidoPlantillaSchema }),
  z.object({ accion: z.literal("renombrar"), id: idSchema, nombre: nombreSchema }),
  z.object({ accion: z.literal("duplicar"), id: idSchema }),
  z.object({ accion: z.literal("usar"), id: idSchema }),
  z.object({ accion: z.literal("borrar"), id: idSchema }),
]);
export type AccionPlantilla = z.infer<typeof accionPlantillaSchema>;

export type ErrorAlmacen = "no_existe" | "nombre_repetido" | "tope" | "muy_grande";

export type ResultadoAlmacen =
  | { ok: true; lista: PlantillaGuia[]; plantilla: PlantillaGuia | null }
  | { ok: false; error: ErrorAlmacen };

/** Lee lo guardado con desconfianza: lo que no valida se descarta, sin tirar. */
export function normalizarAlmacen(raw: unknown): PlantillaGuia[] {
  const lista =
    raw != null && typeof raw === "object" && Object.hasOwn(raw, "plantillas") ? (raw as { plantillas: unknown }).plantillas : null;
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const r: PlantillaGuia[] = [];
  for (const x of lista) {
    const p = plantillaSchema.safeParse(x);
    if (!p.success || vistos.has(p.data.id)) continue;
    vistos.add(p.data.id);
    r.push(p.data);
  }
  return r;
}

/** Lo que se graba en el `PlatformSetting`. */
export const almacenDe = (lista: readonly PlantillaGuia[]) => ({ v: 1, plantillas: lista });

/** Las usadas hace menos primero; después las tocadas hace menos. */
export function ordenarPlantillas(lista: readonly PlantillaGuia[]): PlantillaGuia[] {
  return [...lista].sort(
    (a, b) => (b.usadaEn ?? "").localeCompare(a.usadaEn ?? "") || b.actualizadaEn.localeCompare(a.actualizadaEn) || a.nombre.localeCompare(b.nombre, "es"),
  );
}

const clave = (n: string) => n.trim().toLocaleLowerCase("es").replace(/\s+/g, " ");
const nombreTomado = (lista: readonly PlantillaGuia[], nombre: string, salvo?: string) =>
  lista.some((p) => p.id !== salvo && clave(p.nombre) === clave(nombre));

/** «X (copia)», «X (copia 2)»… el primero libre, dentro de los 80. */
export function nombreDeCopia(lista: readonly PlantillaGuia[], nombre: string): string {
  for (let i = 1; i < 1000; i++) {
    const cola = i === 1 ? " (copia)" : ` (copia ${i})`;
    const n = `${nombre.slice(0, 80 - cola.length)}${cola}`;
    if (!nombreTomado(lista, n)) return n;
  }
  return `${nombre.slice(0, 60)} (${Date.now()})`;
}

function cerrar(lista: PlantillaGuia[], plantilla: PlantillaGuia | null): ResultadoAlmacen {
  if (JSON.stringify(almacenDe(lista)).length > TOPE_BYTES) return { ok: false, error: "muy_grande" };
  return { ok: true, lista, plantilla };
}

/**
 * Aplica una acción a la lista. `nuevoId` lo pone el servidor (crear y
 * duplicar); `en` es la hora ISO y `por`, quién.
 */
export function aplicarAccion(
  lista: readonly PlantillaGuia[],
  a: AccionPlantilla,
  ctx: { en: string; por: string; nuevoId: string },
): ResultadoAlmacen {
  if (a.accion === "crear") {
    if (lista.length >= TOPE_PLANTILLAS) return { ok: false, error: "tope" };
    if (nombreTomado(lista, a.nombre)) return { ok: false, error: "nombre_repetido" };
    const nueva: PlantillaGuia = {
      id: ctx.nuevoId,
      nombre: a.nombre.trim(),
      contenido: a.contenido,
      creadaEn: ctx.en,
      creadaPor: ctx.por.slice(0, 120),
      actualizadaEn: ctx.en,
      usadaEn: null,
      usos: 0,
    };
    return cerrar([...lista, nueva], nueva);
  }
  const i = lista.findIndex((p) => p.id === a.id);
  if (i < 0) return { ok: false, error: "no_existe" };
  const actual = lista[i];
  const con = (p: PlantillaGuia | null) => {
    const r = [...lista];
    if (p) r[i] = p;
    else r.splice(i, 1);
    return r;
  };
  switch (a.accion) {
    case "actualizar": {
      const p: PlantillaGuia = { ...actual, contenido: a.contenido, actualizadaEn: ctx.en };
      return cerrar(con(p), p);
    }
    case "renombrar": {
      if (nombreTomado(lista, a.nombre, a.id)) return { ok: false, error: "nombre_repetido" };
      const p: PlantillaGuia = { ...actual, nombre: a.nombre.trim(), actualizadaEn: ctx.en };
      return cerrar(con(p), p);
    }
    case "duplicar": {
      if (lista.length >= TOPE_PLANTILLAS) return { ok: false, error: "tope" };
      const p: PlantillaGuia = {
        ...actual,
        id: ctx.nuevoId,
        nombre: nombreDeCopia(lista, actual.nombre),
        creadaEn: ctx.en,
        creadaPor: ctx.por.slice(0, 120),
        actualizadaEn: ctx.en,
        usadaEn: null,
        usos: 0,
      };
      return cerrar([...lista, p], p);
    }
    case "usar": {
      const p: PlantillaGuia = { ...actual, usadaEn: ctx.en, usos: actual.usos + 1 };
      return cerrar(con(p), p);
    }
    case "borrar":
      return cerrar(con(null), null);
  }
}
