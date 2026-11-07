/**
 * Aperturas del panel — qué pantallas abre el NEGOCIO (todas las personas), por
 * día. Lo que no queda en `ActivityLog` (ahí sólo entra lo que se graba) y lo
 * que «Menú en tu orden» no sabe (ese cuenta por persona y por navegador).
 *
 * Funciones puras, compartidas por el registro del cliente
 * (`lib/admin/registro-aperturas.ts`), el guardado del servidor
 * (`aperturas-panel.server.ts`) y la pantalla «Uso del panel».
 *
 * Una clave es `tab` (la pestaña de la barra) o `tab:vista` (una sub-vista
 * dentro de ella), el mismo formato que «Menú en tu orden» (`plata:gastos`).
 * Se guarda en UN hash por negocio con dos tipos de campo:
 *   `d:<AAAA-MM-DD>:<clave>` → aperturas de ese día (HINCRBY, atómico)
 *   `u:<clave>`              → última vez (ms)
 */

/** `tab` o `tab:vista`. Acotado: cada clave distinta es un campo del hash del negocio. */
export const CLAVE_APERTURA_RE = /^[a-z0-9][a-z0-9-]{0,47}(?::[A-Za-z0-9][A-Za-z0-9._-]{0,47})?$/;

/** Cuánto se guarda: 30 días se muestran; lo de más de 35 se poda al leer. */
export const DIAS_GUARDADOS = 35;
export const DIAS_SEMANA = 7;
export const DIAS_MES = 30;

export interface AperturasDeClave {
  /** Aperturas en los últimos 7 días (hoy incluido). */
  d7: number;
  /** Aperturas en los últimos 30 días (hoy incluido). */
  d30: number;
  /** Última apertura (ms) o `null` si no hay registro. */
  ultima: number | null;
}

export interface ResumenDeAperturas {
  claves: Record<string, AperturasDeClave>;
  /** El día más viejo con datos (`AAAA-MM-DD`): «contando desde…». */
  desde: string | null;
  /** Campos de más de `DIAS_GUARDADOS` días, para podar. */
  viejos: string[];
}

export const esClaveDeApertura = (clave: string): boolean => CLAVE_APERTURA_RE.test(clave);

/** La pestaña de la barra de una clave (`plata:gastos` → `plata`). */
export const pestanaDeClave = (clave: string): string => clave.split(":", 1)[0] ?? clave;

export const campoDelDia = (dia: string, clave: string) => `d:${dia}:${clave}`;
export const campoUltima = (clave: string) => `u:${clave}`;

const DIA_MS = 86_400_000;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Días entre dos fechas `AAAA-MM-DD` (aritmética en UTC: son fechas sin hora). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);
}

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Del hash crudo (`HGETALL`) a las cifras por clave. `hoy` = el día de Lima
 * (`limaDateKey()`): a las 20:00 de Pucallpa el UTC ya es mañana.
 */
export function resumirAperturas(hash: Readonly<Record<string, unknown>> | null, hoy: string): ResumenDeAperturas {
  const claves: Record<string, AperturasDeClave> = {};
  const viejos: string[] = [];
  let desde: string | null = null;
  const de = (clave: string) => (claves[clave] ??= { d7: 0, d30: 0, ultima: null });
  /* Una «última vez» más vieja que lo guardado también se poda (y no se muestra). */
  const corte = Date.parse(`${hoy}T00:00:00Z`) - DIAS_GUARDADOS * DIA_MS;

  for (const [campo, valor] of Object.entries(hash ?? {})) {
    if (campo.startsWith("u:")) {
      const clave = campo.slice(2);
      const ultima = numero(valor);
      if (ultima > 0 && ultima < corte) viejos.push(campo);
      else if (esClaveDeApertura(clave)) de(clave).ultima = ultima || null;
      continue;
    }
    if (!campo.startsWith("d:")) continue;
    const dia = campo.slice(2, 12);
    const clave = campo.slice(13);
    if (!DIA_RE.test(dia) || campo[12] !== ":" || !esClaveDeApertura(clave)) continue;
    const hace = diasEntre(dia, hoy);
    if (hace >= DIAS_GUARDADOS) {
      viejos.push(campo);
      continue;
    }
    if (hace < 0) continue; // un día futuro (reloj corrido): no cuenta
    const n = numero(valor);
    if (n <= 0) continue;
    const fila = de(clave);
    if (hace < DIAS_MES) fila.d30 += n;
    if (hace < DIAS_SEMANA) fila.d7 += n;
    if (desde === null || dia < desde) desde = dia;
  }
  return { claves, desde, viejos };
}

/** Lo que necesita la barra para ordenar: aperturas de 30 días por PESTAÑA (sin sub-vistas). */
export function usoPorPestana(claves: Readonly<Record<string, AperturasDeClave>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [clave, a] of Object.entries(claves)) {
    if (clave.includes(":") || a.d30 <= 0) continue;
    out[clave] = a.d30;
  }
  return out;
}
