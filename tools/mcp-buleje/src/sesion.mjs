// Sesión HTTP de un negocio: jar de cookies, CSRF double-submit, login/refresh (contrato §3.2).
// Calco de scripts/qa-capturas.mjs: la cookie `csrf-token` sale de un GET; SOLO el login lleva x-tenant-id
// (proxy.ts nunca confía en ese header y audita el que no coincide: mandarlo en todo era ruido en la auditoría).
// 29-10 (revisión de seguridad, hallazgo 5): las cookies viven SOLO en memoria. Antes la de refresh (7 días) quedaba
// en un archivo de estado y cualquier proceso de la PC podía entrar al panel con ella.

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
    this.guardarCookies(res);
    return res;
  }

  /** Siembra la cookie csrf-token: /api/health (20 s), si no /login (60 s). El login no la exige. */
  async sembrarCsrf() {
    if (this.csrf) return;
    for (const [ruta, tope] of /** @type {const} */ ([["/api/health", 20_000], ["/login", 60_000]])) {
      try { await this.enviar({ metodo: "GET", ruta }, tope); if (this.csrf) return; } catch { /* siguiente */ }
    }
  }

  /** Un único login. Si falla por credenciales, bloquea nuevos intentos 15 min. @returns {Promise<{ok:boolean, status:number, mensaje:string, compilando?:boolean}>} */
  async entrar() {
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
      if (res.status === 200) return true;
    } catch { /* cae al login */ }
    return false;
  }

  /** Deja una sesión usable antes del primer pedido. */
  async asegurar() {
    if (this.conSesion) return { ok: true, status: 200, mensaje: "ok" };
    return this.entrar();
  }
}
