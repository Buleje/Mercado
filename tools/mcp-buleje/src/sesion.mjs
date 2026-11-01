// Sesión HTTP de un negocio: jar de cookies, CSRF double-submit, login/refresh (contrato §3.2).
// Calco de scripts/qa-capturas.mjs: la cookie `csrf-token` sale de un GET; SOLO el login lleva x-tenant-id
// (proxy.ts nunca confía en ese header y audita el que no coincide: mandarlo en todo era ruido en la auditoría).
// 29-10 (revisión de seguridad, hallazgo 5): las cookies viven SOLO en memoria. Antes la de refresh (7 días) quedaba
// en un archivo de estado y cualquier proceso de la PC podía entrar al panel con ella.

// 01-11 (pedido del hilo principal, 429 medido a las 08:31): con muchos procesos cortos (claude -p de las tareas, cifras
// por Telegram, el buzón) cada uno hacía su login y el panel cortaba con 429. Con `archivo` (opcional; el servidor real y
// guia-telegram lo pasan) la sesión se comparte entre procesos: archivo 0600 en ~/.local/state/buleje-mcp (carpeta 0700,
// al lado de credenciales que ya guardan la CLAVE con el mismo permiso: no abre nada que no estuviera abierto), un
// candado (mkdir) para que dos procesos no hagan login a la vez, y un 429 en el login espera y reintenta 1 vez (sin
// bloquear 15 min: no es clave mala). Sin `archivo` (tests, crear-usuario) todo sigue solo en memoria.
import { closeSync, constants as FS, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";

export const CANDADO_VIEJO_MS = 400_000; // > un login lento (2 topes de 120 s + espera del 429)
export const ESPERA_429_MS = 20_000;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export const USER_AGENT = "BulejeMCP/1.0 (Claude)";
const COOKIES_SESION = ["buleje-admin-sess", "buleje-admin-refresh"];
const BLOQUEO_TRAS_LOGIN_FALLIDO_MS = 15 * 60_000; // = lockout del servidor

const esHtml = (t) => /<html|<!DOCTYPE/i.test(t);

/** Archivo del panel que rompió la compilación, si el HTML de error lo nombra. */
export function archivoCulpable(html) {
  const m = String(html).match(/(?:\.\/)?((?:app|components|lib|hooks|contexts|extensiones)\/[\w./\[\]-]+\.(?:tsx?|mjs))(?::(\d+))?/);
  return m ? `${m[1]}${m[2] ? ":" + m[2] : ""}` : null;
}

export class Sesion {
  /**
   * @param {{ negocio: string, cred: { slug: string, usuario: string, clave: string }, base: string,
   *   fetch?: typeof fetch, ahora?: () => number }} op
   */
  constructor(op) {
    this.negocio = op.negocio;
    this.cred = op.cred;
    this.base = op.base.replace(/\/+$/, "");
    this.fetch = op.fetch ?? fetch;
    this.ahora = op.ahora ?? Date.now;
    /** @type {Map<string,string>} */ this.jar = new Map();
    this.bloqueadoHasta = 0; // login fallido: no se repite hasta que pase el lockout
    this.ultimoErrorLogin = "";
    /** @type {string | undefined} */ this.archivo = op.archivo;
    this.esperar = op.esperar ?? dormir;
    this.firmaFallida = ""; // jar que el panel ya rechazó: no se vuelve a cargar del disco
  }

  firmaJar() { return JSON.stringify([...this.jar].filter(([k]) => COOKIES_SESION.includes(k)).sort()); }

  /** Carga la sesión que dejó otro proceso (si es de este usuario y negocio). true si quedó con sesión. */
  cargarDeDisco() {
    if (!this.archivo) return false;
    try {
      const j = JSON.parse(readFileSync(this.archivo, "utf8"));
      if (j?.usuario !== this.cred.usuario || j?.slug !== this.cred.slug || j?.base !== this.base || !Array.isArray(j.jar)) return false;
      const jar = new Map(j.jar.filter((x) => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string" && /^[\w-]{1,80}$/.test(x[0]) && x[1].length < 8000 && !/[;\r\n]/.test(x[1])));
      const antes = this.jar;
      this.jar = jar;
      if (!this.conSesion || this.firmaJar() === this.firmaFallida) { this.jar = antes; return false; }
      return true;
    } catch { return false; }
  }

  guardarEnDisco() {
    if (!this.archivo || !this.conSesion) return;
    try {
      mkdirSync(dirname(this.archivo), { recursive: true, mode: 0o700 });
      const tmp = `${this.archivo}.${process.pid}.tmp`;
      // O_NOFOLLOW + O_EXCL: un .tmp plantado como enlace no hace escribir en otro archivo (revisión 01-11).
      const abrir = () => openSync(tmp, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600);
      let fd;
      try { fd = abrir(); } catch { unlinkSync(tmp); fd = abrir(); }
      try { writeSync(fd, JSON.stringify({ usuario: this.cred.usuario, slug: this.cred.slug, base: this.base, jar: [...this.jar] })); } finally { closeSync(fd); }
      renameSync(tmp, this.archivo);
    } catch { /* sin disco: sigue en memoria */ }
  }

  /** Login con candado entre procesos: si otro está entrando, se espera y se usa su sesión. */
  async entrarCompartido() {
    if (!this.archivo) return this.entrar();
    const candado = `${this.archivo}.candado`;
    const t0 = this.ahora();
    for (;;) {
      try { mkdirSync(candado, { mode: 0o700 }); break; } catch (e) {
        if (/** @type {any} */ (e)?.code !== "EEXIST") return this.entrar();
        try { if (Date.now() - statSync(candado).mtimeMs > CANDADO_VIEJO_MS) { rmdirSync(candado); continue; } } catch { continue; }
        if (this.ahora() - t0 > CANDADO_VIEJO_MS) return this.entrar();
        await this.esperar(500);
        if (this.cargarDeDisco()) return { ok: true, status: 200, mensaje: "ok (sesión de otro proceso)" };
      }
    }
    try {
      if (this.cargarDeDisco()) return { ok: true, status: 200, mensaje: "ok (sesión de otro proceso)" };
      const r = await this.entrar();
      if (r.ok) this.guardarEnDisco();
      return r;
    } finally {
      try { rmdirSync(candado); } catch { /* ya no está */ }
    }
  }

  /** La sesión que se tenía no sirvió: se marca para no recargarla del disco. */
  /** @param {string} [firma] la del jar ANTES del refresh fallido (el panel borra las cookies al rechazarlo). */
  descartar(firma) {
    const f = firma ?? (this.conSesion ? this.firmaJar() : "");
    if (f && f !== "[]") this.firmaFallida = f;
    this.jar.clear();
  }

  get csrf() { return this.jar.get("csrf-token") ?? ""; }
  get conSesion() { return COOKIES_SESION.some((c) => this.jar.has(c)); }
  cabeceraCookie() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }

  /** @param {Response} res */
  guardarCookies(res) {
    const crudas = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of crudas) {
      const [par, ...attrs] = c.split(";");
      const i = par.indexOf("=");
      if (i < 1) continue;
      const nombre = par.slice(0, i).trim();
      const valor = par.slice(i + 1).trim();
      const borra = valor === "" || attrs.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a)) ||
        attrs.some((a) => { const m = a.match(/^\s*expires\s*=\s*(.+)$/i); return m && Date.parse(m[1]) < this.ahora(); });
      if (borra) this.jar.delete(nombre); else this.jar.set(nombre, valor);
    }
  }

  olvidar() { this.jar.clear(); }

  /**
   * Un fetch crudo con cookies, UA fijo, CSRF en escrituras y tenant solo en el login. Guarda Set-Cookie.
   * La ruta tiene que llegar ya normalizada: si `new URL` la cambia («..», «/./», «?» escondido), no sale.
   * @param {{ metodo: string, ruta: string, query?: Record<string,string|number|boolean>, cuerpo?: unknown, form?: FormData }} p
   * @param {number} tope ms
   */
  async enviar(p, tope) {
    const url = new URL(this.base + p.ruta);
    if (url.pathname !== p.ruta || url.search || url.hash) throw new TypeError(`ruta no normalizada: ${String(p.ruta).slice(0, 120)}`);
    for (const [k, v] of Object.entries(p.query ?? {})) url.searchParams.set(k, String(v));
    /** @type {Record<string,string>} */
    const h = { "user-agent": USER_AGENT, accept: "application/json" };
    if (p.metodo === "POST" && p.ruta === "/api/auth/login") h["x-tenant-id"] = this.cred.slug;
    const ck = this.cabeceraCookie();
    if (ck) h.cookie = ck;
    if (p.metodo !== "GET" && this.csrf) h["x-csrf-token"] = this.csrf;
    let body;
    if (p.form) body = p.form;
    else if (p.cuerpo !== undefined) { h["content-type"] = "application/json"; body = JSON.stringify(p.cuerpo); }
    const res = await this.fetch(url.toString(), { method: p.metodo, headers: h, body, signal: AbortSignal.timeout(tope), redirect: "manual" });
    const antes = this.archivo ? this.firmaJar() : "";
    this.guardarCookies(res);
    // El panel rota la cookie (refresh): los demás procesos tienen que ver la nueva.
    if (this.archivo && p.ruta !== "/api/auth/login" && this.conSesion && this.firmaJar() !== antes) this.guardarEnDisco();
    return res;
  }

  /** Siembra la cookie csrf-token: /api/health (20 s), si no /login (60 s). El login no la exige. */
  async sembrarCsrf() {
    if (this.csrf) return;
    for (const [ruta, tope] of /** @type {const} */ ([["/api/health", 20_000], ["/login", 60_000]])) {
      try { await this.enviar({ metodo: "GET", ruta }, tope); if (this.csrf) return; } catch { /* siguiente */ }
    }
  }

  /** El proxy rechazó el CSRF (403): se tira la cookie y se siembra otra. */
  async renovarCsrf() {
    this.jar.delete("csrf-token");
    await this.sembrarCsrf();
    return Boolean(this.csrf);
  }

  /** Un único login. Si falla por credenciales, bloquea nuevos intentos 15 min. @returns {Promise<{ok:boolean, status:number, mensaje:string, compilando?:boolean}>} */
  async entrar(reintento = false) {
    if (this.ahora() < this.bloqueadoHasta) {
      return { ok: false, status: 0, mensaje: `El login de «${this.negocio}» falló hace poco (${this.ultimoErrorLogin}); no se reintenta para no bloquear al usuario. Revisá usuario/clave con configurar.mjs.` };
    }
    await this.sembrarCsrf();
    let res;
    try {
      res = await this.enviar({ metodo: "POST", ruta: "/api/auth/login", cuerpo: { username: this.cred.usuario, password: this.cred.clave, tenantSlug: this.cred.slug } }, 120_000);
    } catch (e) {
      return { ok: false, status: 0, mensaje: `login sin respuesta: ${/** @type {any} */ (e)?.name ?? "error"}` };
    }
    const txt = await res.text().catch(() => "");
    if (res.status === 200) return { ok: true, status: 200, mensaje: "ok" };
    // 429 = demasiados logins seguidos (no es clave mala): esperar y reintentar 1 vez, sin el bloqueo de 15 min.
    if (res.status === 429) {
      if (reintento) {
        // Sin bucle y sin seguir golpeando: 60 s sin intentar (no 15 min: no es clave mala).
        this.bloqueadoHasta = this.ahora() + 60_000;
        this.ultimoErrorLogin = "429 demasiadas solicitudes";
        return { ok: false, status: 429, mensaje: "el panel dice «demasiadas solicitudes» al entrar; prueba en unos minutos" };
      }
      const ra = Number(res.headers.get("retry-after"));
      await this.esperar(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60_000) : ESPERA_429_MS);
      return this.entrar(true);
    }
    if (res.status >= 500 && esHtml(txt)) {
      const f = archivoCulpable(txt);
      return { ok: false, status: res.status, compilando: true, mensaje: `el panel está compilando o tiene un error de compilación${f ? ` en ${f}` : ""}` };
    }
    let msg = txt.slice(0, 160);
    try { const j = JSON.parse(txt); msg = String(j.message ?? j.error ?? j.detalle ?? msg); } catch { /* texto crudo */ }
    if (res.status !== 500) { this.bloqueadoHasta = this.ahora() + BLOQUEO_TRAS_LOGIN_FALLIDO_MS; this.ultimoErrorLogin = `${res.status} ${msg}`.slice(0, 120); }
    return { ok: false, status: res.status, mensaje: msg || `login ${res.status}` };
  }

  /** POST /api/auth/refresh. true si renovó la sesión. */
  async refrescar() {
    if (!this.jar.has("buleje-admin-refresh")) return false;
    try {
      const res = await this.enviar({ metodo: "POST", ruta: "/api/auth/refresh", cuerpo: {} }, 30_000);
      await res.text().catch(() => "");
      if (res.status === 200) { this.guardarEnDisco(); return true; }
    } catch { /* cae al login */ }
    return false;
  }

  /** Deja una sesión usable antes del primer pedido. */
  async asegurar() {
    if (this.conSesion) return { ok: true, status: 200, mensaje: "ok" };
    if (this.cargarDeDisco()) return { ok: true, status: 200, mensaje: "ok (sesión guardada)" };
    return this.entrarCompartido();
  }
}
