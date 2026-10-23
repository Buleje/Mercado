/**
 * Avisos de movimiento SIN tener la cámara abierta (Brandon 2026-10-23: «en
 * cámara, el de hikvision, quiero que se me aparezca notificación de
 * movimiento en segundo plano (sin ver la cámara)»). Lo de acá es puro y lo
 * usan las dos puntas: el servidor (`movimientos-nube.server.ts`) y la
 * cabecera (`components/admin/header/use-movimientos-nube.ts`).
 *
 * De dónde sale «hubo movimiento» (medido 23-10 en Blas):
 * - EZVIZ Open `alarm/list`: 0 alarmas en 7 días con la detección armada en
 *   las 2 cámaras, y `alarm/device/list` → 20002 «el aparato no existe»: las
 *   cámaras son de la cuenta de Hik-Connect for Teams, no de EZVIZ. No sirve.
 * - Hik-Connect for Teams SÍ: tiene 2 reglas «DS-2CFSP4-4G-Detección movim.»
 *   (evento 10002, una por cámara) y una COLA de alarmas: `alarm/v1/mq/subscribe`
 *   (`subscribeMode 0`) → `mq/messages` → `mq/messages/complete`. Trajo 4
 *   movimientos de «Entrada» en 4 min (07:26-07:30 Lima), cada uno con su
 *   foto (JPEG de ~108 KB), y llegaron ≤10 s después del movimiento.
 *   La cola entrega sólo lo que pasa DESPUÉS de suscribirse y repite el lote
 *   hasta que se confirma.
 *
 * El servidor la vacía cada ≥20 s por negocio y guarda 24 h; la cabecera
 * pregunta cada 45 s en cualquier pestaña del panel y cada evento nuevo entra
 * al mismo camino que el detector del mosaico (`emitirSenalCamara` con
 * `origen: "nube"` → `registrarSenal`): mismo contador, mismo mensaje, mismo
 * sonido y el aviso del sistema con la pestaña oculta.
 */
import { z } from "zod";

/** Cada cuánto pregunta la cabecera (el servidor igual no va a Hik-Connect más de 1 vez cada 20 s). */
export const CADA_MS_CLIENTE = 45_000;
/** Sin cámaras enlazadas (o sin cuenta) se vuelve a mirar cada 10 min, por si las enlazan. */
export const CADA_MS_SIN_CAMARAS = 10 * 60_000;
/** Al abrir el panel, lo de los últimos 15 min todavía avisa; lo anterior ya pasó. */
export const VENTANA_INICIAL_MS = 15 * 60_000;
/** Interruptor «Avisos de movimiento en segundo plano» (prendido salvo que diga `false`). */
export const CLAVE_AVISOS_NUBE = "camaras:avisos-nube";
/** Qué eventos ya se avisaron en este navegador (`VistosNube`): al recargar o con 2 pestañas no se repiten. */
export const CLAVE_AVISOS_NUBE_VISTOS = "camaras:avisos-nube-vistos";
/** Cuántos ids de eventos ya avisados se recuerdan (el servidor guarda 200). */
export const TOPE_VISTOS = 300;
/** Una cámara puede llegar tarde a la nube: se vuelve a pedir desde 2 min antes del último (el id deduplica). */
export const MARGEN_TARDE_MS = 2 * 60_000;

export interface MovimientoNube {
  /** El `guid` de la alarma en Hik-Connect. */
  id: string;
  camaraId: string;
  /** El nombre que la cámara tiene en el panel. */
  nombre: string;
  /** Epoch ms del inicio del movimiento. */
  at: number;
  /** Hay foto del evento (se pide a `/api/admin/camaras/movimientos/foto?id=`). */
  conFoto: boolean;
}

export interface DeteccionCamara {
  camaraId: string;
  nombre: string;
  /** Detección armada en la cámara; `null` = no se pudo saber (dormida, sin señal). */
  armada: boolean | null;
}

export interface RespuestaMovimientos {
  /** Hay cuenta de Hik-Connect y al menos una cámara enlazada. */
  vinculado: boolean;
  /** Del más nuevo al más viejo. */
  eventos: MovimientoNube[];
  deteccion: DeteccionCamara[];
  /** Quien pregunta puede prender la detección (admin o dueño). */
  puedeConfigurar: boolean;
  /** Última vez que el servidor vació la cola (epoch ms; 0 = nunca). */
  consultadoAt: number;
  /** Hik-Connect no contestó esta vez: lo guardado igual va. */
  aviso: string | null;
}

