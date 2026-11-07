/**
 * Modo TV (2026-10-07), lo puro: cómo se reparte la pantalla, qué visor le
 * toca a cada cámara, cómo se mueve el foco con las flechas del control
 * remoto y cómo se escribe el código para leerlo a 3 m.
 */

import { camposPuente } from "@/components/admin/forestal/camaras/puente-pc";
import {
  estadoDeConexion,
  type CamaraConConexion,
} from "@/components/admin/forestal/camaras/conexion-camara";

/** Cuántas cámaras entran en el mosaico sin scroll (4×4). */
export const TV_MAX_CUADROS = 16;
/** Sin tocar el control, las de Hik-Connect se pausan: despiertan la cámara solar y gastan su chip. */
export const TV_MINUTOS_NUBE = 30;
/** Sin mover el mouse, el cursor se esconde. */
export const TV_CURSOR_MS = 3_000;
/** Cada cuánto se vuelve a pedir la lista: trae altas, bajas y la desconexión desde el panel. */
export const TV_RECARGA_MS = 60_000;

/** 1 · 2×1 · 2×2 · 3×3 · 4×4 según cuántas haya. */
export function columnasMosaico(n: number): number {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

export function filasMosaico(n: number): number {
  const c = columnasMosaico(n);
  return Math.max(1, Math.ceil(Math.min(n, TV_MAX_CUADROS) / c));
}

/** «ABC234» → «ABC 234»: dos bloques de 3 se leen de lejos y se dictan sin perderse. */
export function separarCodigo(codigo: string): string {
  const c = codigo.replace(/\s/g, "");
  return c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c;
}

/**
 * Qué visor le toca: la MISMA regla que «En vivo» del panel (`BotonEnVivo`):
 * visor propio (puente de la PC, o conexión directa) > nube de Hik-Connect >
 * nada (en el panel abre la app; en un TV no hay app que abrir).
 */
export type TipoVisorTv = "puente" | "propio" | "nube" | "sin-vivo";

export function tipoDeVisorTv(camara: object, enlazadaNube: boolean): TipoVisorTv {
  if (camposPuente(camara).fuente === "puente_pc") return "puente";
  if (estadoDeConexion(camara as CamaraConConexion).tipo === "conectada") return "propio";
  if (enlazadaNube) return "nube";
  return "sin-vivo";
}

export interface CamaraTv {
  id: string;
  nombre: string;
  tipo: TipoVisorTv;
  /** Hik-Connect: ¿tiene el código de verificación cargado? Sin él, una cámara cifrada no se ve. */
  conCodigo: boolean;
}

/**
 * La lista de `GET /api/tv/camaras`: cada cámara trae `nubeEnlazada` (si está
 * enlazada con Hik-Connect). Los campos sensibles llegan vacíos (`token`,
 * `conexion.host`/`usuario`…): nada de acá depende de ellos.
 */
export function camarasParaTv(lista: readonly Record<string, unknown>[]): CamaraTv[] {
  return lista
    .filter((c) => typeof c.id === "string" && c.activa !== false)
    .map((c) => ({
      id: c.id as string,
      nombre: typeof c.nombre === "string" && c.nombre ? c.nombre : "Cámara",
      tipo: tipoDeVisorTv(c, c.nubeEnlazada === true),
      /* El TV no recibe el dato: se asume cargado y, si falla, se muestra el error de Hikvision. */
      conCodigo: c.conCodigo !== false,
    }));
}

/* ── El foco con las flechas del control remoto ─────────────────────────── */

export type DireccionTv = "izquierda" | "derecha" | "arriba" | "abajo";

export interface Caja {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

const FLECHAS: Record<string, DireccionTv> = {
  ArrowLeft: "izquierda",
  ArrowRight: "derecha",
  ArrowUp: "arriba",
  ArrowDown: "abajo",
  Left: "izquierda",
  Right: "derecha",
  Up: "arriba",
  Down: "abajo",
};
export const direccionDeTecla = (key: string): DireccionTv | null => FLECHAS[key] ?? null;

/**
 * «Atrás» del control: Escape y Backspace en la PC, `GoBack`/`BrowserBack`,
 * 10009 en Samsung (Tizen) y 461 en LG (webOS).
 */
export function esTeclaAtras(key: string, keyCode: number): boolean {
  return (
    key === "Escape" ||
    key === "Backspace" ||
    key === "GoBack" ||
    key === "BrowserBack" ||
    keyCode === 10009 ||
    keyCode === 461
  );
}

/**
 * El vecino más cercano en esa dirección: entre los que quedan del lado
 * pedido, gana el de menor distancia en el eje del movimiento, con el desvío
 * lateral pesando el doble (así «abajo» no salta en diagonal a otra columna
 * habiendo uno justo debajo). `-1` = no hay nada de ese lado.
 */
export function siguienteFoco(desde: Caja, candidatos: readonly Caja[], dir: DireccionTv): number {
  const cx = desde.x + desde.ancho / 2;
  const cy = desde.y + desde.alto / 2;
  let mejor = -1;
  let puntaje = Number.POSITIVE_INFINITY;
  candidatos.forEach((c, i) => {
    const dx = c.x + c.ancho / 2 - cx;
    const dy = c.y + c.alto / 2 - cy;
    const principal = dir === "derecha" ? dx : dir === "izquierda" ? -dx : dir === "abajo" ? dy : -dy;
    const lateral = dir === "derecha" || dir === "izquierda" ? Math.abs(dy) : Math.abs(dx);
    if (principal <= 1) return;
    const p = principal + lateral * 2;
    if (p < puntaje) {
      puntaje = p;
      mejor = i;
    }
  });
  return mejor;
}
