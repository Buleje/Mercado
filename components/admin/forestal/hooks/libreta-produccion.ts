/**
 * La libreta de «Producir sin lote» y los precios de venta recordados (ADR-429).
 *
 * ## Vaciar la libreta al registrar
 *
 * Lo cubicado vive en el `localStorage` del espacio `-ctp-produccion` (lo
 * escribe `CubicadorMadera`) y antes seguía ahí DESPUÉS de registrar: reabrir el
 * modal mostraba las mismas piezas listas para declararlas —y cobrarlas— otra
 * vez. Medido en el ADR: es el camino del doble cobro. Registrar ahora la vacía.
 * Con piezas de varios dueños se declara uno a la vez y sólo salen las suyas
 * (`quitarDeLaLibretaProduccion`, 2026-09-23).
 *
 * ## De cuándo es lo cubicado (radar 2026-09-15)
 *
 * Cerrar el modal sin declarar deja las piezas ahí, y nada decía de qué día
 * eran. Al lado de las filas (`{clave}-cuando`) se guarda cuándo entró la
 * primera, cuándo la última y la jornada que se eligió; la decisión de avisar
 * es de `lib/forestal/cubicado-de-otro-dia.ts`. Lo guardado antes no trae nada
 * y se lee como «sin fecha».
 *
 * La clave se arma igual que en `CubicadorMadera` (`buleje-cubicacion-{slug}{espacio}`,
 * el slug al medio): si divergen, el vaciado borra una clave que nadie lee y
 * el doble cobro vuelve callado. El test de la pantalla lo cubre.
 *
 * ## Precio de venta recordado
 *
 * Madera propia: el precio por especie que se usó la última vez se ofrece como
 * sugerido (ADR-418 rechazó un catálogo de precios de venta). Se ofrece, no se
 * escribe solo: un precio que nadie tipeó no puede terminar valorizando nada.
 */
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { quitarAsignaciones, type ApartadosAsignados } from "@/lib/forestal/cubicacion-apartados";
import { filasSinLasDeclaradas } from "@/lib/forestal/declarar-por-dueno";
import { logger } from "@/lib/logger";
import { SIN_TENANT, slugKey, tenantSlugActivo } from "@/lib/forestal/sembrar-reparto";
import type { CuandoCubicado } from "@/lib/forestal/cubicado-de-otro-dia";

/** El espacio propio del cubicador de «Producir sin lote» — otra libreta, la misma pantalla. */
export const ESPACIO_PRODUCCION = "-ctp-produccion";

/** La misma clave que `CubicadorMadera` usa para las filas de este espacio (`slugKey`: sin operación, nunca la de «main»). */
export const claveLibretaProduccion = (): string => slugKey(ESPACIO_PRODUCCION);

const claveCuando = (): string => `${claveLibretaProduccion()}-cuando`;

/** Lo guardado sobre cuándo se cubicó; `null` si no hay nada (o no se puede leer). */
export function leerCuandoLibretaProduccion(): CuandoCubicado | null {
  if (typeof window === "undefined") return null;
  try {
    const v: unknown = JSON.parse(localStorage.getItem(claveCuando()) ?? "null");
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const o = v as Record<string, unknown>;
    const texto = (x: unknown) => (typeof x === "string" && x ? x : undefined);
    return {
      desde: texto(o.desde),
      ultima: texto(o.ultima),
      jornada: texto(o.jornada),
      sinFechaOk: o.sinFechaOk === true,
    };
  } catch {
    return null;
  }
}

function escribirCuando(v: CuandoCubicado): void {
  try {
    localStorage.setItem(claveCuando(), JSON.stringify(v));
  } catch (err) {
    logger.warn("[declarar-produccion] no se pudo guardar de cuándo es lo cubicado", {
      error: String(err),
    });
  }
}

/**
 * La jornada que la pantalla tiene elegida AHORA (la registra el aviso mientras
 * está montado). Cuando entra la primera pieza de una tanda nueva se guarda esa
 * jornada junto a ella: quien elige el sábado y recién después cubica no debe ver
 * un aviso por haber cubicado «el lunes».
 */
let jornadaVigente: string | null = null;
export function recordarJornadaVigente(iso: string | null): void {
  jornadaVigente = iso;
}

/**
 * Anota que la libreta cambió AHORA. Se llama justo ANTES de escribir las filas
 * nuevas (`filasNuevas` = cuántas van a quedar), porque necesita ver cuántas
 * había: con la libreta vacía entra «la primera pieza» (`desde`) y empieza una
 * marca nueva; con filas de antes y sin marca, lo cubicado sigue «sin fecha» —no
 * se inventa un día—. Sin piezas no queda de qué día hablar y la marca se borra.
 * Idempotente: el cubicador la puede llamar dos veces por el mismo cambio.
 */
