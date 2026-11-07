#!/usr/bin/env node
/**
 * matriz-pestanas.mjs — qué alcanza cada negocio en el panel, por plan × rol ×
 * rubro × plantilla, en UNA llamada.
 *
 * Por qué (plan «panel unificado», 2026-10-09): Brandon aprobó juntar 34
 * pestañas en 23 sin que nadie pierda una pantalla ni gane una que su plan no
 * paga. Esto escribe la línea base —los pares (pestaña, vista) que cada
 * combinación alcanza HOY— y `__tests__/panel-sin-perdida.test.ts` exige que
 * después ⊇ antes (lo nuevo, sólo si está en reports/panel/altas-aprobadas.json).
 *
 * La línea base usa la regla de la barra TAL COMO ERA el 2026-10-09
 * (useAdminTabsDerived + AdminSidebar + AdminMobileDrawer), portada acá a mano,
 * y NO `lib/admin/permiso-vista.ts`: así el test compara dos implementaciones y
 * no una consigo misma. Las plantillas se leen READ ONLY de la base con
 * scripts/sql-lectura.mjs: la global y las de los negocios con override propio.
 *
 * Superficies:
 *   barra   — barra de escritorio: TAB_CATEGORIES con rol, plan, plantilla,
 *             rubro (habilitados/ocultos) y especialización;
 *   celular — menú del celular: las mismas categorías SIN rubro (el drawer
 *             nunca lo aplicó: medido 2026-09-14 con RRHH);
 *   menu    — menú del usuario (config, plan, mi-perfil), sin filtro.
 * Un par es «hub:vista», o «hub» si no tiene vistas registradas. Hub = la
 * pestaña dueña del componente que se abre: `?tab=activos` monta Mi Plata entero
 * (FinanzasModule no filtra por plan), así que suma «plata:resumen», «plata:pl»…
 *
 * Supuestos (iguales antes y después): especializaciones todas encendidas; sin
 * preferencias del usuario (ocultos, favoritos); Modo Fácil apagado (hoy no lo
 * aplica ninguna superficie).
 *
 * Uso:
 *   node scripts/matriz-pestanas.mjs               resumen + diferencias con la línea base
 *   node scripts/matriz-pestanas.mjs --escribir    (re)escribe reports/panel/visibilidad-antes.json
 *   node scripts/matriz-pestanas.mjs --ver max,admin,bodega,global   pares de una combinación
 *   node scripts/matriz-pestanas.mjs --registros   en cuántos registros aparece cada id (ex plomeria/matriz.cjs)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
export const RUTA_ANTES = "reports/panel/visibilidad-antes.json";
export const RUTA_ALTAS = "reports/panel/altas-aprobadas.json";

export const PLANES = ["basico", "pro", "enterprise", "max"];
export const ROLES = ["admin", "cajero", "almacenero", "tienda_owner"];

// ── Modelo compartido con el test ─────────────────────────────────────────────

/** `if (tab === "x") return <Comp …` de TabRouter → Map(tab → componente). */
export function componentesDeTabRouter(src) {
  const mapa = new Map();
  for (const m of src.matchAll(/if \(tab === "([a-z0-9-]+)"\)\s*\{?\s*(?:return\s*\(?\s*)?<([A-Z]\w*)/g)) {
    if (!mapa.has(m[1])) mapa.set(m[1], m[2]);
  }
  return mapa;
}

/**
 * Pestaña → hub: la pestaña con vistas registradas que monta el MISMO
 * componente (`fiados`, `activos`… → `plata`). Sin hub con vistas, ella misma.
 */
export function crearHubDe(componentes, tieneVistas) {
  const hubDeComponente = new Map();
  for (const [tab, comp] of componentes) {
    if (tieneVistas(tab) && !hubDeComponente.has(comp)) hubDeComponente.set(comp, tab);
  }
  return (tab) => {
    const comp = componentes.get(tab);
    return (comp && hubDeComponente.get(comp)) || tab;
  };
}

/** Los ids del menú del usuario (`MENU_ITEMS` de AdminUserDropdown). */
export function idsDelMenuDeUsuario(src) {
  const bloque = src.match(/const MENU_ITEMS = \[([\s\S]*?)\];/);
  return bloque ? [...bloque[1].matchAll(/\bid:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]) : [];
}

/**
 * Los pares que abre una lista de pestañas. `vistasDe(hub)` → [{ key, origen? }];
 * `filtrar(hub, vistas)` → las que se ven adentro (antes: todas).
 */
export function paresDe(tabs, hubDe, vistasDe, filtrar = (_hub, vistas) => vistas) {
  const pares = new Set();
  for (const tab of tabs) {
    const hub = hubDe(tab);
    const vistas = vistasDe(hub);
    if (vistas.length === 0) {
      pares.add(hub);
      continue;
    }
    for (const v of filtrar(hub, vistas)) pares.add(`${hub}:${v.key}`);
  }
  return [...pares].sort();
}

/**
 * La regla de la barra al 2026-10-09, portada a mano (ver cabecera). `r` trae
 * los registros: ids de ALL_TABS, PLANS, MODULE_PERMISSIONS, SPEC_GATED,
 * categorías, VERTICAL_REGISTRY y el catálogo de la plantilla.
 */
export function visibilidadDeAntes(r, { plan, rol, rubro, overrides }) {
  // useAdminTabsDerived.allowedTabs: admin ve ALL_TABS; cajero y almacenero, su
  // lista por defecto; cualquier otro rol sin permisos guardados cae en admin.
  const base = rol === "cajero" || rol === "almacenero" ? r.permisos[rol] : r.idsDelPanel;
  const desbloquea = r.planes[plan].unlockedTabs;
  const permitidas = new Set(base.filter((t) => r.spec.has(t) || desbloquea.has(t)));
  // useAdminTemplateOverlay.isHiddenByTemplate
  const ocultaPlantilla = (id) => {
    if (r.spec.has(id)) return false;
    const entrada = r.catalogo.find((m) => m.id === id);
    if (!entrada) return false;
    return !(overrides[id]?.visible ?? entrada.defaultVisible);
  };
  const v = r.rubros[rubro].modules;
  const hab = new Set(v.enabled.map(String));
  const ocu = new Set(v.hidden.map(String));
  const pro = new Set(v.comingSoon.map(String));
  const conocidas = new Set(r.idsDelPanel);
  const barra = [];
  const pronto = [];
  const celular = [];
  for (const cat of r.categorias) {
    for (const t of cat.tabs) {
      if (!permitidas.has(t) || ocultaPlantilla(t)) continue;
      // AdminMobileDrawer: categorías ∩ filteredTabs (ALL_TABS, sin rubro).
      if (conocidas.has(t) && (!r.spec.has(t) || r.especialidades.has(t))) celular.push(t);
      // AdminSidebar.applyVerticalFilter
      if (r.spec.has(t)) {
        if (r.especialidades.has(t)) barra.push(t);
        continue;
      }
      if (ocu.has(t)) continue;
      if (pro.has(t)) {
        pronto.push(t);
        continue;
      }
      if (hab.size === 0 || hab.has(t)) barra.push(t);
    }
  }
  return { barra, pronto, celular };
}

/** Guarda cada lista una sola vez: 448 combinaciones caben en ~decenas de conjuntos. */
export function crearDiccionario() {
  const conjuntos = {};
  const porClave = new Map();
  return {
    conjuntos,
    id(lista) {
      const clave = lista.join("\n");
      let id = porClave.get(clave);
      if (!id) {
        id = `c${porClave.size}`;
        porClave.set(clave, id);
        conjuntos[id] = lista;
      }
      return id;
    },
  };
}

/** ¿El conjunto tiene a la pestaña entera («hub») o alguna de sus vistas («hub:x»)? */
function tieneHub(conjunto, hub) {
  if (conjunto.has(hub)) return true;
  for (const x of conjunto) if (x.startsWith(`${hub}:`)) return true;
  return false;
}

/**
 * Las pestañas que abren el hub de otra (`fiados` → `plata`): la línea base las
 * guarda en `hubs` para saber, después de mudar cosas, dónde caía cada origen.
 */
export function hubsDe(componentes, hubDe) {
  const hubs = {};
  for (const tab of [...componentes.keys()].sort()) {
    const hub = hubDe(tab);
    if (hub !== tab) hubs[tab] = hub;
  }
  return hubs;
}

/** Un par de antes, llevado a su casa de hoy con `resolverDestino` (alias y vistas que se mudaron). */
export function llevarPar(par, resolver) {
  const [tab, vista] = par.split(":");
  const d = resolver(tab, vista ?? null);
  if (!d) return par;
  return d.vista ? `${d.tab}:${d.vista}` : d.tab;
}

/**
 * @typedef {{ key: string, origen?: readonly string[] }} VistaConOrigen
 * @typedef {{
 *   vistasDe?: (hub: string) => readonly VistaConOrigen[],
 *   hubDeAntes?: (tab: string) => string,
 * }} OpcionesComparar
 */

/**
 * Antes vs después de UNA superficie de una combinación.
 * perdidas = pares de antes que hoy no alcanza; nuevas = pares que antes no alcanzaba.
 *
 * Un par exacto (o llevado por `resolverDestino`) cubre al de hoy. Una pestaña
 * que en la línea base no tenía vistas registradas es el par «hub» entero, y
 * sus vistas de hoy se miran POR ORIGEN (regla R2):
 *   · «hub» de antes cubre a «hub:x» sólo si x es contenido suyo (su origen
 *     incluye a hub). Lo que llegó de otra pestaña («pedidos:reparto» ←
 *     delivery-partners) es alta salvo que su origen se alcanzara antes. Sin
 *     esto, lo que se fundía en una pestaña sin vistas se le regalaba a todo el
 *     que la veía (revisión de la ola 1);
 *   · «hub» de antes no se pierde mientras hoy se alcance alguna vista propia:
 *     no basta una que llegó de otro lado.
 * Un hub que ya tenía vistas en la línea base se compara par por par.
 *
 * @param {readonly string[]} antes
 * @param {readonly string[]} despues
 * @param {(tab: string, vista?: string | null) => { tab: string, vista?: string } | null} resolver
 * @param {OpcionesComparar} [opciones] `vistasDe` = el registro de hoy;
 *   `hubDeAntes` = `linea.hubs`. Sin ellos, toda vista es contenido de su hub.
 */
export function compararPares(antes, despues, resolver, opciones = {}) {
  const { vistasDe = () => [], hubDeAntes = (tab) => tab } = opciones;
  const hoy = new Set(despues);
  const deAntes = new Set(antes);
  const llevados = new Set(antes.map((p) => llevarPar(p, resolver)));
  const origenDe = (hub, vista) => {
    const v = vistasDe(hub).find((x) => x.key === vista);
    return v?.origen?.length ? v.origen : [hub];
  };
  const esPropia = (par) => {
    const [hub, vista] = par.split(":");
    return origenDe(hub, vista).includes(hub);
  };

  /** ¿Hoy se sigue alcanzando el par de antes `p`? */
  const sigue = (p) => {
    if (hoy.has(p)) return true;
    const [hub, vista] = p.split(":");
    // Una vista de antes, si hoy la pestaña se abre entera.
    if (vista !== undefined) return hoy.has(hub);
    for (const x of hoy) if (x.startsWith(`${hub}:`) && esPropia(x)) return true;
    return false;
  };

  /** ¿El par de hoy `p` ya se alcanzaba antes? */
  const yaEstaba = (p) => {
    if (deAntes.has(p) || llevados.has(p)) return true;
    const [hub, vista] = p.split(":");
    // La pestaña entera hoy, si antes se veían sus vistas.
    if (vista === undefined) return tieneHub(deAntes, hub) || tieneHub(llevados, hub);
    return origenDe(hub, vista).some((o) =>
      o === hub ? deAntes.has(hub) || llevados.has(hub) : tieneHub(deAntes, hubDeAntes(o)),
    );
  };

  const perdidas = antes.filter((p) => !sigue(p) && !sigue(llevarPar(p, resolver)));
  const nuevas = despues.filter((p) => !yaEstaba(p));
  return { perdidas, nuevas };
}

/** ¿Una alta está aprobada? `contexto` y `superficie` de la alta, si vienen, tienen que coincidir. */
export function altaAprobada(altas, { contexto, superficie, par }) {
  return altas.some(
    (a) =>
      a.par === par &&
      (!a.superficie || a.superficie === superficie) &&
      Object.entries(a.contexto ?? {}).every(([k, v]) => contexto[k] === v),
  );
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function cargarRegistros() {
  const { tsImport } = await import("tsx/esm/api");
  const ts = (ruta) => tsImport(pathToFileURL(join(RAIZ, ruta)).href, import.meta.url);
  const [datos, cats, planes, permisos, specs, plantilla, rubros, subvistas, merge] = await Promise.all([
    ts("app/admin/_lib/tab-data.ts"),
    ts("app/admin/_lib/tab-categories.ts"),
    ts("lib/billing/plan-tiers.ts"),
    ts("lib/module-permissions.ts"),
    ts("hooks/use-enabled-specs.ts"),
    ts("lib/admin-template.ts"),
    ts("lib/verticals/registry.ts"),
    ts("lib/admin/subvistas-modulos.ts"),
    ts("lib/tenant-module-overrides.ts"),
  ]);
  const spec = specs.SPEC_GATED_MODULE_IDS;
  return {
    idsDelPanel: datos.ALL_TABS.map((t) => t.id),
    categorias: cats.TAB_CATEGORIES.map((c) => ({ id: c.id, tabs: [...c.tabs] })),
    planes: planes.PLANS,
    permisos: permisos.MODULE_PERMISSIONS,
    spec,
    especialidades: spec,
    catalogo: plantilla.ADMIN_MODULE_CATALOG,
    rubros: rubros.VERTICAL_REGISTRY,
    industrias: [...rubros.SUPPORTED_INDUSTRIES],
    vistasDe: (tab) => subvistas.vistasDelModulo(tab),
    mergeTenantOverrides: merge.mergeTenantOverrides,
  };
}

/** Las plantillas, READ ONLY: la global y la de cada negocio con override, ya mergeadas como las sirve la API. */
function leerPlantillas(r) {
  const sql =
    'select s.key, s.value, t.slug from "PlatformSetting" s left join "Tenant" t on t.id = substring(s.key from 23) ' +
    "where s.key = $1 or s.key like $2 order by s.key";
  const res = spawnSync(
    process.execPath,
    [join(RAIZ, "scripts/sql-lectura.mjs"), "--json", "--max", "100", sql, "admin-template", "admin-template:tenant:%"],
    { cwd: RAIZ, encoding: "utf8", timeout: 60_000 },
  );
  if (res.status !== 0) throw new Error(`sql-lectura falló: ${res.stderr || res.stdout}`.slice(0, 600));
  const filas = JSON.parse(res.stdout.slice(res.stdout.indexOf("[")));
  const global = filas.find((f) => f.key === "admin-template")?.value ?? { overrides: {}, order: [], version: 2 };
  const plantillas = { global: global.overrides ?? {} };
  for (const f of filas) {
    if (f.key === "admin-template") continue;
    plantillas[f.slug ?? f.key] = r.mergeTenantOverrides(global, f.value).overrides;
  }
  return plantillas;
}

function calcular(r, plantillas, src) {
  const componentes = componentesDeTabRouter(src.tabRouter);
  const hubDe = crearHubDe(componentes, (t) => r.vistasDe(t).length > 0);
  const dic = crearDiccionario();
  const contextos = [];
  let pronto = 0;
  for (const plan of PLANES) {
    for (const rol of ROLES) {
      for (const rubro of r.industrias) {
        for (const [plantilla, overrides] of Object.entries(plantillas)) {
          const v = visibilidadDeAntes(r, { plan, rol, rubro, overrides });
          const fila = {
            plan,
            rol,
            rubro,
            plantilla,
            barra: dic.id(paresDe(v.barra, hubDe, r.vistasDe)),
            celular: dic.id(paresDe(v.celular, hubDe, r.vistasDe)),
          };
          if (v.pronto.length) {
            fila.pronto = v.pronto;
            pronto++;
          }
          contextos.push(fila);
        }
      }
    }
  }
  const menu = dic.id(paresDe(idsDelMenuDeUsuario(src.menu), hubDe, r.vistasDe));
  return { contextos, conjuntos: dic.conjuntos, menu, pronto, hubs: hubsDe(componentes, hubDe) };
}

function tablaDeRegistros() {
  const R = (f) => (existsSync(join(RAIZ, f)) ? readFileSync(join(RAIZ, f), "utf8") : "");
  const comillas = (s) => [...s.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
  const entre = (s, a, b) => {
    const i = s.indexOf(a);
    if (i < 0) return "";
    const j = b ? s.indexOf(b, i + a.length) : -1;
    return s.slice(i, j < 0 ? s.length : j);
  };
  const claves = (s) => [...s.matchAll(/^ {2,4}"?([a-z0-9-]+)"?\s*:/gm)].map((m) => m[1]);
  const sinComentarios = (s) => s.replace(/\/\/.*$/gm, "");
  const td = R("app/admin/_lib/tab-data.ts");
  const todos = [...entre(td, "export const ALL_TABS", "export type TabItem").matchAll(/id:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
  const tc = sinComentarios(R("app/admin/_lib/tab-categories.ts"));
  const sv = R("lib/admin/subvistas-modulos.ts");
  const pt = sinComentarios(R("lib/billing/plan-tiers.ts"));
  const vr = sinComentarios(R("lib/verticals/registry.ts"));
  const tr = R("app/admin/_components/TabRouter.tsx");
  const col = {
    G: new Set([...entre(tc, "export const BASIC_MODULES", "const byId").matchAll(/tabs:\s*\[([^\]]*)\]/g)].flatMap((m) => comillas(m[1]))),
    I: new Set(claves(entre(tc, "export const MODULE_INFO", "export type TabCategory"))),
    E: new Set(comillas(entre(tc, "export const EASY_MODE_TABS", "]);"))),
    T: new Set([...entre(R("lib/admin-template.ts"), "export const ADMIN_MODULE_CATALOG", "export const MODULE_SCOPE_BY_ID").matchAll(/id:\s*"([a-z0-9-]+)"/g)].map((m) => m[1])),
    P: new Set(claves(entre(R("app/admin/_lib/tab-preload.ts"), "const TAB_LOADERS", "const preloaded"))),
    S: new Set([
      ...claves(entre(sv, "export const VISTAS_POR_MODULO", "export const VISTAS_LOCALES_POR_MODULO")),
      ...claves(entre(sv, "export const VISTAS_LOCALES_POR_MODULO", "export interface SubvistaAnidada")),
    ]),
    $: new Set([...pt.matchAll(/unlockedTabs:\s*new Set<Tab>\(\[([\s\S]*?)\]\)/g)].flatMap((m) => comillas(m[1]))),
    V: new Set([...comillas(entre(vr, "const CORE_BASE", "];")), ...comillas(entre(vr, "const ALL_CURRENT", "];"))]),
    R: new Set([...tr.matchAll(/tab === "([a-z0-9-]+)"/g)].map((m) => m[1])),
  };
  const ocultoEnRubro = {};
  for (const m of vr.matchAll(/hidden:\s*\[([^\]]*)\]/g)) for (const id of comillas(m[1])) ocultoEnRubro[id] = (ocultoEnRubro[id] || 0) + 1;
  console.log("G=grupo barra I=MODULE_INFO E=Modo Fácil T=plantilla P=preload S=vistas $=algún plan V=rubro R=TabRouter | oc=rubros que la ocultan");
  for (const id of todos) {
    const f = Object.entries(col).map(([k, s]) => (s.has(id) ? k : "·")).join("");
    console.log(id.padEnd(24), f, ocultoEnRubro[id] ? `oc=${ocultoEnRubro[id]}` : "");
  }
  console.log("ALL_TABS", todos.length, "· sin rama en TabRouter:", todos.filter((x) => !col.R.has(x)).join(" ") || "ninguna");
}

/** Una combinación y un conjunto por línea: el diff de la línea base se lee de un vistazo. */
function serializar(salida) {
  const { contextos, conjuntos, ...cabecera } = salida;
  const partes = Object.entries(cabecera).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  partes.push(` "contextos": [\n${contextos.map((c) => `  ${JSON.stringify(c)}`).join(",\n")}\n ]`);
  partes.push(
    ` "conjuntos": {\n${Object.entries(conjuntos)
      .map(([id, lista]) => `  ${JSON.stringify(id)}: ${JSON.stringify(lista)}`)
      .join(",\n")}\n }`,
  );
  return `{\n${partes.join(",\n")}\n}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--registros")) return tablaDeRegistros();

  const r = await cargarRegistros();
  const src = {
    tabRouter: readFileSync(join(RAIZ, "app/admin/_components/TabRouter.tsx"), "utf8"),
    menu: readFileSync(join(RAIZ, "components/admin/AdminUserDropdown.tsx"), "utf8"),
  };
  const plantillas = leerPlantillas(r);
  const { contextos, conjuntos, menu, pronto, hubs } = calcular(r, plantillas, src);

  const iVer = args.indexOf("--ver");
  if (iVer >= 0) {
    const [plan, rol, rubro, plantilla] = (args[iVer + 1] ?? "").split(",");
    const c = contextos.find((x) => x.plan === plan && x.rol === rol && x.rubro === rubro && x.plantilla === plantilla);
    if (!c) {
      console.error(`Sin esa combinación. Plantillas: ${Object.keys(plantillas).join(", ")}`);
      process.exit(2);
    }
    console.log(JSON.stringify({ ...c, barra: conjuntos[c.barra], celular: conjuntos[c.celular], menu: conjuntos[menu] }, null, 1));
    return;
  }

  const salida = {
    version: 1,
    medido: new Date().toISOString(),
    regla: "barra al 2026-10-09: useAdminTabsDerived + AdminSidebar + AdminMobileDrawer (portada en scripts/matriz-pestanas.mjs)",
    supuestos: [
      "especializaciones: todas encendidas",
      "sin preferencias del usuario (ocultos, favoritos, recientes)",
      "Modo Fácil apagado (EASY_MODE_TABS no tiene lector)",
      "par = hub:vista; hub = la pestaña con vistas registradas que monta el mismo componente (TabRouter)",
    ],
    dimensiones: { planes: PLANES, roles: ROLES, rubros: r.industrias, plantillas: Object.keys(plantillas) },
    plantillas,
    hubs,
    menu,
    contextos,
    conjuntos,
  };

  const distintos = Object.keys(conjuntos).length;
  console.log(
    `${contextos.length} combinaciones (${PLANES.length} planes × ${ROLES.length} roles × ${r.industrias.length} rubros × ${Object.keys(plantillas).length} plantillas) · ${distintos} conjuntos distintos · «Pronto» en ${pronto}`,
  );
  const tam = (id) => conjuntos[id].length;
  for (const plan of PLANES) {
    const fila = contextos.filter((c) => c.plan === plan && c.plantilla === "global" && c.rubro === "bodega");
    console.log(
      `  ${plan.padEnd(10)} bodega·global  barra: ${ROLES.map((rol) => `${rol} ${tam(fila.find((c) => c.rol === rol).barra)}`).join(" · ")}`,
    );
  }

  const rutaAntes = join(RAIZ, RUTA_ANTES);
  if (existsSync(rutaAntes) && !args.includes("--escribir")) {
    const antes = JSON.parse(readFileSync(rutaAntes, "utf8"));
    let cambios = 0;
    for (const c of contextos) {
      const a = antes.contextos.find((x) => x.plan === c.plan && x.rol === c.rol && x.rubro === c.rubro && x.plantilla === c.plantilla);
      if (!a) continue;
      for (const s of ["barra", "celular"]) {
        const ya = antes.conjuntos[a[s]].join("\n");
        if (ya !== conjuntos[c[s]].join("\n")) cambios++;
      }
    }
    // Pestañas que hoy abren otro hub que en la línea base (TabRouter cambió): el test mira orígenes con los de antes.
    const hubsMovidos = Object.keys({ ...antes.hubs, ...hubs }).filter((t) => antes.hubs?.[t] !== hubs[t]);
    console.log(
      `Contra ${RUTA_ANTES} (${antes.medido}): ${cambios} superficies distintas · hubs que cambiaron: ${hubsMovidos.join(" ") || "ninguno"}. --escribir para reemplazarla.`,
    );
    return;
  }
  mkdirSync(dirname(rutaAntes), { recursive: true });
  writeFileSync(rutaAntes, serializar(salida));
  const rutaAltas = join(RAIZ, RUTA_ALTAS);
  if (!existsSync(rutaAltas)) {
    writeFileSync(
      rutaAltas,
      `${JSON.stringify({ nota: "Pares nuevos que Brandon aprobó (formato: {par, superficie?, contexto?, porque, aprobo}). Nace vacío.", altas: [] }, null, 1)}\n`,
    );
  }
  console.log(`Escrito ${RUTA_ANTES}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
