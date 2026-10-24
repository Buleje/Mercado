/**
 * La lista de planes (`GET /api/admin/forestal/plan`) la piden A LA VEZ el chip
 * del libro, el tablero de Control del permiso y su contexto: eran 3 consultas
 * iguales al abrir la pantalla (6 en desarrollo, 04-10). Acá comparten la que
 * está en vuelo. Sin memoria a propósito: al terminar se olvida, así una
 * recarga después de crear o editar un plan siempre trae la lista nueva.
 */

/** El código HTTP viaja con el error: cada pantalla arma su propio mensaje. */
export class PlanesHttpError extends Error {
  constructor(readonly status: number) {
    super(`/api/admin/forestal/plan → ${status}`);
    this.name = "PlanesHttpError";
  }
}

let enVuelo: Promise<unknown> | null = null;

export function leerPlanesDelLibro(): Promise<unknown> {
  if (enVuelo) return enVuelo;
  const p = fetch("/api/admin/forestal/plan", { credentials: "include" })
    .then(async (r) => {
      if (!r.ok) throw new PlanesHttpError(r.status);
      // Igual que `leerJson`: un cuerpo que no es JSON es «sin dato», no un error.
      return (await r.json().catch(() => null)) as unknown;
    })
    .finally(() => {
      if (enVuelo === p) enVuelo = null;
    });
  enVuelo = p;
  return p;
}
