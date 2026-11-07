/**
 * Lo que cada persona guarda para sí en el panel (recientes, vistas guardadas)
 * sincronizado con el servidor (`/api/admin/preferences/panel`), para que la
 * siga a otra computadora. `localStorage` sigue siendo la caché que pinta al
 * instante: esto sólo trae y sube. Si el servidor falla, nada se rompe — queda
 * lo del navegador y se avisa al logger.
 *
 * `quien` = negocio + persona (lo que `useClaveDeUsuario` pone después del
 * prefijo): una lectura por persona y carga de página, compartida por todos
 * los hooks que la piden.
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

const URL_GUARDADO = "/api/admin/preferences/panel";
type Mapa = Record<string, unknown>;
interface Pendiente {
  quien: string;
  clave: string;
  valor: unknown[];
  timer: ReturnType<typeof setTimeout>;
}

const cargas = new Map<string, Promise<Mapa | null>>();
/** Lo último que se sabe del servidor por persona (leído o subido). */
const conocido = new Map<string, Mapa>();
const pendientes = new Map<string, Pendiente>();

function cargar(quien: string): Promise<Mapa | null> {
  const enCurso = cargas.get(quien);
  if (enCurso) return enCurso;
  const p = fetch(URL_GUARDADO, { credentials: "include", cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { guardado?: unknown };
      const delServidor = j.guardado && typeof j.guardado === "object" ? (j.guardado as Mapa) : {};
      /* Lo que se subió mientras llegaba la respuesta es más nuevo: manda. */
      const mapa = { ...delServidor, ...(conocido.get(quien) ?? {}) };
      conocido.set(quien, mapa);
      return mapa;
    })
    .catch((err: unknown) => {
      logger.warn("[panel] no se pudo traer lo guardado del servidor", { error: String(err) });
      cargas.delete(quien); // el próximo montaje lo reintenta
      return null;
    });
  cargas.set(quien, p);
  return p;
}

/**
 * Lo que el servidor tiene en `clave`: la lista; `null` si esta persona nunca
 * guardó ahí (el que llama sube lo del navegador); `undefined` si no se pudo
 * saber (sin conexión, servidor caído: se sigue con lo del navegador).
 */
export async function leerDelServidor(quien: string, clave: string): Promise<unknown[] | null | undefined> {
  const mapa = await cargar(quien);
  if (!mapa) return undefined;
  const valor = mapa[clave];
  return Array.isArray(valor) ? valor : null;
}

function enviar(p: Omit<Pendiente, "timer">, keepalive = false): Promise<void> {
  conocido.set(p.quien, { ...(conocido.get(p.quien) ?? {}), [p.clave]: p.valor });
  return fetch(URL_GUARDADO, {
    method: "PUT",
    credentials: "include",
    keepalive,
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ clave: p.clave, valor: p.valor }),
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    })
    .catch((err: unknown) => {
      logger.warn("[panel] no se pudo guardar en el servidor", { clave: p.clave, error: String(err) });
    });
}

let vaciadoInstalado = false;
/** Al esconder o cerrar la pestaña, lo que esperaba su turno sale ya (keepalive). */
function instalarVaciado(): void {
  if (vaciadoInstalado || typeof window === "undefined") return;
  vaciadoInstalado = true;
  const vaciar = () => {
    for (const [id, p] of pendientes) {
      clearTimeout(p.timer);
      pendientes.delete(id);
      void enviar(p, true);
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") vaciar();
  });
  window.addEventListener("pagehide", vaciar);
}

/**
 * Sube `valor` a `clave` dentro de `demoraMs` (los recientes esperan a que
 * dejes de moverte; una vista guardada sale ya). Si el servidor ya tiene eso
 * mismo, no pide nada.
 */
export function subirAlServidor(quien: string, clave: string, valor: unknown[], demoraMs = 0): void {
  if (typeof window === "undefined") return;
  const id = `${quien}|${clave}`;
  const previo = pendientes.get(id);
  if (previo) clearTimeout(previo.timer);
  pendientes.delete(id);
  if (JSON.stringify(conocido.get(quien)?.[clave]) === JSON.stringify(valor)) return;
  const timer = setTimeout(() => {
    pendientes.delete(id);
    void enviar({ quien, clave, valor });
  }, demoraMs);
  pendientes.set(id, { quien, clave, valor, timer });
  instalarVaciado();
}
