// Estado y arranque del panel local. WSL mirrored: un puerto cerrado de 127.0.0.1 CUELGA en vez de
// rechazar, así que el chequeo usa un socket con tope de 1,5 s (memoria wsl-mirrored-puerto-cerrado-cuelga).
import { connect } from "node:net";
import { spawn as spawnReal, execFile } from "node:child_process";

export const TOPE_SOCKET_MS = 1500;
export const GB_MINIMOS_PARA_PRENDER = 8;

/** @param {number} [puerto] @param {string} [host] @param {number} [tope] */
export function puertoAbierto(puerto = 3000, host = "127.0.0.1", tope = TOPE_SOCKET_MS) {
  return new Promise((resolver) => {
    const s = connect({ port: puerto, host });
    const fin = (v) => { s.destroy(); resolver(v); };
    s.setTimeout(tope, () => fin(false));
    s.once("connect", () => fin(true));
    s.once("error", () => fin(false));
  });
}

/** @param {string} base */
export function puertoDeBase(base) {
  const u = new URL(base);
  return { host: u.hostname === "localhost" ? "127.0.0.1" : u.hostname, puerto: Number(u.port || (u.protocol === "https:" ? 443 : 80)) };
}

/** @param {{ base?: string, fetch?: typeof fetch, puertoAbierto?: (p:number,h:string)=>Promise<boolean> }} [op] */
export async function estadoPanel(op = {}) {
  const base = op.base ?? "http://localhost:3000";
  const { host, puerto } = puertoDeBase(base);
  const t0 = Date.now();
  if (!(await (op.puertoAbierto ?? puertoAbierto)(puerto, host))) return { abierto: false, saludable: false, ms: Date.now() - t0 };
  try {
    const r = await (op.fetch ?? fetch)(`${base}/api/health`, { signal: AbortSignal.timeout(20_000) });
    return { abierto: true, saludable: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch {
    return { abierto: true, saludable: false, ms: Date.now() - t0 };
  }
}

/** GB disponibles (columna available de `free -g`). */
export function gbLibres() {
  return new Promise((resolver) => {
    execFile("free", ["-g"], (err, out) => {
      if (err) return resolver(null);
      const fila = String(out).split("\n").find((l) => l.startsWith("Mem:"));
      const n = fila ? Number(fila.trim().split(/\s+/)[6]) : NaN;
      resolver(Number.isFinite(n) ? n : null);
    });
  });
}

/**
 * Prende el panel con `panel` (solo si :3000 está libre; nunca mata node). Se niega con <8 GB libres.
 * @param {{ base?: string, comando?: string, spawn?: typeof spawnReal, gbLibres?: () => Promise<number|null>, puertoAbierto?: (p:number,h:string)=>Promise<boolean> }} [op]
 */
export async function prenderPanel(op = {}) {
  const { host, puerto } = puertoDeBase(op.base ?? "http://localhost:3000");
  if (await (op.puertoAbierto ?? puertoAbierto)(puerto, host)) return { ok: true, accion: "ya_prendido", mensaje: "El panel ya está prendido." };
  const libres = await (op.gbLibres ?? gbLibres)();
  if (libres !== null && libres < GB_MINIMOS_PARA_PRENDER) {
    return { ok: false, accion: "sin_ram", mensaje: `Hay ${libres} GB libres y prender el panel necesita ~6 GB (mínimo ${GB_MINIMOS_PARA_PRENDER}). Cerrá algo o prendelo a mano con \`panel\`.` };
  }
  const hijo = (op.spawn ?? spawnReal)(op.comando ?? "panel", [], { detached: true, stdio: "ignore" });
  hijo.on?.("error", () => {});
  hijo.unref?.();
  return { ok: true, accion: "prendiendo", mensaje: "Prendiendo el panel (compila 30-90 s). Consultá `panel_estado` en un momento." };
}
