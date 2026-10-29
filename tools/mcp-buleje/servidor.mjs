#!/usr/bin/env node
// Servidor MCP «buleje» (stdio): Claude Code ↔ panel de localhost:3000 como el usuario «claude» (ADR-523).
// Contrato: .claude/autonomo/mcp-buleje/contrato.md (§3.4 confirmación, §5 recursos/prompts, §10 ventana de OK).
// stdout es el canal MCP: todo log va a stderr.
import { readdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { lineaInstruccion, sanearVentana } from "./src/clave-ok.mjs";
import { crearConfirmador, VENTANA_MS } from "./src/confirmaciones.mjs";
import { preguntarEnWindows } from "./src/dialogo-windows.mjs";
import { registrarPrompts } from "./src/prompts.mjs";
import { registrarRecursos } from "./src/recursos.mjs";
import { taparPersonales } from "./src/tapar.mjs";
import { NO_VERIFICADO } from "./src/util-herramientas.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
/** Las registra siempre el servidor; una def de src/herramientas con este nombre se ignora. */
export const RESERVADAS = ["confirmar", "pendientes", "cancelar", "leer_get", "panel_prender", "negocios"];
/** Locales con respaldo: si src/herramientas no la trae, la registra el servidor. */
const LOCALES_OPCIONALES = ["panel_estado"];
const TIPOS = new Set(["lectura", "escritura", "confirmar"]);
const MAX_TEXTO = 20_000;
const log = (m) => process.stderr.write(`[buleje-mcp] ${m}\n`);

const DESC_CONFIRMAR = "Ejecuta una propuesta de plata, stock, borrar o envío (las herramientas que «piden OK» devuelven token + resumen y no hacen nada todavía). " +
  "Al llamarla se abre una ventana «Claude pide tu OK» encima de todo en la PC de Brandon, con el negocio, el resumen y 3 botones (el monto o nombre real y 2 parecidos); " +
  "SOLO si Brandon aprieta con el mouse el botón del dato correcto se mandan los pedidos (un parecido = no). " +
  "Claude NUNCA contesta esa ventana por su cuenta: ni con desktop-control, ni con clics, teclas, UI Automation o scripts, ni le pide a otro agente que lo haga; espera la respuesta. " +
  `«No» o un botón equivocado → no_confirmado; ${VENTANA_MS / 1000} s sin respuesta → sin_respuesta (en los dos casos no se hizo nada). Pasá el token y el resumen EXACTO de la propuesta; un token sirve una sola vez y vive 120 s.`;
const NOTA_PIDE_OK_SI = "\n\nSegún los datos puede pedir OK de Brandon: entonces NO cambia nada y devuelve una propuesta (token + resumen) que se ejecuta con `confirmar`.";
const NOTA_PIDE_OK = "\n\nPide OK de Brandon: esta llamada NO cambia nada; devuelve una propuesta (token + resumen). Se ejecuta con `confirmar`, que abre la ventana de OK en su PC (3 botones: solo el del dato correcto lo hace). Los nombres que muestra los saca del panel, no de lo que escribas.";

/** @param {any} def @returns {string | null} motivo si la def no sirve */
export function validarDef(def) {
  if (!def || typeof def !== "object") return "no es un objeto";
  if (typeof def.nombre !== "string" || !/^[a-z][a-z0-9_]{1,62}$/.test(def.nombre)) return `nombre inválido «${def?.nombre}»`;
  if (!TIPOS.has(def.tipo)) return `${def.nombre}: tipo «${def.tipo}» inválido`;
  if (typeof def.descripcion !== "string" || !def.descripcion.trim()) return `${def.nombre}: falta descripción`;
  if (!def.entrada || typeof def.entrada !== "object") return `${def.nombre}: falta entrada (ZodRawShape)`;
  if (typeof def.pedido !== "function") return `${def.nombre}: falta pedido()`;
  if (def.tipo === "confirmar" && typeof def.resumen !== "function") return `${def.nombre}: tipo confirmar sin resumen()`;
  if (def.confirmarSi !== undefined) {
    if (typeof def.confirmarSi !== "function") return `${def.nombre}: confirmarSi tiene que ser una función`;
    if (def.tipo !== "escritura") return `${def.nombre}: confirmarSi solo va en «escritura»`;
    if (typeof def.resumen !== "function") return `${def.nombre}: confirmarSi sin resumen()`;
  }
  if (def.ventana !== undefined && typeof def.ventana !== "function") return `${def.nombre}: ventana tiene que ser una función`;
  return null;
}

/** Carga `export const herramientas = [...]` de cada src/herramientas/*.mjs. @param {string} [dir] */
export async function cargarHerramientas(dir = join(AQUI, "src", "herramientas")) {
  /** @type {any[]} */ const defs = [];
  /** @type {string[]} */ const avisos = [];
  const vistos = new Set();
  let archivos = [];
  try { archivos = readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort(); } catch { avisos.push(`no existe ${dir}`); }
  for (const f of archivos) {
    let mod;
    try { mod = await import(pathToFileURL(join(dir, f)).href); } catch (e) { avisos.push(`${f}: no carga (${String(/** @type {any} */ (e)?.message ?? e).slice(0, 200)})`); continue; }
    for (const def of Array.isArray(mod.herramientas) ? mod.herramientas : []) {
      const malo = validarDef(def);
      if (malo) { avisos.push(`${f}: ${malo}`); continue; }
      if (RESERVADAS.includes(def.nombre)) { avisos.push(`${f}: «${def.nombre}» es del servidor; se ignora`); continue; }
      if (vistos.has(def.nombre)) { avisos.push(`${f}: «${def.nombre}» repetida; se ignora`); continue; }
      vistos.add(def.nombre);
      defs.push(def);
    }
  }
  return { defs, avisos };
}

/** @param {{ negocios: Record<string, any> }} config @param {string} negocio @returns {"bodega"|"forestal"} */
export function rubroDe(config, negocio) {
  const c = config.negocios?.[negocio] ?? {};
  if (c.rubro === "bodega" || c.rubro === "forestal") return c.rubro;
  if (negocio === "bodega" || c.slug === "main") return "bodega";
  return /blas|forestal|agroforestal/i.test(`${negocio} ${c.slug ?? ""}`) ? "forestal" : "bodega";
}

/** Red de seguridad (29-10): si un formatear adivinó mal los campos («[object Object]» o ningún número),
 *  se agregan los datos crudos para que Claude no reporte vacío lo que sí vino del panel. */
function seguro(texto, datos) {
  if (!datos || typeof datos !== "object" || typeof texto !== "string") return texto;
  if (texto.includes("[object Object]") || !/\d/.test(texto)) return `${texto.replaceAll("[object Object]", "…")}\n\nDatos del panel:\n${json(datos)}`;
  return texto;
}

/** El modo a seco se prende desde cualquier lado (config, BULEJE_MCP_SECO=1, seco:true en la llamada); solo la config lo apaga. */
export function secoInicial(config, env = process.env) {
  return /^(1|true|si|sí)$/i.test(String(env.BULEJE_MCP_SECO ?? "")) || config?.seco !== false;
}

const recortar = (t) => (t.length > MAX_TEXTO ? `${t.slice(0, MAX_TEXTO)}\n… (recortado a ${MAX_TEXTO / 1000} KB: pide menos filas o la página siguiente)` : t);
const json = (v) => JSON.stringify(v, null, 1);
const ok = (texto) => ({ content: [{ type: "text", text: recortar(String(texto)) }] });
/** @param {string} codigo @param {string} mensaje @param {unknown} [detalle] */
const error = (codigo, mensaje, detalle) => ({ isError: true, content: [{ type: "text", text: recortar(`${codigo}: ${mensaje}${detalle === undefined ? "" : `\n${json(detalle)}`}`) }] });
const deRespuesta = (r) => error(r?.error?.codigo ?? "servidor", r?.error?.mensaje ?? `HTTP ${r?.status}`, r?.error?.detalle);

/**
 * @param {{
 *   herramientas: any[], pedir: (negocio: string, p: import("./src/tipos.mjs").Pedido) => Promise<import("./src/tipos.mjs").Respuesta>,
 *   config: { base?: string, porDefecto: string, negocios: Record<string, any>, seco?: boolean }, seco?: boolean,
 *   preguntar?: (p: any) => Promise<string>, anotar?: (e: Record<string, unknown>) => unknown, ultimas?: (n: number) => any[],
 *   estadoPanel?: (op: any) => Promise<any>, prenderPanel?: (op: any) => Promise<any>,
 *   rutaLecturaPermitida?: (ruta: string) => { ok: boolean, motivo: string, ruta?: string },
 *   sesionViva?: (negocio: string) => boolean | null, sinConfig?: string, ahora?: () => number,
 * }} d
 */
export function crearServidor(d) {
  const { config } = d;
  const seco = () => d.seco ?? secoInicial(config);
  const anotar = (e) => { try { d.anotar?.(e); } catch (err) { log(`registro falló: ${String(err)}`); } };
  const preguntar = d.preguntar ?? ((p) => preguntarEnWindows({ negocio: p.negocio, resumen: p.resumen, ventana: p.ventana, vence: p.vence, signal: p.signal }));
  const confirmador = crearConfirmador({ preguntar, enviar: d.pedir, seco, ahora: d.ahora });
  const servidor = new McpServer({ name: "buleje", version: "1.0.0" }, { capabilities: { resources: {}, prompts: {}, tools: {} } });
  const porNombre = new Map(d.herramientas.map((x) => [x.nombre, x]));

  /** @returns {{ negocio?: string, fallo?: any }} */
  function negocioDe(pedido) {
    if (d.sinConfig) return { fallo: error("sin_sesion", d.sinConfig) };
    const n = pedido || config.porDefecto;
    if (!config.negocios[n]) return { fallo: error("sin_sesion", `Negocio «${n}» desconocido. Disponibles: ${Object.keys(config.negocios).join(", ")}`) };
    return { negocio: n };
  }
  const shapeDe = (def) => ({
    ...(def.entrada.negocio ? {} : { negocio: z.string().optional().describe("bodega, blas o qa-forestal (vacío = el de siempre)") }),
    ...def.entrada,
    ...(def.tipo !== "lectura" && !def.entrada.seco ? { seco: z.boolean().optional().describe("true = solo mostrar el pedido, sin mandarlo") } : {}),
  });

  async function mandarTodos(negocio, pedidos) {
    const rs = [];
    for (const p of pedidos) { const r = await d.pedir(negocio, p); rs.push(r); if (!r?.ok) break; }
    return rs;
  }

  /** Corre una DefHerramienta. Exportado para el recurso «hoy» y los tests. */
  async function ejecutar(def, args, extra) {
    const t0 = Date.now();
    const { negocio, fallo } = negocioDe(args?.negocio);
    if (fallo) return fallo;
    const rubro = rubroDe(config, negocio);
    if (def.soloEn && !def.soloEn.includes(rubro)) return error("no_existe", `«${def.nombre}» es solo de ${def.soloEn.join("/")}; «${negocio}» es ${rubro}. Pasá negocio: "blas" o "qa-forestal".`);
    const parsed = z.object(shapeDe(def)).safeParse(args ?? {});
    if (!parsed.success) return error("datos_invalidos", "Los datos no pasan la validación.", parsed.error.issues.map((i) => ({ campo: i.path.join("."), problema: i.message })));
    const a = parsed.data;
    // «escritura» con confirmarSi (ej. tocar el límite de crédito) pasa a pedir OK como una «confirmar».
    let pideOk = def.tipo === "confirmar";
    if (!pideOk && typeof def.confirmarSi === "function") {
      try { pideOk = def.confirmarSi(a) === true; } catch (e) { return error("datos_invalidos", String(/** @type {any} */ (e)?.message ?? e)); }
    }
    /** @type {import("./src/tipos.mjs").Pedido[]} */ let pedidos = [];
    if (!pideOk) {
      try { pedidos = [def.pedido(a)].flat(); } catch (e) { return error("datos_invalidos", String(/** @type {any} */ (e)?.message ?? e)); }
    }
    const nota = (extra2) => anotar({ herramienta: def.nombre, tipo: pideOk ? "confirmar" : def.tipo, negocio, metodo: pedidos[0]?.metodo, ruta: pedidos[0]?.ruta, ms: Date.now() - t0, ...extra2 });
    // RRHH: DNI, celulares y sueldos tapados antes de que el modelo los vea (Ley 29733; hallazgo 6).
    const tapar = (v) => (def.grupo === "rrhh" ? taparPersonales(v) : v);

    if (def.tipo === "lectura") {
      if (pedidos.some((p) => p?.metodo !== "GET")) { nota({ error: "servidor" }); return error("servidor", `«${def.nombre}» es de lectura pero armó un pedido que escribe; no se mandó.`); }
      const rs = await mandarTodos(negocio, pedidos);
      const ultima = rs[rs.length - 1];
      nota({ status: ultima?.status, error: ultima?.ok ? undefined : ultima?.error?.codigo });
      if (!ultima?.ok) return deRespuesta(ultima);
      const datos = tapar(rs.length === 1 ? rs[0].datos : rs.map((r) => r.datos));
      let texto;
      try { texto = def.formatear ? def.formatear(datos, a) : json(datos); } catch (e) { texto = `${json(datos)}\n(formatear falló: ${String(e)})`; }
      texto = seguro(texto, datos);
      return ok(rs.some((r) => r.truncado) ? `${texto}\n(recortado: pide la página siguiente con page/cursor/limit)` : texto);
    }

    if (def.tipo === "escritura" && !pideOk) {
      if (seco() || a.seco === true) { nota({ seco: true }); return ok(json({ seco: true, nota: "Modo a seco: no se mandó nada.", pedidos })); }
      const rs = await mandarTodos(negocio, pedidos);
      const ultima = rs[rs.length - 1];
      nota({ status: ultima?.status, seco: false, error: ultima?.ok ? undefined : ultima?.error?.codigo });
      if (!ultima?.ok) return deRespuesta(ultima);
      const datos = tapar(rs.length === 1 ? rs[0].datos : rs.map((r) => r.datos));
      try { return ok(seguro(def.formatear ? def.formatear(datos, a) : json(datos), datos)); } catch { return ok(json(datos)); }
    }

    // confirmar: previa (solo GET) → pedidos (con lo que leyó la previa) → ventana → resumen → propuesta.
    // Ningún pedido de escritura sale de acá. Los nombres de la ventana salen de la previa (el panel), nunca de `a`.
    const leer = (p) => (p?.metodo === "GET" ? d.pedir(negocio, p) : Promise.resolve({ ok: false, status: 0, ms: 0, error: { codigo: "ruta_no_permitida", mensaje: "previa solo puede leer (GET)" } }));
    let previa, resumen, prop, ventana;
    try {
      previa = def.previa ? await def.previa(a, leer) : undefined;
      pedidos = [def.pedido(a, previa)].flat();
      const crudo = def.resumen(a, previa);
      let v = typeof def.ventana === "function" ? def.ventana(a, previa) : undefined;
      // Si el resumen no pudo verificar a quién, la ventana lo dice arriba (fila fija), aunque la def no lo ponga.
      if (crudo.includes(NO_VERIFICADO) && !JSON.stringify(v?.filas ?? []).includes(NO_VERIFICADO)) v = { ...(v ?? {}), filas: [{ etiqueta: "OJO", valor: NO_VERIFICADO }, ...(Array.isArray(v?.filas) ? v.filas : [])] };
      ventana = sanearVentana(v);
      resumen = `${crudo}\n\n${lineaInstruccion(ventana)}`;
      prop = confirmador.proponer({ negocio, herramienta: def.nombre, pedidos, resumen, ventana, seco: a.seco === true });
    } catch (e) {
      if (/** @type {any} */ (e)?.codigo === "limite") { nota({ error: "limite" }); return error("limite", String(/** @type {any} */ (e).message)); }
      nota({ error: "datos_invalidos" });
      return error("datos_invalidos", `No se pudo armar la propuesta: ${String(/** @type {any} */ (e)?.message ?? e).slice(0, 300)}`);
    }
    nota({ token: prop.token, seco: prop.seco, propuesta: true });
    return ok(json({
      token: prop.token, resumen: prop.resumen, vence: prop.vence, venceEn: "120 s", seco: prop.seco,
      siguiente: "Para hacerlo, llama `confirmar` con este token y este mismo resumen. Se abre una ventana en la PC de Brandon con 3 botones y solo se ejecuta si él aprieta el del dato correcto.",
    }));
  }

  for (const def of d.herramientas) {
    servidor.registerTool(def.nombre, {
      description: def.tipo === "confirmar" ? def.descripcion + NOTA_PIDE_OK : def.confirmarSi ? def.descripcion + NOTA_PIDE_OK_SI : def.descripcion,
      inputSchema: shapeDe(def),
      annotations: { readOnlyHint: def.tipo === "lectura", destructiveHint: def.tipo === "confirmar", openWorldHint: false },
    }, (args, extra) => ejecutar(def, args, extra));
  }

  // ── Sistema (locales) ──
  servidor.registerTool("confirmar", {
    description: DESC_CONFIRMAR,
    inputSchema: {
      token: z.string().min(20).max(40).describe("token de la propuesta (26 letras)"),
      resumen: z.string().min(1).max(4000).describe("el resumen tal cual vino en la propuesta"),
      negocio: z.string().optional(),
      seco: z.boolean().optional().describe("true = solo mostrar los pedidos, sin ventana ni red"),
    },
    annotations: { destructiveHint: true, openWorldHint: false },
  }, async (a, extra) => {
    if (a.negocio && d.sinConfig) return error("sin_sesion", d.sinConfig);
    const t0 = Date.now();
    const progreso = extra?._meta?.progressToken;
    const latido = progreso === undefined ? null : setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      extra.sendNotification({ method: "notifications/progress", params: { progressToken: progreso, progress: s, total: VENTANA_MS / 1000, message: "Esperando el OK de Brandon en la ventana…" } })
        .catch((err) => log(`progreso falló: ${String(err)}`));
    }, 10_000);
    let r;
    try { r = await confirmador.confirmar({ token: a.token, resumen: a.resumen, negocio: a.negocio, seco: a.seco, signal: extra?.signal }); }
    finally { if (latido) clearInterval(latido); }
    const ultima = r.resultados?.[r.resultados.length - 1];
    anotar({ herramienta: r.herramienta ?? "confirmar", tipo: "confirmar", negocio: r.negocio, token: a.token, confirmado: r.respuesta === "si", respuesta: r.respuesta, ...(r.inyectados ? { inyectados: r.inyectados, intento: "clics_inyectados" } : {}), seco: r.seco === true, status: ultima?.status, ms: Date.now() - t0, error: r.error?.codigo });
    if (!r.ok) return error(r.error?.codigo ?? "servidor", r.error?.mensaje ?? "falló", r.inyectados ? { respuesta: "no", inyectados: r.inyectados } : r.resultados?.map((x) => ({ ok: x.ok, status: x.status, datos: x.datos })));
    if (r.seco) return ok(json({ seco: true, nota: "Modo a seco: ni ventana ni red. Esto es lo que se mandaría.", herramienta: r.herramienta, negocio: r.negocio, pedidos: r.pedidos }));
    const def = porNombre.get(r.herramienta);
    const datos = r.resultados.length === 1 ? r.resultados[0].datos : r.resultados.map((x) => x.datos);
    const visibles = def?.grupo === "rrhh" ? taparPersonales(datos) : datos;
    let texto;
    try { texto = def?.formatear ? def.formatear(visibles, {}) : json(visibles); } catch { texto = json(visibles); }
    texto = seguro(texto, visibles);
    return ok(`Hecho: Brandon apretó el botón correcto (${r.herramienta}, ${r.negocio}).\n${texto}`);
  });

  servidor.registerTool("pendientes", {
    description: "Propuestas que esperan el OK de Brandon (token, resumen, cuánto les queda). No cambia nada.",
    inputSchema: {}, annotations: { readOnlyHint: true },
  }, async () => ok(json(confirmador.pendientes())));

  servidor.registerTool("cancelar", {
    description: "Anula una propuesta antes de confirmarla (el token deja de servir). No toca el panel.",
    inputSchema: { token: z.string().min(20).max(40) }, annotations: { readOnlyHint: false, destructiveHint: false },
  }, async (a) => { const r = confirmador.cancelar(a); return r.ok ? ok(`Cancelada: ${r.herramienta} en ${r.negocio}.`) : error(r.error.codigo, r.error.mensaje); });

  servidor.registerTool("negocios", {
    description: "Negocios que el MCP puede usar (nombre, slug, rubro), cuál es el de siempre y si está en modo a seco. Nunca muestra claves.",
    inputSchema: {}, annotations: { readOnlyHint: true },
  }, async () => (d.sinConfig ? error("sin_sesion", d.sinConfig) : ok(json({ porDefecto: config.porDefecto, seco: seco(), negocios: listaNegocios() }))));

  servidor.registerTool("leer_get", {
    description: "Lee un GET del panel que esté en la lista blanca (ventas, caja, pedidos, inventario, compras, adelantos, CTP, GTF, documentos…). Nunca escribe. " +
      "La ruta va SIN «?»: los filtros van en `query` (ej. ruta /api/sales, query {from:\"2026-10-01\"}). DNI, celulares y sueldos vuelven tapados. Para lo común preferí las herramientas con nombre.",
    inputSchema: {
      ruta: z.string().min(5).max(500).describe("solo el camino, sin «?» ni «#»; ej. /api/admin/forestal/gtf"),
      query: z.record(z.string().regex(/^[A-Za-z0-9_.\[\]-]{1,40}$/), z.union([z.string().max(200), z.number(), z.boolean()])).optional().describe("filtros: {clave: valor}"),
      negocio: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (a) => {
    const { negocio, fallo } = negocioDe(a.negocio);
    if (fallo) return fallo;
    // 29-10 (hallazgo 1): nada de cortar en «?». La lista blanca valida la ruta entera y devuelve la ruta normal;
    // se manda EXACTAMENTE esa (lo que se comparó es lo que sale) y la query va aparte, armada con searchParams.
    const permiso = d.rutaLecturaPermitida ? d.rutaLecturaPermitida(a.ruta) : { ok: false, motivo: "falta la lista blanca (src/lista-blanca.mjs)" };
    const anotada = String(a.ruta).slice(0, 200);
    if (!permiso.ok || typeof permiso.ruta !== "string") {
      anotar({ herramienta: "leer_get", tipo: "lectura", negocio, metodo: "GET", ruta: anotada, error: "ruta_no_permitida" });
      return error("ruta_no_permitida", permiso.ok ? "la lista blanca no devolvió la ruta normalizada" : permiso.motivo);
    }
    const query = a.query && Object.keys(a.query).length ? a.query : undefined;
    const r = await d.pedir(negocio, { metodo: "GET", ruta: permiso.ruta, ...(query ? { query } : {}) });
    anotar({ herramienta: "leer_get", tipo: "lectura", negocio, metodo: "GET", ruta: permiso.ruta, status: r?.status, ms: r?.ms, error: r?.ok ? undefined : r?.error?.codigo });
    return r?.ok ? ok(json(taparPersonales(r.datos)) + (r.truncado ? "\n(recortado: pide la página siguiente)" : "")) : deRespuesta(r);
  });

  servidor.registerTool("panel_prender", {
    description: "Prende el panel de la PC (`panel`) si el puerto 3000 está libre; nunca mata node. Se niega con menos de 8 GB libres. Compila 30-90 s.",
    inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async () => {
    if (!d.prenderPanel) return error("servidor", "falta src/panel-local.mjs");
    const r = await d.prenderPanel({ base: config.base });
    anotar({ herramienta: "panel_prender", tipo: "escritura", accion: r?.accion });
    return r?.ok ? ok(r.mensaje) : error("servidor", r?.mensaje ?? "no se pudo prender");
  });

  if (!porNombre.has("panel_estado")) {
    servidor.registerTool(LOCALES_OPCIONALES[0], {
      description: "Dice si el panel de localhost:3000 está prendido y responde (/api/health).",
      inputSchema: {}, annotations: { readOnlyHint: true },
    }, async () => (d.estadoPanel ? ok(json(await d.estadoPanel({ base: config.base }))) : error("servidor", "falta src/panel-local.mjs")));
  }

  function listaNegocios() {
    return Object.entries(config.negocios).map(([nombre, c]) => ({ nombre, slug: c.slug, rubro: rubroDe(config, nombre) }));
  }
  /** Texto del recurso buleje://{negocio}/hoy: hoy_forestal en lo forestal (si existe), si no hoy_resumen. */
  async function hoy(negocio) {
    const def = (rubroDe(config, negocio) === "forestal" && porNombre.get("hoy_forestal")) || porNombre.get("hoy_resumen");
    if (!def) return "No hay herramienta hoy_resumen cargada.";
    const r = await ejecutar(def, { negocio });
    return r.content.map((c) => c.text).join("\n");
  }
  registrarRecursos(servidor, {
    negocios: listaNegocios, porDefecto: () => config.porDefecto, seco, confirmador, hoy,
    ultimas: d.ultimas, sesionViva: d.sesionViva,
  });
  registrarPrompts(servidor);

  return { servidor, confirmador, ejecutar };
}

async function main() {
  const { leerCredenciales } = await import("./src/credenciales.mjs");
  const { crearCliente } = await import("./src/cliente.mjs");
  const opcional = (ruta) => import(ruta).catch((e) => { log(`${ruta} no carga: ${String(e?.message ?? e)}`); return {}; });
  const [registro, panel, lista] = await Promise.all([opcional("./src/registro.mjs"), opcional("./src/panel-local.mjs"), opcional("./src/lista-blanca.mjs")]);

  let config, sinConfig;
  try { config = leerCredenciales(); } catch (e) {
    sinConfig = String(/** @type {any} */ (e)?.message ?? e);
    log(sinConfig);
    config = { base: "http://localhost:3000", porDefecto: "", seco: true, negocios: {} };
  }
  const cliente = crearCliente({ config });
  const { defs, avisos } = await cargarHerramientas();
  for (const a of avisos) log(a);
  const seco = secoInicial(config);
  const { servidor } = crearServidor({
    herramientas: defs, pedir: cliente.pedir, config, seco, sinConfig,
    anotar: registro.anotar, ultimas: registro.ultimas,
    estadoPanel: panel.estadoPanel, prenderPanel: panel.prenderPanel, rutaLecturaPermitida: lista.rutaLecturaPermitida,
  });
  await servidor.connect(new StdioServerTransport());
  log(`listo: ${defs.length} herramientas del catálogo + sistema · seco=${seco} · negocios=${Object.keys(config.negocios).join(",") || "ninguno"}`);
}

const esPrincipal = (() => { try { return Boolean(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url; } catch { return false; } })();
if (esPrincipal) main().catch((e) => { log(`no arrancó: ${String(e?.stack ?? e)}`); process.exit(1); });