const ESQUEMA = z.object({
  vinculado: z.boolean(),
  eventos: z
    .array(
      z.object({
        id: z.string().min(1),
        camaraId: z.string().min(1),
        nombre: z.string(),
        at: z.number().finite(),
        conFoto: z.boolean(),
      }),
    )
    .max(500),
  deteccion: z.array(
    z.object({ camaraId: z.string(), nombre: z.string(), armada: z.boolean().nullable() }),
  ),
  puedeConfigurar: z.boolean(),
  consultadoAt: z.number(),
  aviso: z.string().nullable(),
});

/** Lo que contestó el servidor → la respuesta tipada, o `null` si no tiene esa forma. */
export function leerRespuestaMovimientos(raw: unknown): RespuestaMovimientos | null {
  const r = ESQUEMA.safeParse(raw);
  return r.success ? r.data : null;
}

/**
 * Lo que todavía no se avisó: ni visto (por id) ni anterior a `desde`. Del
 * más viejo al más nuevo, que es el orden en que `registrarSenal` agrupa.
 */
export function movimientosNuevos(
  eventos: readonly MovimientoNube[],
  vistos: ReadonlySet<string>,
  desde: number,
): MovimientoNube[] {
  const unicos = new Map<string, MovimientoNube>();
  for (const e of eventos) if (!vistos.has(e.id) && e.at > desde && !unicos.has(e.id)) unicos.set(e.id, e);
  return [...unicos.values()].sort((a, b) => a.at - b.at);
}

/** Los ids ya avisados, con los nuevos al final y sólo los últimos `tope`. */
export function recordarVistos(
  vistos: readonly string[],
  nuevos: readonly MovimientoNube[],
  tope = TOPE_VISTOS,
): string[] {
  const todos = [...vistos.filter((id) => !nuevos.some((n) => n.id === id)), ...nuevos.map((n) => n.id)];
  return todos.slice(-tope);
}

export interface VistosNube {
  /** El `at` del último evento avisado. */
  hasta: number;
  ids: string[];
}

/** Lo guardado en el navegador → `VistosNube` (cualquier otra cosa = nada visto). */
export function leerVistos(texto: string | null): VistosNube {
  try {
    const v = JSON.parse(texto ?? "null") as Partial<VistosNube> | null;
    const ids = Array.isArray(v?.ids) ? v.ids.filter((x): x is string => typeof x === "string") : [];
    const hasta = typeof v?.hasta === "number" && Number.isFinite(v.hasta) ? v.hasta : 0;
    return { hasta, ids: ids.slice(-TOPE_VISTOS) };
  } catch {
    return { hasta: 0, ids: [] };
  }
}

/** Desde cuándo pedir: 2 min antes del último avisado, sin ir más atrás de 15 min. */
export function pedirDesde(v: VistosNube, ahora: number): number {
  return Math.max(ahora - VENTANA_INICIAL_MS, Math.min(v.hasta, ahora) - MARGEN_TARDE_MS);
}

/** Vistos + los recién avisados. */
export function anotarVistos(v: VistosNube, nuevos: readonly MovimientoNube[], tope = TOPE_VISTOS): VistosNube {
  return {
    hasta: nuevos.reduce((m, n) => Math.max(m, n.at), v.hasta),
    ids: recordarVistos(v.ids, nuevos, tope),
  };
}

export const avisosNubePrendidosDe = (texto: string | null): boolean => texto !== "false";

/** «Patio de trozas» · «Patio de trozas y Entrada» · «3 cámaras». */
export function nombresDe(camaras: readonly { nombre: string }[]): string {
  if (camaras.length <= 1) return camaras[0]?.nombre ?? "una cámara";
  if (camaras.length === 2) return `${camaras[0].nombre} y ${camaras[1].nombre}`;
  return `${camaras.length} cámaras`;
}

/** Las cámaras con la detección APAGADA (las que no se sabe no cuentan: no se pide prender a ciegas). */
export const sinDeteccion = (d: readonly DeteccionCamara[]): DeteccionCamara[] =>
  d.filter((c) => c.armada === false);
