/**
 * Las dos llamadas de «Crear lotes sugeridos» (ADR-464): previsualizar qué
 * lote saldría de cada bloque y crearlos. Sin React: el modal maneja su
 * propio «cargando». La regla vive en el servidor (`ForestLotePropuestaDB`):
 * acá sólo se manda qué bloques y con qué trozas.
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import type { LoteDelBloque, PedidoPorBloque, ResultadoLotesPorBloque } from "@/lib/forestal/lotes-por-bloque";

const URL_PROPUESTAS = "/api/admin/forestal/lotes-aserrio/propuestas";

async function enviar<T>(body: unknown): Promise<T> {
  const r = await fetch(URL_PROPUESTAS, {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => null)) as (Record<string, unknown> & { message?: string; error?: string }) | null;
  if (!r.ok) {
    throw new Error(
      json?.error === "specialization_disabled"
        ? "El Libro CTP no está habilitado en este negocio."
        : (json?.message ?? json?.error ?? `El servidor respondió ${r.status}`),
    );
  }
  return json as T;
}

/** Qué lote armaría cada bloque, o por qué no. No escribe nada. */
export async function previsualizarLotesPorBloque(bloques: PedidoPorBloque[]): Promise<LoteDelBloque[]> {
  const r = await enviar<{ bloques?: LoteDelBloque[] }>({ modo: "previsualizar", bloques });
  return r.bloques ?? [];
}

/** Arma un lote por bloque. El caché del Libro se invalida: hay lotes nuevos. */
export async function crearLotesPorBloque(bloques: PedidoPorBloque[]): Promise<ResultadoLotesPorBloque> {
  const r = await enviar<ResultadoLotesPorBloque>({ modo: "crear", bloques });
  if (r.creados.length > 0) invalidarCtp("/forestal/");
  return { creados: r.creados ?? [], noCreados: r.noCreados ?? [] };
}

const URL_DISTRIBUCIONES = "/api/admin/forestal/distribuciones";

/**
 * Anota el `loteId` recién creado en los bloques de la distribución GUARDADA,
 * sin subir lo demás de la tabla (revisión de ADR-464): lo que el operador
 * cambió y no guardó sigue sin guardar, y el candado del cuadre —que mira las
 * cifras— no hace falta, porque marcar el lote no cambia ninguna. Se lee la
 * versión del servidor y se le agrega sólo el lote de cada bloque.
 */
export async function marcarLotesEnLaGuardada(id: string, loteDe: ReadonlyMap<string, string>): Promise<void> {
  await reescribirLaGuardada(id, (b) => {
    const loteId = loteDe.get(b.id);
    return !loteId || b.loteId === loteId ? null : { ...b, loteId };
  });
}

/**
 * Lo mismo para lo que el bloque escribió en el Libro (ADR-464, fases 3 y 4):
 * sus corridas, qué jornada quedó en cuál y qué líneas se completaron. Sólo
 * esos tres campos, del bloque que los cambió; el resto de la guardada queda
 * como estaba.
 */
export async function anotarLibroEnLaGuardada(
  id: string,
  bloque: Pick<BloqueRolliza, "id" | "corridaIds" | "jornadasLibro" | "complementos">,
): Promise<void> {
  await reescribirLaGuardada(id, (b) =>
    b.id !== bloque.id
      ? null
      : {
          ...b,
          corridaIds: bloque.corridaIds ?? null,
          jornadasLibro: bloque.jornadasLibro ?? null,
          complementos: bloque.complementos ?? null,
        },
  );
}

type BloqueGuardado = { id: string } & Partial<BloqueRolliza>;

/** Lee la versión del servidor, cambia los bloques que `cambio` devuelva y la vuelve a guardar. */
async function reescribirLaGuardada(id: string, cambio: (b: BloqueGuardado) => BloqueGuardado | null): Promise<void> {
  const r = await fetch(URL_DISTRIBUCIONES, { credentials: "include", cache: "no-store" });
  if (!r.ok) throw new Error(`No se pudo leer la distribución guardada (HTTP ${r.status})`);
  const { distribuciones } = (await r.json()) as {
    distribuciones?: { id: string; nombre: string; fecha: string; notas?: string | null; bloques: BloqueGuardado[] }[];
  };
  const d = distribuciones?.find((x) => x.id === id);
  if (!d) return;
  let hubo = false;
  const bloques = d.bloques.map((b) => {
    const nuevo = cambio(b);
    if (!nuevo) return b;
    hubo = true;
    return nuevo;
  });
  if (!hubo) return;
  const w = await fetch(URL_DISTRIBUCIONES, {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ id: d.id, nombre: d.nombre, fecha: d.fecha, notas: d.notas ?? null, bloques }),
  });
  if (!w.ok) throw new Error(`No se pudo anotar en la distribución guardada (HTTP ${w.status})`);
}
