/**
 * Registro liviano de aperturas del panel (cliente). Cada pestaña (`tab`) o
 * sub-vista (`tab:vista`) se manda UNA vez por sesión del navegador: lo ya
 * mandado queda en `sessionStorage`, que vive lo que vive la pestaña del
 * navegador (sobrevive a recargar, no a cerrarla). Las nuevas se juntan y salen
 * en un solo POST cuando dejas de moverte (`DEMORA_MS`), o ya si escondes o
 * cierras la pestaña (`keepalive`).
 *
 * Nunca bloquea la navegación: no se espera nada, un error sólo se loguea.
 * Guardado en el servidor: `app/api/admin/uso-panel`.
 */
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { esClaveDeApertura } from "@/lib/admin/aperturas-panel";

export const URL_USO_PANEL = "/api/admin/uso-panel";
/** Con `admin-`: `lib/tenant-cache.ts` lo borra al cambiar de negocio, y lo mandado era del anterior. */
const LLAVE_SESION = "admin-aperturas-enviadas";
/** Se espera a que dejes de moverte: pasar por cinco pestañas sale en un envío. */
export const DEMORA_MS = 3_000;
/** Sin esperar más que esto aunque sigas navegando sin parar. */
export const ESPERA_MAXIMA_MS = 10_000;
/** Igual que el `max` del POST. */
export const TOPE_POR_ENVIO = 20;
/** `/admin` o `/t/<negocio>/admin` (`useAdminTenantPath`). */
const EN_EL_PANEL = /^(?:\/t\/[^/]+)?\/admin(?:\/|$)/;

const pendientes = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let primeraPendiente = 0;
let enviadasEnMemoria: Set<string> | null = null;
let vaciadoInstalado = false;

function enviadas(): Set<string> {
  if (enviadasEnMemoria) return enviadasEnMemoria;
  try {
    const crudo: unknown = JSON.parse(sessionStorage.getItem(LLAVE_SESION) ?? "[]");
    enviadasEnMemoria = new Set(Array.isArray(crudo) ? crudo.filter((c): c is string => typeof c === "string") : []);
  } catch {
    enviadasEnMemoria = new Set();
  }
  return enviadasEnMemoria;
}

function marcarEnviadas(claves: readonly string[]): void {
  const set = enviadas();
  for (const c of claves) set.add(c);
  try {
    sessionStorage.setItem(LLAVE_SESION, JSON.stringify([...set]));
  } catch {
    /* modo privado o cuota llena: se recuerda sólo en esta carga */
  }
}

function vaciar(keepalive = false): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (pendientes.size === 0) return Promise.resolve();
  const claves = [...pendientes].slice(0, TOPE_POR_ENVIO);
  for (const c of claves) pendientes.delete(c);
  /* Se marcan al salir, no al volver: una apertura perdida no vale un segundo envío. */
  marcarEnviadas(claves);
  const envio = fetch(URL_USO_PANEL, {
    method: "POST",
    credentials: "include",
    keepalive,
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ claves }),
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    })
    .catch((err: unknown) => {
      logger.warn("[uso-panel] no se pudo registrar la apertura", { claves: claves.length, error: String(err) });
    });
  if (pendientes.size > 0) programar();
  return envio;
}

function programar(): void {
  if (timer) clearTimeout(timer);
  const esperado = Date.now() - primeraPendiente;
  timer = setTimeout(() => void vaciar(), Math.max(0, Math.min(DEMORA_MS, ESPERA_MAXIMA_MS - esperado)));
}

function instalarVaciado(): void {
  if (vaciadoInstalado) return;
  vaciadoInstalado = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void vaciar(true);
  });
  window.addEventListener("pagehide", () => void vaciar(true));
}

/** Anota que se abrió `clave` (`tab` o `tab:vista`). Una vez por sesión; sale junto con las demás. */
export function registrarApertura(clave: string): void {
  if (typeof window === "undefined" || !esClaveDeApertura(clave)) return;
  /* La barra de módulo también vive en el superadmin: ahí no hay negocio que anotar. */
  if (!EN_EL_PANEL.test(window.location.pathname)) return;
  if (pendientes.has(clave) || enviadas().has(clave)) return;
  if (pendientes.size === 0) primeraPendiente = Date.now();
  pendientes.add(clave);
  instalarVaciado();
  if (pendientes.size >= TOPE_POR_ENVIO) void vaciar();
  else programar();
}

/**
 * Manda ya lo que esté esperando y avisa cuando llegó (o falló: nunca rechaza).
 * Lo usa «Uso del panel» antes de leer, para que cuente lo que acabas de abrir.
 */
export function enviarPendientes(): Promise<void> {
  return vaciar();
}

/** Sólo tests: vuelve al estado de una carga nueva. */
export function __reiniciarRegistroParaTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  pendientes.clear();
  enviadasEnMemoria = null;
  primeraPendiente = 0;
}