export function sellarLibretaProduccion(filasNuevas: number): void {
  if (typeof window === "undefined") return;
  if (filasNuevas === 0) {
    try {
      localStorage.removeItem(claveCuando());
    } catch {
      /* Sin almacenamiento tampoco había marca que borrar. */
    }
    return;
  }
  let habia = 0;
  try {
    const filas: unknown = JSON.parse(localStorage.getItem(claveLibretaProduccion()) ?? "null");
    habia = Array.isArray(filas) ? filas.length : 0;
  } catch {
    habia = 0;
  }
  const ahora = new Date().toISOString();
  escribirCuando(
    habia === 0
      ? { desde: ahora, ultima: ahora, jornada: jornadaVigente ?? undefined }
      : { ...(leerCuandoLibretaProduccion() ?? {}), ultima: ahora },
  );
}

/** La persona eligió esta jornada: se recuerda junto a lo cubicado. */
export function fijarJornadaLibretaProduccion(iso: string): void {
  if (typeof window === "undefined") return;
  escribirCuando({ ...(leerCuandoLibretaProduccion() ?? {}), jornada: iso });
}

/** «Es de esta fecha»: lo cubicado sin día queda atado a la jornada elegida. */
export function confirmarSinFechaLibretaProduccion(iso: string): void {
  if (typeof window === "undefined") return;
  escribirCuando({ ...(leerCuandoLibretaProduccion() ?? {}), jornada: iso, sinFechaOk: true });
}

/**
 * Borra las filas cubicadas y sus apartados (que apuntan a ids de esas filas).
 * Las preferencias del espacio —columnas, orden, dueños, nombres de apartado—
 * quedan: son de quien cubica, no de la jornada que se acaba de declarar.
 */
export function vaciarLibretaProduccion(): void {
  if (typeof window === "undefined") return;
  const clave = claveLibretaProduccion();
  try {
    localStorage.removeItem(clave);
    localStorage.removeItem(`${clave}-apartados`);
    localStorage.removeItem(claveCuando());
  } catch (err) {
    /* Si esto falla la producción YA quedó registrada; lo que queda en riesgo
       es declararla dos veces al reabrir, así que se deja rastro. */
    logger.warn("[declarar-produccion] no se pudo vaciar la libreta", { error: String(err) });
  }
}

/**
 * Quita de la libreta SÓLO las piezas que se acaban de declarar (un dueño de
 * varios, `lib/forestal/declarar-por-dueno.ts`): las de los otros dueños quedan
 * para el siguiente registro. Sus apartados se van con ellas; los de las que
 * quedan, no. Si no queda ninguna fila, se vacía como siempre.
 *
 * Quien la llama vuelve a montar el cubicador para que lea la libreta así.
 */
export function quitarDeLaLibretaProduccion(ids: readonly string[]): void {
  if (typeof window === "undefined" || ids.length === 0) return;
  const clave = claveLibretaProduccion();
  try {
    const filas = filasSinLasDeclaradas(JSON.parse(localStorage.getItem(clave) ?? "null"), ids);
    if (!filas || filas.length === 0) {
      vaciarLibretaProduccion();
      return;
    }
    localStorage.setItem(clave, JSON.stringify(filas));
    const apartados: unknown = JSON.parse(localStorage.getItem(`${clave}-apartados`) ?? "null");
    if (apartados && typeof apartados === "object" && !Array.isArray(apartados)) {
      localStorage.setItem(
        `${clave}-apartados`,
        JSON.stringify(quitarAsignaciones(apartados as ApartadosAsignados, [...ids])),
      );
    }
  } catch (err) {
    /* Igual que al vaciar: lo declarado YA está en el Libro; lo que queda en
       riesgo es volver a declararlo al reabrir, así que se deja rastro. */
    logger.warn("[declarar-produccion] no se pudieron quitar las piezas declaradas", {
      error: String(err),
    });
  }
}

const clavePrecios = (): string => `buleje-precio-venta-pt-${tenantSlugActivo() ?? SIN_TENANT}`;

/** Último precio de venta usado, S/ por PT, por clave de especie. */
export function preciosDeVentaRecordados(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(clavePrecios());
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isFinite(n) && n > 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/** Guarda los precios que SÍ se usaron; los que quedaron sin precio no pisan el anterior. */
export function recordarPreciosDeVenta(
  precios: readonly { especie: string; precioPt: number | null }[],
): void {
  if (typeof window === "undefined") return;
  const previos = preciosDeVentaRecordados();
  for (const p of precios) {
    const k = claveEspecie(p.especie);
    if (k && p.precioPt != null && p.precioPt > 0) previos[k] = p.precioPt;
  }
  try {
    localStorage.setItem(clavePrecios(), JSON.stringify(previos));
  } catch (err) {
    logger.warn("[declarar-produccion] no se pudo recordar el precio de venta", {
      error: String(err),
    });
  }
}
