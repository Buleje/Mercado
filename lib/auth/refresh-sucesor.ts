/**
 * ¿Qué hacer cuando llega un refresh token cuyo `jti` YA se consumió?
 *
 * Brandon 2026-10-09: «cuando pongo mantener sesión activa, por alguna razón se
 * cierra sesión y tengo que volver a iniciarla». Con «mantener sesión activa»
 * el panel rota el refresh cada 4 min. Si una respuesta de rotación se pierde
 * (el servidor se reinicia a mitad, se corta el 4G, se recarga la página justo
 * en ese momento), el servidor ya consumió el token X pero el navegador sigue
 * con X: el siguiente intento, minutos después, caía como «replay» y se
 * borraban las cookies → login.
 *
 * Regla: al rotar X se anotan sus SUCESORES (los tokens emitidos a partir de
 * X). Si X vuelve fuera de la gracia y NINGÚN sucesor se usó todavía, fue una
 * respuesta perdida → se rota otra vez y se ANULAN esos sucesores sin usar
 * (nadie más puede usarlos después). Si algún sucesor YA se usó, hay dos copias
 * circulando → robo → 401 como siempre.
 *
 * Puro sobre un almacén clave/valor (el `cacheStore` del servidor en la ruta,
 * un Map en los tests).
 */

export interface AlmacenJti {
  get<T>(key: string): T | undefined | null;
  set<T>(key: string, value: T, ttlSec?: number): void;
}

export const GRACIA_CONCURRENTE_MS = 30_000;
/**
 * Hasta cuándo se acepta «la respuesta se perdió» (revisión de seguridad
 * 2026-10-09): sin tope, una copia robada de un token ya rotado entraba días
 * después si el dueño había cerrado sesión o suspendido el equipo. 10 min
 * cubren la renovación de cada 4 min de «mantener sesión activa».
 */
export const VENTANA_PERDIDA_MS = 10 * 60_000;
const TTL_SEG = 7 * 24 * 60 * 60;
/** Marca de consumo de un token anulado: un sucesor que nunca debe aceptarse. */
const ANULADO = -1;
/** Marca de un token cerrado por logout: cuenta como USADO (la cadena murió). */
const CERRADO = -2;

const claveConsumo = (jti: string) => `refresh-jti:consumed:${jti}`;
const claveSucesores = (jti: string) => `refresh-jti:successors:${jti}`;

export type DecisionReuso =
  /** Primer uso: rotar normal. */
  | { tipo: "primero" }
  /** Dentro de la gracia: pedidos simultáneos del mismo navegador. */
  | { tipo: "concurrente" }
  /** Fuera de la gracia y ningún sucesor usado: la respuesta anterior se perdió. */
  | { tipo: "respuesta-perdida"; anular: string[] }
  /** Un sucesor ya se usó (o el token fue anulado): dos copias → no rotar. */
  | { tipo: "robo" };

/** Decide y deja anotado el consumo del primer uso. */
export function decidirReuso(almacen: AlmacenJti, jti: string, ahora: number): DecisionReuso {
  const consumido = almacen.get<number>(claveConsumo(jti));
  if (typeof consumido !== "number") {
    almacen.set(claveConsumo(jti), ahora, TTL_SEG);
    return { tipo: "primero" };
  }
  if (consumido < 0) return { tipo: "robo" }; // ANULADO o CERRADO
  if (ahora - consumido <= GRACIA_CONCURRENTE_MS) return { tipo: "concurrente" };
  if (ahora - consumido > VENTANA_PERDIDA_MS) return { tipo: "robo" };
  const sucesores = almacen.get<string[]>(claveSucesores(jti)) ?? [];
  /* Un sucesor anulado por una pérdida anterior no cuenta como uso: si se
     pierden dos respuestas seguidas, sigue siendo el mismo navegador. */
  const algunoUsado = sucesores.some((s) => {
    const c = almacen.get<number>(claveConsumo(s));
    return typeof c === "number" && c !== ANULADO;
  });
  if (algunoUsado) return { tipo: "robo" };
  return { tipo: "respuesta-perdida", anular: sucesores };
}

/** Tras emitir el token nuevo a partir de `jti`, anotarlo como su sucesor. */
export function anotarSucesor(almacen: AlmacenJti, jti: string, sucesor: string): void {
  const actuales = almacen.get<string[]>(claveSucesores(jti)) ?? [];
  almacen.set(claveSucesores(jti), [...actuales, sucesor].slice(-10), TTL_SEG);
}

/** Anula sucesores que nunca se usaron: si alguien los presenta, es robo. */
export function anularSucesores(almacen: AlmacenJti, jtis: readonly string[]): void {
  for (const s of jtis) almacen.set(claveConsumo(s), ANULADO, TTL_SEG);
}

/** Logout: el refresh de la cookie queda muerto (y su cadena: cuenta como sucesor usado). */
export function cerrarRefresh(almacen: AlmacenJti, jti: string): void {
  almacen.set(claveConsumo(jti), CERRADO, TTL_SEG);
}
